'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const token = 'test-only-token-with-at-least-24-characters';
const tvAuth = 'Bearer ' + token;
const bridge = require('../tools/preview-remote')({token, tvIp: '127.0.0.1', getState: () => ({snapshot: {
  picks: [{imdbId: 'tt123', title: 'Test', options: [{app: 'netflix', service: 'Netflix', url: 'https://www.netflix.com/title/123'}]}]
}})});
const server = http.createServer((req, res) => {
  if (!bridge.handle(req, res, req.url)) { res.writeHead(404); res.end(); }
});
async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/remote/';
  function call(endpoint, payload, authorization, extra = {}) {
    return fetch(base + endpoint, {method: payload === undefined ? 'GET' : 'POST',
      headers: {...(authorization ? {Authorization: authorization} : {}), 'Content-Type': 'application/json', ...extra},
      body: payload === undefined ? undefined : JSON.stringify(payload)});
  }
  const browserStatus = await call('status');
  assert.equal(browserStatus.status, 200, 'Browser access requires no login');
  assert.equal(browserStatus.headers.get('www-authenticate'), null);
  assert.equal((await call('poll', {})).status, 401, 'TV receiver still requires its bridge token');
  assert.equal((await call('result', {id: 'test'}, 'wrong')).status, 401);
  assert.equal((await call('status', undefined, undefined, {Origin: 'http://evil.test'})).status, 403);
  const preflight = await fetch(base + 'poll', {method: 'OPTIONS', headers: {Origin: 'null'}});
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'null');
  assert.equal((await call('command', {action: 'key', key: 'Enter'})).status, 409);
  const poll = call('poll', {}, tvAuth, {Origin: 'null'});
  // Wait for the receiver to be registered, rather than assuming fetch timing.
  for (let i = 0; i < 30; i++) {
    if ((await (await call('status')).json()).connected) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal((await call('command', {action: 'launch', imdbId: 'tt999', app: 'netflix'})).status, 400);
  assert.equal((await call('command', {action: 'key', key: 'POWER'})).status, 400);
  const commandResponse = call('command', {action: 'launch', imdbId: 'tt123', app: 'netflix'});
  const command = await (await poll).json();
  assert.equal(command.appId, 'netflix');
  assert.equal(command.pick.imdbId, 'tt123');
  assert.equal((await call('command', {action: 'key', key: 'Enter'})).status, 409);
  await call('result', {id: command.id}, tvAuth);
  assert.deepEqual(await (await commandResponse).json(), {ok: true});
  assert.equal((await call('command', {action: 'key', key: 'Enter'})).status, 409, 'Never queue commands for an offline TV');
  console.log('PreviewRemoteTest: login-free browser access, TV authentication, CORS, validation, delivery, acknowledgement and offline checks passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { server.closeAllConnections(); server.close(); });
