'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('web/home.js', 'utf8');
const search = source.slice(source.indexOf('  function searchTorrents('), source.indexOf('  function cancelTorrentSearch()'));
let renders = 0, status = {textContent: ''}, responses = [], timers = [], cancelled = [];
const context = {
  torrentGeneration: 0, torrentBusy: false, torrentView: false, torrentResults: null,
  torrentLatest: [], torrentFrozen: false, torrentSearch: null,
  torrentMessage: '', torrentSeason: 2, detailAction: 8, detailPick: {imdbId: 'tt1', seasons: 3},
  st: {zone: 'details'}, Z: {DETAILS: 'details'},
  tr: (pt, en) => en, $: () => status,
  TV: {torrents: payload => cancelled.push(payload)},
  renderDetails: () => { renders++; },
  torrentCall: (payload, callback) => responses.push({payload, callback}),
  setTimeout: callback => timers.push(callback)
};
vm.createContext(context);
vm.runInContext(search, context);
context.searchTorrents();
assert.equal(context.detailAction, 0);
responses.shift().callback({searchId: 42});
responses.shift().callback({running: true, results: [{id: 'first', name: 'Partial'}]});
assert.equal(context.torrentResults.length, 1, 'Publish results before search completion');
assert.equal(renders, 2);
context.detailAction = 4;
context.torrentFrozen = true; // Remote navigation/pointer hover freezes the visible list.
timers.shift()();
responses.shift().callback({running: true, results: [{id: 'better', name: 'More seeds'}, {id: 'first', name: 'Partial'}]});
assert.equal(context.torrentResults[0].id, 'first', 'Do not move rows under the selection');
assert.equal(context.detailAction, 4);
assert.equal(renders, 2, 'Background arrivals must not rebuild a list being browsed');
assert.equal(status.textContent, 'Searching… (2)');
timers.shift()();
responses.shift().callback({running: false, results: Array.from({length: 40}, (_, i) => ({id: 'id-' + i, name: 'Torrent ' + i}))});
assert.equal(context.torrentResults[0].id, 'first', 'Completion must not move the selection either');
assert.equal(context.torrentLatest.length, 20);
const actions = source.slice(source.indexOf('  function activateDetailAction()'), source.indexOf('  function detailButton('));
vm.runInContext(actions, context);
context.detailActions = [{torrentUpdate: true}]; context.detailAction = 0;
context.activateDetailAction();
assert.equal(context.torrentResults.length, 20, 'Explicit update applies only the latest top 20');
assert.equal(context.torrentResults[0].id, 'id-0');
assert.equal(renders, 3);
context.detailAction = 2;
context.searchTorrents(true);
assert.equal(context.detailAction, 2, 'Changing season preserves control focus');
assert.equal(responses[0].payload.previousSearchId, 42);
responses.shift().callback({searchId: 43});
const stale = responses.shift();
context.torrentGeneration++;
stale.callback({running: false, results: [{id: 'old', name: 'Old season'}]});
assert.equal(context.torrentResults, null, 'Ignore results from an old search');
context.searchTorrents();
const pending = responses.shift();
context.torrentGeneration++;
pending.callback({searchId: 44});
assert.equal(cancelled[0].searchId, 44, 'Cancel a search that starts after the user leaves');
console.log('TorrentSearchViewTest: all checks passed.');

// Render actual result buttons and click them, including an older backend response without an ID.
let buttons = [], trailerCalls = 0, page = {innerHTML: ''};
context.$ = id => id === 'details' ? page : null;
context.el = (tag, className, parent, text) => {
  const node = {tag, className, textContent: text || '', scrollTop: 0, children: [], parentNode: parent};
  if (parent && parent.children) parent.children.push(node);
  if (tag === 'button') buttons.push(node);
  return node;
};
context.setClass = context.focusDetailActions = context.poke = () => {};
context.saverOn = false;
context.playTrailer = () => { trailerCalls++; };
context.cancelTorrentSearch = context.pollTorrents = () => {};
vm.runInContext(source.slice(source.indexOf('  function detailButton('), source.indexOf('  function playTrailer()')), context);
vm.runInContext(source.slice(source.indexOf('  function renderDetails('), source.indexOf('  function openDetails(')), context);
context.torrentView = true; context.torrentBusy = true; context.torrentDownloading = false;
context.torrentResults = [{id: 'stable-id', name: 'Correct torrent', seeds: 42, size: 1073741824}];
context.detailPick = {imdbId: 'tt1', title: 'Example', kind: 'movie'};
context.renderDetails(context.detailPick, false);
buttons[buttons.length - 1].onclick();
assert.equal(responses[0].payload.action, 'download');
assert.equal(responses[0].payload.resultId, 'stable-id');
assert.equal(trailerCalls, 0, 'Clicking a torrent must not open a trailer');
responses.length = 0; buttons = [];
context.torrentDownloading = false;
context.torrentResults = [{index: 0, name: 'Old backend result', seeds: 42, size: 1073741824}];
context.renderDetails(context.detailPick, false);
buttons[buttons.length - 1].onclick();
assert.match(context.torrentMessage, /Download service is outdated/);
assert.equal(responses.length, 0, 'Missing stable IDs must not download an arbitrary result');
assert.equal(trailerCalls, 0, 'Malformed torrent actions must not fall through to the trailer');
context.detailActions = [{}]; context.detailAction = 0;
context.activateDetailAction();
assert.equal(trailerCalls, 0, 'Unknown actions must not open trailers');
context.detailActions = [{trailer: true}];
context.activateDetailAction();
assert.equal(trailerCalls, 1, 'The explicit trailer action still works');
console.log('Torrent result click regression checks passed.');

vm.runInContext(source.slice(source.indexOf('  function hasTorrentDownload('), source.indexOf('  function pollTorrents()')), context);
context.torrentJobs = [{imdbId: 'tt1', hash: 'abc', state: 'downloading'}];
assert.equal(context.hasTorrentDownload({imdbId: 'tt1'}), true);
assert.equal(context.hasTorrentDownload({imdbId: 'tt2'}), false);
context.torrentJobs[0].state = 'Removed from qBittorrent';
assert.equal(context.hasTorrentDownload({imdbId: 'tt1'}), false);
context.torrentJobs = [{imdbId: 'tt1', state: 'Adding torrent'}];
assert.equal(context.hasTorrentDownload({imdbId: 'tt1'}), false);
console.log('Tracked torrent search visibility checks passed.');
