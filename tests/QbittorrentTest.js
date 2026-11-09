'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const create = require('../webos/service/qbittorrent');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fmtv-qbit-'));
let calls = [], complete = false, added, scans = 0, startError = true, reranked = false;
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    const url = new URL(req.url, 'http://localhost');
    calls.push(url.pathname);
    if (url.pathname.endsWith('/auth/login')) {
      assert.equal(new URLSearchParams(body).get('password'), 'private');
      res.setHeader('Set-Cookie', 'SID=test; path=/'); res.end('Ok.'); return;
    }
    assert.equal(req.headers.cookie, 'SID=test');
    if (url.pathname.endsWith('/search/plugins')) res.end(JSON.stringify([{name: 'test', enabled: true, supportedCategories: [{id: 'tv'}]}]));
    else if (url.pathname.endsWith('/search/start')) {
      if (startError) { res.statusCode = 409; res.end('Python must be installed to use the Search Engine.'); return; }
      const params = new URLSearchParams(body);
      assert.equal(params.get('category'), 'tv'); assert.equal(params.get('pattern'), 'Example S02');
      res.end('{"id":42}');
    } else if (url.pathname.endsWith('/search/delete')) res.end();
    else if (url.pathname.endsWith('/search/results')) res.end(JSON.stringify({status: 'Stopped', results: [
      {fileName: 'Example S02 pack', fileUrl: 'magnet:?xt=urn:btih:abc', nbSeeders: reranked ? 200 : 20, nbLeechers: 2},
      {fileName: 'Example S02E01', fileUrl: 'https://example.test/a', nbSeeders: 100},
      {fileName: 'Example season 2', fileUrl: 'https://example.test/b', nbSeeders: 50, nbLeechers: 3}
    ]}));
    else if (url.pathname.endsWith('/torrents/add')) { added = new URLSearchParams(body); res.end('Ok.'); }
    else if (url.pathname.endsWith('/torrents/info')) res.end(JSON.stringify([{hash: 'abc', tags: added.get('tags'), progress: complete ? 1 : 0.25, amount_left: complete ? 0 : 100, state: complete ? 'uploading' : 'downloading'}]));
    else { res.statusCode = 404; res.end(); }
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const config = {qbitUrl: 'http://127.0.0.1:' + server.address().port, qbitUsername: 'user', qbitPassword: 'private', qbitShowsPath: '/shows'};
  const file = path.join(directory, 'jobs.json');
  const snapshot = {picks: [{imdbId: 'tt1', title: 'Example', kind: 'tv', options: []}]};
  let handle = create(config, file, () => snapshot, () => scans++);
  const call = payload => new Promise((resolve, reject) => handle({imdbId: 'tt1', ...payload}, (err, value) => err ? reject(err) : resolve(value)));
  await assert.rejects(call({action: 'search', season: 2}), /search\/start: HTTP 409.*Python must be installed/);
  startError = false;
  assert.equal((await call({action: 'search', season: 2})).searchId, 42);
  const results = await call({action: 'results', searchId: 42});
  assert.deepEqual(results.results.map(r => r.seeds), [50, 20]);
  const selectedId = results.results[0].id;
  reranked = true;
  await call({action: 'results', searchId: 42});
  await call({action: 'download', searchId: 42, resultId: selectedId});
  assert.equal(added.get('urls'), 'https://example.test/b', 'Download identity survives changing seed rankings');
  assert.equal(added.get('savepath'), '/shows'); assert.equal(added.get('stopped'), 'false');
  assert.equal((await call({action: 'status'})).jobs[0].progress, 0.25);
  assert.equal(JSON.parse(fs.readFileSync(file)).jobs['tt1:2'].hash, 'abc');
  await assert.rejects(call({action: 'download', searchId: 42, index: 0}), /Already tracking/);
  complete = true;
  handle = create(config, file, () => snapshot, () => scans++);
  assert.equal((await call({action: 'status'})).jobs[0].complete, true);
  assert.equal(scans, 1);
  snapshot.picks[0].options = [{app: 'plex'}];
  const before = calls.length;
  assert.deepEqual((await call({action: 'status'})).jobs, []);
  assert.equal(calls.length, before, 'Available titles must not contact qBittorrent');
  assert.equal(JSON.stringify(results).includes('magnet:'), false);
  assert.deepEqual(await new Promise(resolve => create({}, file, () => snapshot, () => {})({}, (err, value) => resolve(value))), {enabled: false});
  await call({action: 'search', season: 2});
  await call({action: 'search', season: 2, previousSearchId: 42});
  assert.ok(calls.includes('/api/v2/search/delete'), 'A replacement search cancels its predecessor');
  await call({action: 'cancel', searchId: 42});
  await assert.rejects(call({action: 'results', searchId: 42}), /Search expired/);
  console.log('QbittorrentTest: all checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { server.close(); fs.rmSync(directory, {recursive: true, force: true}); });
