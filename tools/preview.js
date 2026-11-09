'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'out', 'webos');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('node tools/preview.js [--port 8000] [--config path] [--no-build]');
  process.exit(0);
}
const port = args.includes('--port') ? Number(args[args.indexOf('--port') + 1]) : 8000;
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be between 1 and 65535.');
const clients = new Set();
const mime = {'.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf'};
let config, snapshot, snapshotPath, Watchlist, request;
let torrents;
let refreshing = false, attemptedAt = 0, lastError = '', building = false, queued = false, debounce;

function load() {
  const content = fs.readFileSync(path.join(directory, 'config.js'), 'utf8');
  const publicConfig = JSON.parse(content.split('window.CONFIG = ')[1].trim().replace(/;$/, ''));
  const nextConfig = {...publicConfig, ...JSON.parse(fs.readFileSync(path.join(directory, 'watchlist-backend.json'), 'utf8'))};
  for (const filename of ['./watchlist-network', '../web/watchlist', '../webos/service/qbittorrent', '../webos/service/plex-scan']) delete require.cache[require.resolve(filename)];
  Watchlist = require('../web/watchlist');
  request = require('./watchlist-network');
  const identity = crypto.createHash('sha256').update(JSON.stringify(nextConfig, Object.keys(nextConfig).sort())).digest('hex').slice(0, 16);
  snapshotPath = path.join(root, 'out', 'watchlist', 'snapshot-' + identity + '.json');
  if (!config || Watchlist.source(config) !== Watchlist.source(nextConfig)) {
    snapshot = null;
    attemptedAt = 0;
    lastError = '';
  }
  if (snapshot && !Watchlist.valid(snapshot, nextConfig)) {
    snapshot = null;
    attemptedAt = 0;
    lastError = '';
  }
  config = nextConfig;
  torrents = require('../webos/service/qbittorrent')(config, path.join(root, 'out', 'watchlist', 'torrents.json'), () => snapshot, () => scanPlex());
  attemptedAt = 0;
  lastError = '';
  try {
    const cached = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    if (Watchlist.valid(cached, config)) snapshot = cached;
  } catch (error) {}
}

function refresh(force) {
  if (!config.imdbUserId || refreshing || (!force && Date.now() - attemptedAt < 600000)) return;
  if (!force && snapshot && Watchlist.fresh(snapshot.updatedAt) && Watchlist.notesReady(snapshot)
      && Watchlist.plexLinksReady(snapshot) && Watchlist.watchedReady(snapshot)
      && Watchlist.availabilityReady(snapshot) && !snapshot.warnings.length) return;
  refreshing = true;
  attemptedAt = Date.now();
  const currentConfig = config, currentPath = snapshotPath;
  Watchlist.sync(currentConfig, snapshot, request, snapshot ? null : partial => {
    if (config === currentConfig) snapshot = partial;
  }, (error, result) => {
    refreshing = false;
    if (config !== currentConfig) return;
    lastError = error ? error.message : '';
    if (error) { console.error(lastError); return; }
    snapshot = result;
    fs.mkdirSync(path.dirname(currentPath), {recursive: true});
    const temporary = currentPath + '.' + process.pid + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(result));
    fs.renameSync(temporary, currentPath);
    console.log('Watchlist: ' + result.entries.length + ' titles, '
      + result.picks.filter(pick => pick.options.length).length + ' available.');
  }, force);
}

function scanPlex() {
  require('../webos/service/plex-scan')(config, request, () => refresh(true));
}
setInterval(() => { if (torrents) torrents({action: 'status'}, () => {}); }, 60000).unref();

function send(response, status, type, body) {
  response.writeHead(status, {'Content-Type': type, 'Cache-Control': 'no-store'});
  response.end(body);
}

const server = http.createServer((incoming, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(incoming.url, 'http://localhost').pathname); }
  catch (error) { send(response, 400, 'text/plain', 'Bad request'); return; }
  if (pathname === '/preview-events') {
    response.writeHead(200, {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive'});
    response.write(': connected\n\n');
    clients.add(response);
    incoming.on('close', () => clients.delete(response));
    return;
  }
  if (pathname === '/api/torrents') {
    if (incoming.method !== 'POST' || incoming.headers['content-type'] !== 'application/json' || (incoming.headers.origin && incoming.headers.origin !== 'http://' + incoming.headers.host)) { send(response, 403, 'text/plain', 'Forbidden'); return; }
    let body = '';
    incoming.on('data', chunk => { body += chunk; if (body.length > 8192) incoming.destroy(); });
    incoming.on('end', () => {
      let payload; try { payload = JSON.parse(body); } catch (error) { send(response, 400, 'text/plain', 'Bad request'); return; }
      torrents(payload, (error, result) => send(response, 200, 'application/json', JSON.stringify(error ? {error: error.message} : result)));
    });
    return;
  }
  if (pathname === '/api/watchlist') {
    const query = new URL(incoming.url, 'http://localhost').searchParams;
    refresh(query.get('refresh') === '1');
    const client = Watchlist.clientSnapshot(snapshot, query.get('source'), query.get('updatedAt'));
    send(response, 200, 'application/json', JSON.stringify({returnValue: true, snapshot: client, refreshing, error: lastError}));
    return;
  }
  if (pathname === '/watchlist-backend.json' || pathname === '/watchlist-service-seed.json') { send(response, 403, 'text/plain', 'Forbidden'); return; }
  const filename = path.resolve(directory, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!filename.startsWith(directory + path.sep)) { send(response, 403, 'text/plain', 'Forbidden'); return; }
  fs.readFile(filename, (error, content) => {
    if (error) { send(response, 404, 'text/plain', 'Not found'); return; }
    if (pathname === '/config.js') content = content.toString() + '\nwindow.FMTV_PREVIEW = true;\n';
    if (pathname === '/' || pathname === '/index.html') {
      content = content.toString().replace('</body>', '<script>new EventSource("/preview-events").onmessage = function () { location.reload(); };</script></body>');
    }
    send(response, 200, mime[path.extname(filename)] || 'application/octet-stream', content);
  });
});
server.on('error', error => { console.error(error.message); process.exit(1); });

function rebuild(first) {
  if (building) { queued = true; return; }
  building = true;
  const buildArgs = ['webos/build.py', '--preview', '--no-watchlist-sync'];
  if (args.includes('--config')) buildArgs.push('--config', path.resolve(args[args.indexOf('--config') + 1]));
  const child = spawn('python3', buildArgs, {cwd: root, stdio: 'inherit'});
  child.on('error', error => { console.error(error.message); process.exit(1); });
  child.on('exit', code => {
    building = false;
    if (code === 0) {
      try { load(); }
      catch (error) { console.error('Could not load the preview build: ' + error.message); return; }
      if (first) start();
      else {
        clients.forEach(client => client.write('data: reload\n\n'));
        console.log('Preview rebuilt.');
      }
    } else if (first) { process.exitCode = code || 1; return; }
    if (queued) { queued = false; rebuild(false); }
  });
}

function start() {
  server.listen(port, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:' + port + ' — watching source files. Ctrl+C to stop.'));
  function changed(filename) {
    if (String(filename).includes('__pycache__')) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => rebuild(false), 250);
  }
  for (const watched of ['web', 'webos', 'tools', 'app/assets']) {
    fs.watch(path.join(root, watched), {recursive: true}, (event, filename) => changed(filename));
  }
  fs.watch(root, (event, filename) => {
    if (['config.properties', 'config.example.properties'].includes(String(filename))) changed(filename);
  });
}

if (args.includes('--no-build')) { load(); start(); }
else rebuild(true);
