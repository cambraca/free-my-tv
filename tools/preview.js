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
const mime = {'.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf'};
let config, snapshot, snapshotPath, Watchlist, request;
let refreshing = false, attemptedAt = 0, lastError = '';

function load() {
  const content = fs.readFileSync(path.join(directory, 'config.js'), 'utf8');
  const nextConfig = JSON.parse(content.split('window.CONFIG = ')[1].trim().replace(/;$/, ''));
  for (const filename of ['./watchlist-network', '../web/watchlist']) delete require.cache[require.resolve(filename)];
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
  if (!config || Watchlist.source(config) !== Watchlist.source(nextConfig)) config = nextConfig;
  attemptedAt = 0;
  lastError = '';
  try {
    const cached = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    if (Watchlist.valid(cached, config)) snapshot = cached;
  } catch (error) {}
}

function refresh() {
  if (!config.imdbUserId || refreshing || Date.now() - attemptedAt < 600000) return;
  if (snapshot && Watchlist.fresh(snapshot.updatedAt) && !snapshot.warnings.length) return;
  refreshing = true;
  attemptedAt = Date.now();
  const currentConfig = config, currentPath = snapshotPath;
  Watchlist.sync(currentConfig, snapshot, request, partial => {
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
    console.log('Watchlist: ' + result.entries.length + ' titles, ' + result.picks.length + ' available.');
  });
}

function send(response, status, type, body) {
  response.writeHead(status, {'Content-Type': type, 'Cache-Control': 'no-store'});
  response.end(body);
}

const server = http.createServer((incoming, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(incoming.url, 'http://localhost').pathname); }
  catch (error) { send(response, 400, 'text/plain', 'Bad request'); return; }
  if (pathname === '/api/watchlist') {
    refresh();
    const client = snapshot ? {schema: snapshot.schema, source: snapshot.source, updatedAt: snapshot.updatedAt,
      entries: snapshot.entries.map(entry => entry.imdbId), picks: snapshot.picks, warnings: snapshot.warnings} : null;
    send(response, 200, 'application/json', JSON.stringify({returnValue: true, snapshot: client, refreshing, error: lastError}));
    return;
  }
  const filename = path.resolve(directory, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!filename.startsWith(directory + path.sep)) { send(response, 403, 'text/plain', 'Forbidden'); return; }
  fs.readFile(filename, (error, content) => {
    if (error) { send(response, 404, 'text/plain', 'Not found'); return; }
    if (pathname === '/config.js') content = content.toString() + '\nwindow.FMTV_PREVIEW = true;\n';
    send(response, 200, mime[path.extname(filename)] || 'application/octet-stream', content);
  });
});
server.on('error', error => { console.error(error.message); process.exit(1); });

function rebuild(first) {
  const buildArgs = ['webos/build.py', '--preview', '--no-watchlist-sync'];
  if (args.includes('--config')) buildArgs.push('--config', path.resolve(args[args.indexOf('--config') + 1]));
  const child = spawn('python3', buildArgs, {cwd: root, stdio: 'inherit'});
  child.on('error', error => { console.error(error.message); process.exit(1); });
  child.on('exit', code => {
    if (code === 0) {
      try { load(); }
      catch (error) { console.error('Could not load the preview build: ' + error.message); return; }
      if (first) start();
    } else if (first) { process.exitCode = code || 1; return; }
  });
}

function start() {
  server.listen(port, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:' + port + ' — Ctrl+C to stop.'));
}

if (args.includes('--no-build')) { load(); start(); }
else rebuild(true);
