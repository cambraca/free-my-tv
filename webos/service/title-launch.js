'use strict';

var os = require('os');
var Watchlist = require('./watchlist');
var mubiIds = {}, commandId = Math.floor(Date.now() / 1000);

exports.mubiTarget = function (target, request, done) {
  var match = /^https?:\/\/(?:www\.)?mubi\.com\/(?:[a-z]{2}\/)?(?:films|movies)\/([a-z0-9-]+)(?:[/?#]|$)/i.exec(target || '');
  if (!match) { done(new Error('MUBI film URL is missing.')); return; }
  var slug = match[1];
  if (mubiIds[slug]) { done(null, mubiIds[slug]); return; }
  request('GET', 'https://mubi.com/en/films/' + slug, {Accept: 'text/html'}, null, function (err, html) {
    if (err) { done(err); return; }
    var data = /<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(typeof html === 'string' ? html : '');
    var film = null;
    try { film = JSON.parse(data[1]).props.pageProps.initFilm; } catch (error) {}
    if (!film || film.slug !== slug || !/^\d+$/.test(String(film.id || ''))) {
      done(new Error('MUBI returned no matching film ID.')); return;
    }
    mubiIds[slug] = String(film.id);
    done(null, mubiIds[slug]);
  }, 0, 8000);
};

exports.openPlex = function (config, snapshot, imdbId, request, done) {
  if (!Watchlist.valid(snapshot, config) || !config.plexHost || !/^tt\d+$/.test(imdbId || '')) {
    done(new Error('Plex title data is unavailable.')); return;
  }
  var entry = null;
  for (var index = 0; index < snapshot.entries.length; index++) {
    if (snapshot.entries[index].imdbId === imdbId) { entry = snapshot.entries[index]; break; }
  }
  var items = snapshot.plex && snapshot.plex.items || {}, resolved = entry && entry.resolved;
  var local = entry && (items['imdb:' + imdbId] || resolved && items[resolved.kind + ':' + resolved.id]);
  if (!local || !local.machine || !/^\d+$/.test(local.ratingKey || '')) {
    done(new Error('Plex library match is unavailable.')); return;
  }
  var base = 'http://' + config.plexHost + ':' + (config.plexPort || 32400);
  var addresses = [], interfaces;
  try { interfaces = os.networkInterfaces(); }
  catch (error) { done(new Error('Plex could not identify this TV on the network.')); return; }
  for (var name in interfaces) if (interfaces.hasOwnProperty(name)) {
    (interfaces[name] || []).forEach(function (network) {
      if (!network.internal) addresses.push(network.address.replace(/^::ffff:/, ''));
    });
  }
  var deadline = Date.now() + 10000, attempts = 0;
  function get(path, headers, callback) {
    headers['X-Plex-Client-Identifier'] = 'io.freemytv';
    headers['X-Plex-Product'] = 'Free My TV';
    headers['X-Plex-Provides'] = 'controller';
    if (config.plexToken) headers['X-Plex-Token'] = config.plexToken;
    request('GET', base + path, headers, null, callback, 0, 3000);
  }
  function retry(error) {
    if (++attempts >= 6 || Date.now() + 1000 >= deadline) { done(error); return; }
    setTimeout(findClient, 1000);
  }
  function findClient() {
    if (Date.now() >= deadline) { done(new Error('Plex player did not become ready.')); return; }
    get('/clients', {Accept: 'application/xml'}, function (err, data) {
      if (err) { retry(err); return; }
      var clients = data && data.MediaContainer && data.MediaContainer.Server || [], candidates = [];
      if (typeof data === 'string') {
        var serverPattern = /<Server\b([^>]*)>/gi, serverMatch;
        while ((serverMatch = serverPattern.exec(data))) {
          var attributes = {}, attributePattern = /([a-zA-Z]+)=["']([^"']*)["']/g, attributeMatch;
          while ((attributeMatch = attributePattern.exec(serverMatch[1]))) attributes[attributeMatch[1]] = attributeMatch[2];
          clients.push(attributes);
        }
      }
      for (var clientIndex = 0; clientIndex < clients.length; clientIndex++) {
        var client = clients[clientIndex], address = String(client.host || client.address || '').replace(/^::ffff:/, '');
        if (addresses.indexOf(address) >= 0 && /plex.*(?:lg|webos)|webos/i.test(client.product || client.platform || '')
            && /(?:^|,)mirror(?:,|$)/.test(client.protocolCapabilities || '') && client.machineIdentifier) candidates.push(client);
      }
      if (candidates.length !== 1) { retry(new Error('Plex must advertise this TV as a controllable player.')); return; }
      if (Date.now() >= deadline) { done(new Error('Plex player did not become ready.')); return; }
      var query = {key: '/library/metadata/' + local.ratingKey, machineIdentifier: local.machine,
        address: config.plexHost, port: config.plexPort || 32400, protocol: 'http', commandID: ++commandId};
      var parameters = [];
      for (var key in query) if (query.hasOwnProperty(key)) parameters.push(key + '=' + encodeURIComponent(query[key]));
      get('/player/mirror/details?' + parameters.join('&'), {Accept: 'application/xml',
        'X-Plex-Target-Client-Identifier': candidates[0].machineIdentifier}, function (commandError, response) {
        if (commandError) { retry(commandError); return; }
        if (typeof response === 'string' && /<Response\b[^>]*\bcode=["']200["']/i.test(response)
            || response && typeof response === 'object' && (response.code === 200 || response.Response && Number(response.Response.code) === 200)) {
          done(null); return;
        }
        retry(new Error('Plex rejected the title navigation command.'));
      });
    });
  }
  setTimeout(findClient, 1000);
};
