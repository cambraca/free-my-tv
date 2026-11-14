'use strict';

// The preview owns jobs; the TV only receives commands while its page is active.
module.exports = function ({token, tvIp, getState}) {
  let waiting = null, pending = null, lastSeen = 0;
  const apps = {netflix: 'netflix', plex: 'cdp-30', mubi: 'com.mubi', youtube: 'youtube.leanback.v4'};
  function reply(res, status, value) {
    res.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    res.end(JSON.stringify(value));
  }
  function body(req, res, done) {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 8192) req.destroy(); });
    req.on('end', () => {
      try { done(JSON.parse(data)); } catch (error) { reply(res, 400, {error: 'Invalid request'}); }
    });
  }
  return {handle(req, res, pathname) {
    if (!pathname.startsWith('/api/remote/')) return false;
    const tv = pathname === '/api/remote/poll' || pathname === '/api/remote/result';
    if (tv && req.method === 'OPTIONS') {
      const origin = req.headers.origin;
      if (origin !== 'null' && !(origin || '').startsWith('file://')) { reply(res, 403, {error: 'Forbidden origin'}); return true; }
      res.writeHead(204, {'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Max-Age': '600'}); res.end(); return true;
    }
    if (tv && (!token || req.headers.authorization !== 'Bearer ' + token)) { reply(res, 401, {error: 'TV bridge token required'}); return true; }
    if (tv) {
      // The packaged webOS page has a file origin. Never grant a website access to TV credentials.
      if (req.headers.origin && req.headers.origin !== 'null' && !req.headers.origin.startsWith('file://')) {
        reply(res, 403, {error: 'Forbidden origin'}); return true;
      }
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || 'null');
    } else if (req.headers.origin && req.headers.origin !== 'http://' + req.headers.host) {
      reply(res, 403, {error: 'Forbidden origin'}); return true;
    }
    if (pathname === '/api/remote/status' && req.method === 'GET') {
      reply(res, 200, {connected: !!waiting && Date.now() - lastSeen < 30000, configured: !!tvIp}); return true;
    }
    if (req.method !== 'POST' || req.headers['content-type'] !== 'application/json') {
      reply(res, 405, {error: 'POST JSON required'}); return true;
    }
    body(req, res, payload => {
      if (tv) {
        const address = req.socket.remoteAddress.replace(/^::ffff:/, '');
        if (!tvIp || address !== tvIp) { reply(res, 403, {error: 'TV address does not match tv_ip'}); return; }
      }
      if (pathname === '/api/remote/poll') {
        lastSeen = Date.now();
        if (waiting) reply(waiting, 200, {});
        waiting = res;
        const timer = setTimeout(() => { if (waiting === res) waiting = null; reply(res, 200, {}); }, 20000);
        res.on('close', () => { clearTimeout(timer); if (waiting === res) waiting = null; });
      } else if (pathname === '/api/remote/result') {
        if (pending && payload.id === pending.id) pending.finish(payload.error ? {error: payload.error} : {ok: true});
        reply(res, 200, {ok: true});
      } else if (pathname === '/api/remote/command') {
        if (!waiting || pending) { reply(res, 409, {error: pending ? 'A TV command is still running.' : 'Open Free My TV on the TV first.'}); return; }
        const state = getState();
        let command;
        if (payload.action === 'launch') {
          const pick = state.snapshot && state.snapshot.picks.find(item => item.imdbId === payload.imdbId);
          const option = pick && pick.options.find(item => item.app === payload.app);
          if (!option || !apps[option.app]) { reply(res, 400, {error: 'Title or service is unavailable.'}); return; }
          command = {action: 'launch', appId: apps[option.app], pick: {...pick, ...option}};
        } else { reply(res, 400, {error: 'Unsupported command'}); return; }
        command.id = require('node:crypto').randomUUID();
        const timer = setTimeout(() => pending && pending.finish({error: 'TV did not acknowledge the command; it will not be retried.'}), 15000);
        pending = {id: command.id, finish(result) { clearTimeout(timer); pending = null; reply(res, result.error ? 502 : 200, result); }};
        const receiver = waiting; waiting = null;
        reply(receiver, 200, command);
        if (command.pick && command.pick.app === 'plex') {
          // Runs on the computer even when webOS suspends the launcher.
          require('../webos/service/title-launch').openPlex({...state.config, tvIp}, state.snapshot,
            command.pick.imdbId, state.request, error => {
              if (pending && pending.id === command.id) pending.finish(error ? {error: error.message} : {ok: true});
            });
        }
      } else reply(res, 404, {error: 'Unknown endpoint'});
    });
    return true;
  }};
};
