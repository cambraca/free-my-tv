'use strict';
const assert = require('node:assert/strict');
const Watchlist = require('../web/watchlist');
const config = {plexHost: 'plex.test', tvIp: '192.0.2.20'};
const snapshot = {schema: 2, source: Watchlist.source(config), entries: [{imdbId: 'tt123'}], picks: [],
  plex: {items: {'imdb:tt123': {machine: 'server', ratingKey: '42'}}}};
const requests = [];
require('../webos/service/title-launch').openPlex(config, snapshot, 'tt123', (method, url, headers, body, done) => {
  requests.push({url, headers});
  if (url.endsWith('/clients')) done(null, '<MediaContainer><Server address="192.0.2.99" product="Plex for LG" protocolCapabilities="mirror" machineIdentifier="wrong"/><Server address="192.0.2.20" product="Plex for LG" protocolCapabilities="mirror" machineIdentifier="target"/></MediaContainer>');
  else done(null, '<Response code="200"/>');
}, error => {
  assert.ifError(error);
  assert.equal(requests[1].headers['X-Plex-Target-Client-Identifier'], 'target');
  assert.match(requests[1].url, /key=%2Flibrary%2Fmetadata%2F42/);
  console.log('PlexRemoteTargetTest: computer-side command selects only the configured TV.');
});
