'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const titleRatings = require('../webos/service/title-ratings');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fmtv-ratings-'));
const filename = path.join(directory, 'ratings.json');
const week = 7 * 24 * 3600000;
let now = 5 * week, offline = false;
Date.now = () => now;
const config = {tmdbKey: 'test-key'};
const pick = {imdbId: 'tt123', kind: 'movie', tmdbId: 42, imdbRatingCheckedAt: now, tmdbRatingCheckedAt: now};
const requests = [];

function request(method, url, headers, body, done) {
  requests.push(url);
  if (offline) { queueMicrotask(() => done(new Error('Offline'))); return; }
  let response;
  if (url.includes('srsearch=')) response = {query: {search: [{title: 'Q123'}]}};
  else if (url.includes('property=P1258')) response = {P1258: [{value: {content: 'm/example'}}]};
  else if (url.includes('property=P1712')) response = {P1712: [{value: {content: 'movie/example'}}]};
  else if (url === 'https://www.rottentomatoes.com/m/example') {
    response = '<link rel="canonical" href="' + url + '"><script id="media-scorecard-json">'
      + '{"criticsScore":{"scorePercent":"0%"},"audienceScore":{"scorePercent":"99%"}}</script>';
  } else if (url === 'https://www.metacritic.com/movie/example/') {
    response = '<script type="application/ld+json">' + JSON.stringify({
      '@type': 'Movie', url, aggregateRating: {name: 'Metascore', ratingValue: 74}
    }) + '</script>';
  } else if (url.startsWith('https://api.graphql.imdb.com/')) {
    response = {data: {title: {id: pick.imdbId, ratingsSummary: {aggregateRating: 8.4}}}};
  } else {
    assert.match(url, /themoviedb\.org\/3\/movie\/42\?/);
    response = {id: 42, vote_count: 20, vote_average: 7.8};
  }
  queueMicrotask(() => done(null, response));
}

async function run() {
  let lookup = titleRatings(request, filename);
  const open = current => new Promise(resolve => lookup(current, config, resolve));
  const [first, simultaneous] = await Promise.all([open(pick), open(pick)]);
  assert.deepEqual(first, simultaneous);
  assert.deepEqual(first, {
    rottenTomatoes: {id: 'm/example', score: 0, checkedAt: now},
    metacritic: {id: 'movie/example', score: 74, checkedAt: now}
  });
  assert.equal(requests.length, 5);

  lookup = titleRatings(request, filename);
  now += week - 1;
  assert.deepEqual(await open(pick), first);
  assert.equal(requests.length, 5, 'Fresh scores survive a restart without requests');

  now++;
  const refreshed = await open({...pick, imdbRatingCheckedAt: now - 100});
  assert.deepEqual(refreshed.tmdb, {id: 42, score: 7.8, checkedAt: now});
  assert.equal(refreshed.rottenTomatoes.checkedAt, now);
  assert.equal(refreshed.metacritic.checkedAt, now);
  assert.equal(refreshed.imdb, undefined, 'A recent IMDb snapshot avoids its independent lookup');
  assert.equal(requests.length, 11);

  now += week;
  offline = true;
  assert.deepEqual(await open(pick), refreshed, 'Failed refresh retains scores and their original timestamps');
  const failedRequests = requests.length;
  await open(pick);
  assert.equal(requests.length, failedRequests, 'Retry cooldown prevents repeated offline requests');
  now += 60000;
  offline = false;
  const recovered = await open(pick);
  assert.deepEqual(recovered.imdb, {score: 8.4, checkedAt: now});
  assert.equal(recovered.rottenTomatoes.checkedAt, now);
  console.log('TitleRatingsTest: weekly source freshness, persistence, coalescing and offline recovery passed.');
}

run().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => fs.rmSync(directory, {recursive: true, force: true}));
