'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const nodes = {};
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.value = ''; this.textContent = ''; this.classList = {add() {}, remove() {}}; }
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return this.text; }
  set id(value) { nodes[value] = this; }
  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); }
  contains(child) { return this.children.includes(child); }
  setAttribute() {}
  remove() {}
  addEventListener(type, callback) { this.listeners[type] = callback; }
  showModal() { this.open = true; }
  close() { this.open = false; this.listeners.close?.(); }
}
const pick = {imdbId: 'tt123', title: 'Example', kind: 'tv', meta: '2024 · Drama', genres: ['Drama'],
  rating: 8.1, tmdbId: 456, imdbRating: 8.4, seasons: 2, episodes: 12, overview: 'Synopsis',
  note: 'Personal note', backdrop: 'landscape.jpg', poster: 'poster.jpg',
  credits: {creators: ['Creator'], cast: ['Actor']}, options: [{app: 'plex', service: 'Plex'}]};
const requests = [];
let resolveSlow, connected = true, seasonList = [1];
const location = {search: '', hash: '#tab=tv&title=tt123&account=p.Example2'};
const context = {URLSearchParams, location, window: {location, history: {replaceState(state, title, hash) { location.hash = hash; }}},
  IMDB_ACCOUNTS: [{id: 'ur123', name: 'First'}, {id: 'p.Example2', name: 'Second'}],
  localStorage: {getItem: () => JSON.stringify('ur123'), setItem() {}},
  setInterval() {}, setTimeout() {}, clearTimeout() {}, document: {
  hidden: false, body: new Element(), createElement(tag) { return new Element(tag); },
  getElementById(id) { return nodes[id] ||= new Element(); }, querySelectorAll() { return []; }
}, async fetch(url, options) {
  requests.push({url, options});
  let value;
  if (url.startsWith('/api/watchlist')) value = {snapshot: {picks: [pick]}};
  else if (url.startsWith('/api/details?id=ttSlow&')) return new Promise(resolve => { resolveSlow = () => resolve({ok: true, json: async () => ({pick: {...pick, title: 'Stale result'}})}); });
  else if (url.startsWith('/api/details')) value = {pick, downloadsEnabled: true};
  else if (url.startsWith('/api/ratings')) value = {ratings: {
    rottenTomatoes: {id: 'tv/example', score: 0}, metacritic: {id: 'tv/example', score: 74},
    letterboxd: {id: 'example', score: 4.24}
  }};
  else if (url === '/api/torrents') value = JSON.parse(options.body).action === 'seasons' ? {seasons: seasonList} : {jobs: []};
  else value = {connected};
  return {ok: true, json: async () => value};
}};
vm.createContext(context);
vm.runInContext(fs.readFileSync('web/ratings.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('web/preview-location.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('tools/phone/phone-torrents.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('tools/phone/phone.js', 'utf8'), context);
const text = node => [node.textContent, ...node.children.map(text)].join(' ');
async function run() {
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(nodes.details.open, true, 'The URL fragment restores title details after loading the watchlist');
  assert.equal(requests[0].url, '/api/watchlist?account=p.Example2', 'The shared profile wins over the saved profile');
  nodes.details.close();
  assert.equal(location.hash, '#tab=tv&account=p.Example2');
  assert.equal(nodes['tv-layout'].href, '/?mode=tv#tab=tv&account=p.Example2');
  await context.details(pick);
  assert.equal(location.hash, '#tab=tv&title=tt123&account=p.Example2');
  const content = text(nodes['detail-content']);
  for (const value of ['TV show', '2024', 'Drama', '★ 81%', '★ 8.4', '★ 0%', '★ 74', 'Created by:', 'Creator', 'Cast:', 'Actor',
    '2 seasons', 'Synopsis', 'Your note', 'Personal note', 'Seasons in Plex: 1']) assert.ok(content.includes(value), value);
  assert.equal(nodes['detail-content'].children[0].src, 'landscape.jpg');
  assert.equal(nodes['detail-content'].children[1].src, 'poster.jpg');
  assert.deepEqual(nodes['detail-ratings'].children.map(node => node.href), [
    'https://www.imdb.com/title/tt123/', 'https://www.themoviedb.org/tv/456',
    'https://www.rottentomatoes.com/tv/example', 'https://www.metacritic.com/tv/example/',
    'https://letterboxd.com/film/example/'
  ]);
  assert.deepEqual(nodes['detail-ratings'].children.map(node => node.children[0].alt),
    ['IMDb', 'TMDB', 'Rotten Tomatoes', 'Metacritic', 'Letterboxd']);
  assert.equal(nodes['detail-ratings'].children[4].textContent.trim(), '★ 4.2');
  const tvRatings = new Element();
  context.TitleRatings.render(tvRatings, pick, {
    rottenTomatoes: {score: 0}, metacritic: {score: 74}, letterboxd: {id: 'example', score: 4.24}
  }, 'tv');
  assert.deepEqual(tvRatings.children.map(node => node.tag), ['span', 'span', 'span', 'span', 'span']);
  assert.ok(tvRatings.children.every(node => node.children[0].height === 26));
  assert.ok(nodes['detail-ratings'].children.every(node => node.children[0].height === undefined));
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
  nodes.details.close();
  nodes.profiles.children[0].onclick();
  assert.equal(location.hash, '#tab=tv&account=ur123');
  assert.ok(requests.some(request => request.url === '/api/watchlist?account=ur123'));
  console.log('PhoneDetailsTest: full detail information, artwork, downloads, details-first behavior and stale responses passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
