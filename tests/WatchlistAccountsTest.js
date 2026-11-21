'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const Watchlist = require('../web/watchlist');
const createLists = require('../webos/service/watchlists');

const config = {
  imdbUserId: 'ur123', imdbAccounts: [{id: 'ur123'}, {id: 'ur456'}],
  watchlistServices: ['plex'], plexHost: 'plex.test'
};
const source = id => Watchlist.source({...config, imdbUserId: id});
function snapshot(id, titleId) {
  const now = Date.now();
  return {
    schema: 2, catalogVersion: 1, source: source(id), updatedAt: now, entriesAt: now,
    entries: [{imdbId: titleId, kind: 'movie', title: titleId, checkedAt: now, note: ''}],
    plex: {items: {}, at: now, linksVersion: 1, watchedVersion: 1},
    picks: [{id: titleId, imdbId: titleId, kind: 'movie', options: [], watched: false}], warnings: []
  };
}

const first = snapshot('ur123', 'tt11');
const second = snapshot('ur456', 'tt22');
const storage = {
  'fmtv.watchlist': JSON.stringify(first),
  'fmtv.watched': JSON.stringify({source: first.source, ids: {tt11: true}}),
  'fmtv.featured': JSON.stringify({source: first.source, seed: 'old', tabs: {}})
};
const pending = [];
const sandbox = {
  window: {CONFIG: config, WATCHLIST_SEEDS: {ur456: second}},
  navigator: {}, document: {}, Watchlist,
  localStorage: {getItem: key => storage[key], setItem: (key, value) => { storage[key] = value; }},
  TV: {isPreview: true, zone: () => '', watchlist: (done, force, known, id) => pending.push({done, id})}
};
const dataScript = fs.readFileSync(require.resolve('../web/data.js'), 'utf8');
vm.runInNewContext(dataScript, sandbox);
const {Data} = sandbox;
assert.equal(Data.activeAccount(), 'ur123');
assert.equal(Data.currentPick('tt11').id, 'tt11');
assert.equal(Data.isWatched(first.picks[0]), true);
for (const key of ['watchlist', 'watched', 'featured']) {
  assert.equal(storage['fmtv.' + key + '.' + first.source], storage['fmtv.' + key]);
}
Data.refreshWatchlist();
Data.switchAccount('ur456');
assert.equal(Data.currentPick('tt11'), undefined);
assert.equal(Data.currentPick('tt22').id, 'tt22');
assert.equal(Data.isWatched({id: 'tt11'}), false);
Data.markWatched(second.picks[0]);
Data.switchAccount('ur123');
pending[0].done({error: 'Discard this obsolete response'});
assert.equal(Data.watchlistStatus().error, '');
assert.equal(Data.watchlistStatus().refreshing, true);
pending[2].done({refreshing: false});
assert.equal(Data.isWatched({id: 'tt22'}), false);
assert.equal(Data.isWatched(first.picks[0]), true);
Data.switchAccount('ur456');
assert.equal(JSON.parse(storage['fmtv.imdbAccount']), 'ur456');
assert.equal(Data.isWatched(second.picks[0]), true);

const reopened = {...sandbox, window: {...sandbox.window}};
vm.runInNewContext(dataScript, reopened);
assert.equal(reopened.Data.activeAccount(), 'ur456');
assert.equal(reopened.Data.currentPick('tt22').id, 'tt22');
assert.equal(reopened.Data.isWatched(second.picks[0]), true);
reopened.window.CONFIG = {...config, imdbAccounts: [{id: 'ur123'}]};
vm.runInNewContext(dataScript, reopened);
assert.equal(reopened.Data.activeAccount(), 'ur123');

async function backend() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fmtv-accounts-'));
  try {
    const pathFor = id => path.join(dir, id + '.json');
    let scans = 0;
    const libraries = {...Watchlist,
      scanPlex(settings, request, done) {
        scans++;
        setImmediate(() => done(null, {at: Date.now(), linksVersion: 1, watchedVersion: 1, items: {
          'imdb:tt11': {title: 'First', kind: 'movie', watched: true},
          'imdb:tt22': {title: 'Second', kind: 'movie', watched: true}
        }}));
      }
    };
    const request = (method, url, headers, body, done) => {
      const id = JSON.parse(body).variables.userId === 'ur123' ? 'tt11' : 'tt22';
      setImmediate(() => done(null, {data: {predefinedList: {items: {
        pageInfo: {hasNextPage: false}, edges: [{node: {listItem: {id, titleText: {text: id}, titleType: {id: 'movie'}}}}]
      }}}}));
    };
    const lists = createLists(libraries, config, request, pathFor, {ur456: second}, first);
    assert.equal(lists.get('ur123').snapshot.source, first.source);
    assert.equal(lists.get('ur456').snapshot.source, second.source);
    assert.equal(lists.get('__proto__'), null);
    assert.equal(lists.torrentSnapshot('tt22').source, second.source);
    let completed = 0;
    await new Promise(resolve => lists.refreshAll(start => start(() => {
      if (++completed === 2) resolve();
    })));
    assert.equal(scans, 1);
    assert.equal(lists.get('ur123').snapshot.plex, lists.get('ur456').snapshot.plex);
    assert.deepEqual(lists.get('ur123').snapshot.picks.map(pick => [pick.id, pick.watched]), [['tt11', true]]);
    assert.deepEqual(lists.get('ur456').snapshot.picks.map(pick => [pick.id, pick.watched]), [['tt22', true]]);
    assert.ok(fs.existsSync(pathFor('ur123')) && fs.existsSync(pathFor('ur456')));
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}
backend().then(() => console.log('WatchlistAccountsTest: legacy migration, switching, startup selection, and shared Plex passed.'))
  .catch(error => { console.error(error); process.exitCode = 1; });
