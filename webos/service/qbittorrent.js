'use strict';
// Shared by the webOS service and localhost preview. Never sends credentials to the UI.
var fs = require('fs'), http = require('http'), https = require('https'), URL = require('url');
var qs = require('querystring'), crypto = require('crypto');
module.exports = function (config, filename, getSnapshot, refresh) {
  var base = config.qbitUrl, cookie = '', jobs = {}, searches = {}, lastPoll = 0, busy = false;
  var retryAfter = 0;
  var identity = crypto.createHash('sha256').update((base || '') + '|' + (config.imdbUserId || '')).digest('hex');
  try { var saved = JSON.parse(fs.readFileSync(filename, 'utf8')); if (saved.identity === identity) jobs = saved.jobs || {}; } catch (e) {}
  function save() {
    fs.writeFileSync(filename + '.tmp', JSON.stringify({identity: identity, jobs: jobs}));
    fs.renameSync(filename + '.tmp', filename);
  }
  function raw(method, route, data, done) {
    var body = qs.stringify(data || {}), options = URL.parse(base + '/api/v2/' + route);
    options.method = method;
    options.headers = {Referer: base, Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded'};
    if (method === 'GET' && body) options.path += '?' + body;
    else if (method === 'POST') options.headers['Content-Length'] = Buffer.byteLength(body);
    var complete = false;
    function finish(err, value) { if (complete) return; complete = true; done(err, value); }
    var req = (options.protocol === 'https:' ? https : http).request(options, function (res) {
      var chunks = [], size = 0;
      res.on('data', function (chunk) { size += chunk.length; if (size > 8 * 1024 * 1024) { req.abort(); finish(new Error('qBittorrent response too large')); } else chunks.push(chunk); });
      res.on('error', function () { finish(new Error('qBittorrent connection failed')); });
      res.on('end', function () {
        if (res.statusCode !== 200) { if (res.statusCode === 403) cookie = ''; var detail = Buffer.concat(chunks).toString('utf8').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 300); finish(new Error('qBittorrent ' + route + ': HTTP ' + res.statusCode + (detail ? ' — ' + detail : ''))); return; }
        if (res.headers['set-cookie']) cookie = res.headers['set-cookie'].map(function (c) { return c.split(';')[0]; }).join('; ');
        var value = Buffer.concat(chunks).toString('utf8');
        try { value = JSON.parse(value); } catch (e) {}
        finish(null, value);
      });
    });
    req.setTimeout(10000, function () { req.abort(); finish(new Error('qBittorrent timed out')); });
    req.on('error', function () { finish(new Error('qBittorrent is unavailable')); });
    req.end(method === 'POST' ? body : undefined);
  }
  function api(method, route, data, done) {
    if (cookie || !config.qbitUsername) { raw(method, route, data, done); return; }
    raw('POST', 'auth/login', {username: config.qbitUsername, password: config.qbitPassword}, function (err, value) {
      if (err || value !== 'Ok.') { done(err || new Error('qBittorrent login failed')); return; }
      raw(method, route, data, done);
    });
  }
  function pick(id) {
    var picks = (getSnapshot() || {}).picks || [];
    return picks.filter(function (p) { return (p.imdbId || p.id) === id; })[0];
  }
  function resultId(result) { return crypto.createHash('sha256').update(result.fileUrl + '|' + (result.engineName || '')).digest('hex'); }
  function available(p) { return p && (p.options || []).length > 0; }
  function prune() {
    Object.keys(jobs).forEach(function (key) { var job = jobs[key], current = pick(job.imdbId);
      if (!current || available(current) && (!job.initiallyAvailable || job.complete && (getSnapshot() || {}).updatedAt > job.snapshotAt)) delete jobs[key]; });
  }
  function poll(fast, done) {
    prune(); save();
    if (Date.now() < retryAfter) { done(null); return; }
    if (busy || Date.now() - lastPoll < (fast ? 5000 : 60000) || !Object.keys(jobs).length) { done(null); return; }
    busy = true; lastPoll = Date.now();
    var active = Object.keys(jobs).filter(function (k) { return !jobs[k].complete; });
    function finish(err) { busy = false; if (err) retryAfter = Date.now() + 60000; if (!err) { save(); if (Object.keys(jobs).some(function (k) { return jobs[k].complete; })) refresh(); } done(err); }
    if (!active.length) { finish(null); return; }
    // Tags correlate HTTP .torrent results too, where no info hash is known before adding.
    api('GET', 'torrents/info', {tag: 'fmtv'}, function (err, torrents) {
      if (err || !Array.isArray(torrents)) { finish(err || new Error('Invalid torrent response')); return; }
      active.forEach(function (key) {
        var job = jobs[key], torrent = torrents.filter(function (t) { return job.hash ? t.hash === job.hash : (t.tags || '').split(',').map(function (s) { return s.trim(); }).indexOf(job.tag) >= 0; })[0];
        if (!torrent) { job.state = job.hash ? 'Removed from qBittorrent' : 'Waiting for torrent metadata'; return; }
        job.hash = torrent.hash; job.progress = torrent.progress; job.state = torrent.state;
        job.complete = Number(torrent.amount_left) === 0 && Number(torrent.progress) >= 1;
      });
      finish(null);
    });
  }
  function handle(payload, done) {
    if (!base) { done(null, {enabled: false}); return; }
    var action = payload.action || 'status', p = pick(payload.imdbId), season = Math.max(1, Math.min(999, Math.floor(Number(payload.season) || 1)));
    if (action === 'status') {
      poll(!!payload.imdbId, function (err) { done(err, {enabled: true, snapshotAt: (getSnapshot() || {}).updatedAt || 0, jobs: Object.keys(jobs).map(function (key) { return jobs[key]; })}); }); return;
    }
    if (action === 'cancel') {
      var owned = searches[payload.searchId];
      if (!owned || owned.imdbId !== payload.imdbId) { done(null, {cancelled: true}); return; }
      api('POST', 'search/delete', {id: payload.searchId}, function (err) {
        if (err && !/HTTP 404/.test(err.message)) { done(err); return; }
        delete searches[payload.searchId]; done(null, {cancelled: true});
      }); return;
    }
    if (action === 'search' && searches[payload.previousSearchId]) {
      handle({action: 'cancel', searchId: payload.previousSearchId, imdbId: payload.imdbId}, function (err) {
        if (err) { done(err); return; }
        var next = {}; Object.keys(payload).forEach(function (key) { if (key !== 'previousSearchId') next[key] = payload[key]; });
        handle(next, done);
      }); return;
    }
    if (!p) { done(new Error('Title is no longer in the watchlist')); return; }
    if (action === 'seasons') {
      var snapshot = getSnapshot(), local = snapshot && snapshot.plex && snapshot.plex.items['imdb:' + payload.imdbId];
      if (!local || !config.plexHost) { done(null, {seasons: [], next: 1}); return; }
      var network;
      try { network = require('./watchlist-network'); } catch (e) { network = require('../../tools/watchlist-network'); }
      network('GET', 'http://' + config.plexHost + ':' + config.plexPort + '/library/metadata/' + encodeURIComponent(local.ratingKey) + '/children',
        {Accept: 'application/json', 'X-Plex-Token': config.plexToken || ''}, null, function (err, value) {
          if (err || !value || !value.MediaContainer || !Array.isArray(value.MediaContainer.Metadata)) { done(err || new Error('Could not read Plex seasons')); return; }
          var seasons = value.MediaContainer.Metadata.filter(function (s) { return s.type === 'season' && s.leafCount > 0 && s.index > 0; }).map(function (s) { return Number(s.index); });
          var next = 1; while (seasons.indexOf(next) >= 0) next++;
          done(null, {seasons: seasons, next: next});
        }); return;
    }
    if (action === 'search') {
      api('GET', 'search/plugins', {}, function (err, plugins) {
        if (err) { done(err); return; }
        var category = p.kind === 'tv' ? 'tv' : 'movies';
        var names = (Array.isArray(plugins) ? plugins : []).filter(function (plugin) {
          return plugin.enabled && (plugin.supportedCategories || []).some(function (c) { return c.id === category; });
        }).map(function (plugin) { return plugin.name; });
        if (!names.length) { done(new Error('Enable a qBittorrent search plugin supporting ' + category)); return; }
        var pattern = p.title + (p.kind === 'tv' ? ' S' + (season < 10 ? '0' : '') + season : ' ' + (p.year || ''));
        api('POST', 'search/start', {pattern: pattern, plugins: names.join('|'), category: category}, function (error, result) {
          if (error || !result || result.id === undefined) { done(error || new Error('Could not start search')); return; }
          var id = result.id;
          searches[id] = {imdbId: payload.imdbId, season: season, results: [], at: Date.now()};
          // Expire our own searches without touching searches started in the Web UI.
          Object.keys(searches).forEach(function (key) { if (Date.now() - searches[key].at > 300000) { delete searches[key]; api('POST', 'search/stop', {id: key}, function () { api('POST', 'search/delete', {id: key}, function () {}); }); } });
          done(null, {searchId: id});
        });
      }); return;
    }
    var search = searches[payload.searchId];
    if (!search || search.imdbId !== payload.imdbId) { done(new Error('Search expired; search again')); return; }
    if (action === 'results') {
      var collected = [];
      function page() {
      api('GET', 'search/results', {id: payload.searchId, limit: 500, offset: collected.length}, function (err, result) {
        if (err || !result || !Array.isArray(result.results)) { done(err || new Error('Invalid search results')); return; }
        collected = collected.concat(result.results);
        if (result.results.length && collected.length < Number(result.total)) { page(); return; }
        search.results = collected.filter(function (r) {
          // Prefer full season releases: reject explicit single episode releases.
          return p.kind !== 'tv' || !/(?:s\d{1,3}[ ._-]*e\d{1,3}|\d{1,3}x\d{2})/i.test(r.fileName);
        }).sort(function (a, b) { return Number(b.nbSeeders) - Number(a.nbSeeders); });
        done(null, {running: result.status === 'Running', results: search.results.map(function (r, i) {
          return {id: resultId(r), index: i, name: r.fileName, seeds: r.nbSeeders, peers: r.nbLeechers, size: r.fileSize};
        })});
      });
      }
      page(); return;
    }
    if (action !== 'download') { done(new Error('Unknown action')); return; }
    var result = payload.resultId ? search.results.filter(function (r) { return resultId(r) === payload.resultId; })[0] : search.results[Number(payload.index)], key = payload.imdbId + ':' + (p.kind === 'tv' ? search.season : 0);
    if (jobs[key]) { done(new Error('Already tracking a download for this title/season')); return; }
    if (!result || !/^(magnet:\?|https?:\/\/)/i.test(result.fileUrl)) { done(new Error('Invalid torrent URL')); return; }
    var tag = 'fmtv-' + crypto.randomBytes(8).toString('hex');
    jobs[key] = {imdbId: payload.imdbId, season: p.kind === 'tv' ? search.season : 0, tag: tag, initiallyAvailable: available(p), snapshotAt: (getSnapshot() || {}).updatedAt || 0, progress: 0, state: 'Adding torrent'};
    // Persist intent before the network mutation so a restart can recover the tag.
    save();
    api('POST', 'torrents/add', {urls: result.fileUrl, savepath: p.kind === 'tv' ? config.qbitShowsPath : config.qbitMoviesPath,
      autoTMM: 'false', stopped: 'false', tags: 'fmtv,' + tag}, function (err, value) {
      if (err || value !== 'Ok.') { jobs[key].state = 'Add unconfirmed; check qBittorrent'; save(); done(err || new Error('qBittorrent did not confirm the download')); return; }
      lastPoll = 0; done(null, {started: true});
    });
  }
  return handle;
};
