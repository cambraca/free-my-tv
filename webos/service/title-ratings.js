'use strict';

var fs = require('fs');
var RT = 'https://www.rottentomatoes.com/';
var METACRITIC = 'https://www.metacritic.com/';
var WIKIDATA = 'https://www.wikidata.org/';
var WEEK = 7 * 24 * 3600000;
var RT_SITE = {property: 'P1258', moviePrefix: 'm', base: RT, suffix: '', readScore: tomatometer};
var METACRITIC_SITE = {property: 'P1712', moviePrefix: 'movie', base: METACRITIC, suffix: '/', readScore: metascore};

function get(request, url, accept, done) {
  request('GET', url, {Accept: accept}, null, done, 0, 3000);
}

function tomatometer(html, url) {
  if (typeof html !== 'string') return undefined;
  var canonical = /<link\s+rel="canonical"\s+href="([^"]+)"/i.exec(html);
  var script = /<script\b[^>]*\bid="media-scorecard-json"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!canonical || canonical[1] !== url || !script) return undefined;
  try {
    var critics = JSON.parse(script[1]).criticsScore;
    var score = critics && /^(100|[0-9]{1,2})%$/.exec(critics.scorePercent);
    return score ? Number(score[1]) : null;
  } catch (error) { return undefined; }
}

function metascore(html, url) {
  if (typeof html !== 'string') return undefined;
  var scripts = /<script\b[^>]*\btype="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi, match;
  while ((match = scripts.exec(html))) {
    var title;
    try { title = JSON.parse(match[1]); } catch (error) { continue; }
    if (!title || title.url !== url || !/^(Movie|TVSeries)$/.test(title['@type'])) continue;
    var rating = title.aggregateRating;
    if (!rating) return null;
    var score = rating.ratingValue;
    if (rating.name === 'Metascore' && typeof score === 'number' && Math.floor(score) === score
        && score >= 0 && score <= 100) return score;
  }
  return undefined;
}

function wikidata(imdbId, request) {
  var waiting = [], result;
  return function item(done) {
    if (result) { done(result.error, result.id); return; }
    waiting.push(done);
    if (waiting.length > 1) return;
    get(request, WIKIDATA + 'w/api.php?action=query&list=search&srnamespace=0&srlimit=2&format=json'
      + '&srsearch=' + encodeURIComponent('haswbstatement:P345=' + imdbId), 'application/json', function (error, data) {
      var matches = data && data.query && data.query.search;
      if (!error && !Array.isArray(matches)) error = new Error('Invalid Wikidata search response');
      var id = !error && matches.length === 1 && matches[0].title;
      result = {error: error, id: /^Q[1-9]\d*$/.test(id || '') ? id : ''};
      waiting.forEach(function (callback) { callback(result.error, result.id); });
    });
  };
}

function reviewSite(pick, request, item, site, done) {
  if (!/^(movie|tv)$/.test(pick.kind)) { done(null, {score: null}); return; }
  item(function (error, id) {
    if (error) { done(error); return; }
    if (!id) { done(null, {score: null}); return; }
    get(request, WIKIDATA + 'w/rest.php/wikibase/v1/entities/items/' + id + '/statements?property=' + site.property,
      'application/json', function (error, statements) {
        if (error) { done(error); return; }
        var paths = [];
        var pattern = new RegExp('^' + (pick.kind === 'tv' ? 'tv' : site.moviePrefix) + '/[a-z0-9_-]+$');
        var claims = statements && statements[site.property];
        (Array.isArray(claims) ? claims : []).forEach(function (statement) {
          var path = statement && statement.value && statement.value.content;
          if (typeof path === 'string' && statement.rank !== 'deprecated' && pattern.test(path) && paths.indexOf(path) < 0) paths.push(path);
        });
        if (paths.length !== 1) { done(null, {score: null}); return; }
        var url = site.base + paths[0] + site.suffix;
        get(request, url, 'text/html', function (error, html) {
          if (error) { done(error); return; }
          var score = site.readScore(html, url);
          if (score === undefined) { done(new Error('Invalid critic scorecard')); return; }
          done(null, {id: paths[0], score: score});
        });
      });
  });
}

function imdb(pick, request, done) {
  request('POST', 'https://api.graphql.imdb.com/', {
    'Content-Type': 'application/json', Accept: 'application/json', 'x-imdb-client-name': 'imdb-web-next'
  }, JSON.stringify({
    query: 'query Rating($id: ID!) { title(id: $id) { id ratingsSummary { aggregateRating } } }',
    variables: {id: pick.imdbId}
  }), function (error, data) {
    var title = data && data.data && data.data.title;
    if (error || !title || title.id !== pick.imdbId) { done(error || new Error('Invalid IMDb rating response')); return; }
    var score = title.ratingsSummary && title.ratingsSummary.aggregateRating;
    done(null, {score: typeof score === 'number' && score > 0 && score <= 10 ? score : null});
  }, 0, 3000);
}

function tmdb(config, pick, request, done) {
  var key = (config.tmdbKey || '').trim();
  if (!key || !/^(movie|tv)$/.test(pick.kind)) { done(null); return; }
  function lookup(path, callback) {
    var bearer = key.indexOf('eyJ') === 0;
    request('GET', 'https://api.themoviedb.org/3' + path
      + (bearer ? '' : (path.indexOf('?') < 0 ? '?' : '&') + 'api_key=' + encodeURIComponent(key)),
      bearer ? {Accept: 'application/json', Authorization: 'Bearer ' + key} : {Accept: 'application/json'}, null, callback, 0, 3000);
  }
  function load(id) {
    lookup('/' + pick.kind + '/' + id, function (error, detail) {
      if (error || !detail || Number(detail.id) !== Number(id) || typeof detail.vote_count !== 'number') {
        done(error || new Error('Invalid TMDB rating response')); return;
      }
      var score = detail.vote_average;
      done(null, {id: detail.id, score: detail.vote_count > 0 && typeof score === 'number' && score >= 0 && score <= 10 ? score : null});
    });
  }
  if (/^[1-9]\d*$/.test(pick.tmdbId || '')) { load(pick.tmdbId); return; }
  lookup('/find/' + pick.imdbId + '?external_source=imdb_id', function (error, data) {
    var matches = data && data[pick.kind === 'tv' ? 'tv_results' : 'movie_results'];
    if (error || !Array.isArray(matches)) { done(error || new Error('Invalid TMDB title lookup')); return; }
    if (matches.length === 1 && /^[1-9]\d*$/.test(matches[0].id || '')) load(matches[0].id);
    else done(null, {score: null});
  });
}

module.exports = function (request, file) {
  var cache = {}, pending = {}, retry = {};
  if (file) {
    try { cache = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch (error) {}
  }
  function save() {
    if (!file) return;
    try {
      fs.writeFileSync(file + '.tmp', JSON.stringify(cache));
      fs.renameSync(file + '.tmp', file);
    } catch (error) { console.warn('Could not save the title ratings cache'); }
  }
  return function ratings(pick, config, done) {
    if (!pick || !/^tt\d+$/.test(pick.imdbId || '')) { done({}); return; }
    var id = pick.imdbId, saved = cache[id] || {}, result = {}, now = Date.now();
    var item = wikidata(id, request);
    var sources = [
      {name: 'tmdb', snapshotAt: pick.tmdbRatingCheckedAt, load: function (finish) { tmdb(config, pick, request, finish); }},
      {name: 'imdb', snapshotAt: pick.imdbRatingCheckedAt, load: function (finish) { imdb(pick, request, finish); }},
      {name: 'rottenTomatoes', load: function (finish) {
        reviewSite(pick, request, item, RT_SITE, finish);
      }},
      {name: 'metacritic', load: function (finish) {
        reviewSite(pick, request, item, METACRITIC_SITE, finish);
      }}
    ];
    var remaining = sources.length;
    sources.forEach(function (source) {
      var name = source.name, key = id + ':' + name, previous = saved[name];
      function deliver(record) {
        if (record) result[name] = record;
        if (!--remaining) done(result);
      }
      var checkedAt = Math.max(source.snapshotAt || 0, previous && previous.checkedAt || 0);
      if (checkedAt > now - WEEK && checkedAt <= now || retry[key] > now) { deliver(previous); return; }
      if (pending[key]) { pending[key].push(deliver); return; }
      pending[key] = [deliver];
      source.load(function (error, record) {
        if (error) retry[key] = Date.now() + 60000;
        else {
          delete retry[key];
          if (record) {
            record.checkedAt = Date.now();
            if (!cache[id]) cache[id] = {};
            cache[id][name] = record;
            save();
          }
        }
        var waiting = pending[key];
        delete pending[key];
        waiting.forEach(function (callback) { callback(record || previous); });
      });
    });
  };
};
