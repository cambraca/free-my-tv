'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class Element {
  constructor(tag = '') { this.tag = tag; this.children = []; this.listeners = {}; this.textContent = ''; }
  append(...children) { children.forEach(child => { child.parent = this; child.parentElement = this; this.children.push(child); }); }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  setAttribute() {}
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
}
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(pick, handler) {
  const calls = [], timers = new Map(); let timerId = 0, live = true;
  const context = {document: {hidden: false, createElement: tag => new Element(tag)},
    setTimeout(fn, delay) { timers.set(++timerId, {fn, delay}); return timerId; }, clearTimeout(id) { timers.delete(id); }};
  vm.runInNewContext(fs.readFileSync('tools/phone/phone-torrents.js', 'utf8'), context);
  const dialog = new Element(), content = new Element(), actions = new Element(), progress = new Element();
  const panel = context.PhoneTorrents({pick, dialog, content, actions, progress,
    api: async payload => { calls.push(payload); return handler(payload); }, current: () => live, onRefresh() {}});
  return {panel, calls, dialog, content, actions, progress, context, timers,
    expire() { live = false; panel.dispose(); },
    async poll(delay) {
      const entry = [...timers].find(([, timer]) => timer.delay === delay); assert.ok(entry, 'Expected polling timer');
      timers.delete(entry[0]); await entry[1].fn(); await tick();
    }};
}
const text = node => [node.textContent, ...node.children.map(text)].join(' ');
const base = {imdbId: 'tt123', title: 'Example', kind: 'tv', seasons: 3, options: []};
async function run() {
  let resultPoll = 0, nextSearch = 0, downloaded = false;
  const state = setup(base, payload => {
    if (payload.action === 'status') return {jobs: downloaded ? [{imdbId: base.imdbId, hash: 'tracked', state: 'downloading', progress: .2, season: 2}] : []};
    if (payload.action === 'seasons') return {seasons: [1], next: 2};
    if (payload.action === 'search') return {searchId: nextSearch++};
    if (payload.action === 'results') return {running: true, results: [
      {id: resultPoll++ ? 'second' : 'first', name: 'Season pack', seeds: 10, size: 1073741824}]};
    if (payload.action === 'download') { downloaded = true; return {started: true}; }
    return {};
  });
  await state.panel.ready;
  assert.equal(state.actions.children[0].textContent, 'Search torrents');
  await state.actions.children[0].onclick();
  assert.equal(state.panel.searching, true);
  assert.equal(state.content.hidden, true);
  assert.equal(state.calls.find(call => call.action === 'search').season, 2, 'Suggest first absent season');
  let view = state.dialog.children[0], controls = view.children[1], rows = view.children[3];
  assert.equal(text(controls).includes('Season 2'), true);
  assert.equal(text(controls).includes('← Details'), false, 'Sticky header provides the only Back action');
  const update = controls.children.find(node => node.textContent === 'Update results');
  assert.equal(update.hidden, true, 'Hide Update results before interaction');
  const row = rows.children[0]; row.listeners.focus();
  assert.equal(update.hidden, true, 'Freezing identical results does not show Update results');
  await state.poll(2000);
  assert.equal(rows.children[0], row, 'Do not replace a result the user is browsing');
  assert.equal(update.hidden, false, 'Offer Update results only when frozen rows differ');
  await row.onclick();
  assert.equal(state.calls.find(call => call.action === 'download').resultId, 'first', 'Download the selected stable ID');
  assert.equal(state.panel.searching, false);
  assert.equal(state.content.hidden, false);
  assert.equal(state.actions.children[0].hidden, true, 'Hide search for confirmed tracked downloads');
  assert.equal(text(state.progress).includes('20%'), true);
  assert.equal(state.calls.some(call => call.action === 'cancel' && call.searchId === 0), true, 'Search ID zero is cancellable');
  state.expire();

  let resultName = 'Initial', resultSeeds = 1, resultPeers = 0;
  const updates = setup({...base, kind: 'movie'}, payload => {
    if (payload.action === 'status') return {jobs: []};
    if (payload.action === 'search') return {searchId: 11};
    return {running: true, results: [{id: 'stable', name: resultName, seeds: resultSeeds, size: 100, peers: resultPeers}]};
  });
  await updates.panel.ready; await updates.actions.children[0].onclick();
  view = updates.dialog.children[0]; controls = view.children[1]; rows = view.children[3];
  const updateResults = controls.children[0];
  rows.children[0].listeners.touchstart();
  resultPeers++; await updates.poll(2000);
  assert.equal(updateResults.hidden, true, 'Ignore fields not displayed in result rows');
  resultName = 'New name'; await updates.poll(2000);
  assert.equal(updateResults.hidden, false);
  assert.equal(controls.hidden, false, 'Show movie controls only when an update is available');
  updateResults.onclick();
  assert.ok(text(rows).includes('New name'));
  assert.equal(updateResults.hidden, true, 'Hide after applying updated rows');
  assert.equal(controls.hidden, true);
  resultSeeds++; await updates.poll(2000);
  assert.equal(updateResults.hidden, false, 'Changed visible seed counts offer another update');
  updates.expire();

  const seasonState = setup({...base, seasons: 2, options: [{app: 'plex'}]}, payload => {
    if (payload.action === 'seasons') return {seasons: [1, 2], next: 3};
    if (payload.action === 'status') return {jobs: []};
    if (payload.action === 'search') return {searchId: 7};
    return {running: false, results: []};
  });
  await seasonState.panel.ready; await seasonState.actions.children[0].onclick();
  assert.equal(seasonState.calls.find(call => call.action === 'search').season, 2, 'Clamp suggestion to known total');
  controls = seasonState.dialog.children[0].children[1];
  assert.equal(controls.children.some(node => node.textContent === '+'), false);
  await controls.children.find(node => node.textContent === '−').onclick(); await tick();
  controls = seasonState.dialog.children[0].children[1];
  assert.equal(controls.children.some(node => node.textContent === '−'), false);
  assert.equal(seasonState.calls.filter(call => call.action === 'search').at(-1).season, 1);
  seasonState.expire();

  let finish;
  const late = setup({...base, kind: 'movie'}, payload => {
    if (payload.action === 'status') return {jobs: []};
    if (payload.action === 'search') return new Promise(resolve => { finish = resolve; });
    return {};
  });
  await late.panel.ready;
  const pending = late.actions.children[0].onclick(); late.expire();
  finish({searchId: 8}); await pending; await tick();
  assert.equal(late.calls.some(call => call.action === 'cancel' && call.searchId === 8), true, 'Cancel late searches after leaving details');

  let resultId = 'first', pendingDownload, finishDownload;
  const duplicate = setup({...base, kind: 'movie'}, payload => {
    if (payload.action === 'status') return {jobs: []};
    if (payload.action === 'search') return {searchId: 9};
    if (payload.action === 'results') return {running: false, results: [{id: resultId, name: 'Film', seeds: 1, size: 100}]};
    if (payload.action === 'download') return new Promise(resolve => { finishDownload = resolve; });
    return {};
  });
  await duplicate.panel.ready; await duplicate.actions.children[0].onclick();
  view = duplicate.dialog.children[0];
  const downloadRow = view.children[3].children[0];
  pendingDownload = downloadRow.onclick(); await downloadRow.onclick();
  assert.equal(duplicate.calls.filter(call => call.action === 'download').length, 1);
  finishDownload({started: true}); await pendingDownload;
  duplicate.expire();
  console.log('PhoneTorrentsTest: season selection, stable rows/IDs, downloads, tracking, cancellation and duplicate prevention passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
