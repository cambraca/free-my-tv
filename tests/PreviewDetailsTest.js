'use strict';
const assert = require('node:assert/strict');
const createDetails = require('../tools/preview-details');
const pick = {imdbId: 'tt123', tmdbId: 42, kind: 'tv', title: 'Example', note: 'Personal note', options: [{app: 'plex'}]};
const snapshot = {picks: [pick]};
const requests = [];
const loader = createDetails({tmdbKey: 'test-only-key', language: 'en'}, () => snapshot, (method, url, headers, body, done) => {
  requests.push({url, done});
});
function load(id = 'tt123') { return new Promise(resolve => loader(id, (error, value) => resolve({error, value}))); }
async function run() {
  const first = load(), second = load();
  assert.equal(requests.length, 1, 'Deduplicate simultaneous metadata requests');
  assert.match(requests[0].url, /\/tv\/42\?/);
  assert.doesNotMatch(requests[0].url, /watch\/providers/);
  requests[0].done(null, {id: 42, overview: 'Synopsis', genres: [{name: 'Drama'}], vote_count: 5, vote_average: 8.1,
    created_by: [{name: 'Creator'}], credits: {cast: [{name: 'Actor', order: 0}]},
    videos: {results: []}, number_of_seasons: 2, number_of_episodes: 12});
  for (const result of await Promise.all([first, second])) {
    assert.ifError(result.error);
    assert.equal(result.value.note, 'Personal note');
    assert.deepEqual(result.value.credits, {creators: ['Creator'], directors: [], cast: ['Actor']});
    assert.equal(result.value.seasons, 2);
    assert.equal(result.value.episodes, 12);
    assert.equal(result.value.options[0].app, 'plex');
  }
  pick.note = 'Updated note';
  assert.equal((await load()).value.note, 'Updated note', 'Cache enriches the current snapshot');
  assert.equal(requests.length, 1);
  assert.ok((await load('tt999')).error);
  assert.equal(requests.length, 1, 'Never query unknown titles');
  const offline = createDetails({tmdbKey: 'test-only-key'}, () => snapshot, (method, url, headers, body, done) => done(new Error('offline')));
  await new Promise(resolve => offline('tt123', (error, value) => {
    assert.ok(error); assert.equal(value.title, pick.title); assert.equal(value.note, pick.note); resolve();
  }));
  console.log('PreviewDetailsTest: enrichment, request deduplication, cache, unknown-title refusal and offline fallback passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
