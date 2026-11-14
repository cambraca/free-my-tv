'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const nodes = {};
class Element {
  constructor() { this.children = []; this.listeners = {}; this.value = ''; this.textContent = ''; this.classList = {add() {}, remove() {}}; }
  set id(value) { nodes[value] = this; }
  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  showModal() { this.open = true; }
  close() { this.open = false; this.listeners.close?.(); }
}
const pick = {imdbId: 'tt123', title: 'Example', kind: 'tv', meta: '2024 · Drama', genres: ['Drama'],
  rating: 8.1, seasons: 2, episodes: 12, overview: 'Synopsis', note: 'Personal note', backdrop: 'landscape.jpg',
  credits: {creators: ['Creator'], cast: ['Actor']}, options: [{app: 'plex', service: 'Plex'}]};
const requests = [];
let resolveSlow, connected = true, seasonList = [1];
const context = {URLSearchParams, location: {search: ''}, setInterval() {}, document: {
  hidden: false, body: new Element(), createElement() { return new Element(); },
  getElementById(id) { return nodes[id] ||= new Element(); }, querySelectorAll() { return []; }
}, async fetch(url, options) {
  requests.push({url, options});
  let value;
  if (url === '/api/watchlist') value = {snapshot: {picks: [pick]}};
  else if (url === '/api/details?id=ttSlow') return new Promise(resolve => { resolveSlow = () => resolve({ok: true, json: async () => ({pick: {...pick, title: 'Stale result'}})}); });
  else if (url.startsWith('/api/details')) value = {pick, downloadsEnabled: true};
  else if (url === '/api/torrents') value = JSON.parse(options.body).action === 'seasons' ? {seasons: seasonList} : {jobs: []};
  else value = {connected};
  return {ok: true, json: async () => value};
}};
vm.runInNewContext(fs.readFileSync('tools/phone/phone.js', 'utf8'), context);
const text = node => [node.textContent, ...node.children.map(text)].join(' ');
async function run() {
  await new Promise(resolve => setImmediate(resolve));
  await context.details(pick);
  const content = text(nodes['detail-content']);
  for (const value of ['TV show', '2024', 'Drama', '★ 8.1 / 10 · TMDB', 'Created by:', 'Creator', 'Cast:', 'Actor',
    '2 seasons', 'Synopsis', 'Your note', 'Personal note', 'Seasons in Plex: 1']) assert.ok(content.includes(value), value);
  assert.equal(nodes['detail-content'].children[0].src, 'landscape.jpg');
  assert.equal(requests.some(request => request.url === '/api/remote/command'), false, 'Details must not launch automatically');
  await context.command({action: 'launch', imdbId: pick.imdbId, app: 'plex'});
  assert.equal(nodes.status.textContent, '', 'Launch sending/success messages stay hidden');
  await context.load();
  assert.equal(nodes.connection.textContent, '1 titles', 'Connected label stays hidden');
  connected = false; await context.load();
  assert.equal(nodes.connection.textContent, '1 titles · TV not connected');
  pick.overview = ''; seasonList = []; await context.details(pick);
  assert.equal(text(nodes['detail-content']).includes('No synopsis available.'), false);
  assert.equal(text(nodes['detail-content']).includes('No seasons in Plex'), false);
  const slow = context.details({...pick, imdbId: 'ttSlow', title: 'Slow'});
  await context.details(pick);
  resolveSlow(); await slow;
  assert.equal(text(nodes['detail-content']).includes('Stale result'), false);
  assert.equal(text(nodes['detail-content']).includes('Example'), true);
  console.log('PhoneDetailsTest: full detail information, artwork, downloads, details-first behavior and stale responses passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
