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
  console.log('node tools/preview.js [--port 43333] [--config path] [--no-build]');
  process.exit(0);
}
const propertiesPath = path.resolve(args.includes('--config') ? args[args.indexOf('--config') + 1] : path.join(root, 'config.properties'));
const properties = {};
if (fs.existsSync(propertiesPath)) fs.readFileSync(propertiesPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).forEach(line => {
  if (!line.trim() || line.trim().startsWith('#') || !line.includes('=')) return;
  const at = line.indexOf('='); properties[line.slice(0, at).trim()] = line.slice(at + 1).trim().replace(/^"|"$/g, '');
});
const bind = properties.preview_host || '127.0.0.1';
const token = properties.preview_token || '';
if (properties.tv_ip && !require('node:net').isIPv4(properties.tv_ip)) throw new Error('tv_ip must be an IPv4 address.');
if (properties.preview_url && token.length < 24) throw new Error('TV bridge requires preview_token with at least 24 characters.');
const remote = require('./preview-remote')({token, tvIp: properties.tv_ip || '', getState: account => {
  const state = lists.get(account);
  return {config: state?.config || config, snapshot: state?.snapshot, request};
}});
const port = args.includes('--port') ? Number(args[args.indexOf('--port') + 1]) : Number(properties.preview_port || 43333);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be between 1 and 65535.');
const clients = new Set();
const mime = {'.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf'};
let config, lists, Watchlist, request;
let torrents, titleDetails;
let building = false, queued = false, debounce;

function load() {
  const content = fs.readFileSync(path.join(directory, 'config.js'), 'utf8');
  const publicConfig = JSON.parse(content.split('window.CONFIG = ')[1].trim().replace(/;$/, ''));
  const nextConfig = {...publicConfig, ...JSON.parse(fs.readFileSync(path.join(directory, 'watchlist-backend.json'), 'utf8'))};
  for (const filename of ['./watchlist-network', '../web/watchlist', '../webos/service/qbittorrent', '../webos/service/plex-scan', '../webos/service/watchlists']) delete require.cache[require.resolve(filename)];
  Watchlist = require('../web/watchlist');
  request = require('./watchlist-network');
  const cacheDirectory = path.join(root, 'out', 'watchlist');
  fs.mkdirSync(cacheDirectory, {recursive: true});
  function sortFields(key, value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map(name => [name, value[name]]));
  }
  function pathFor(id) {
    const settings = {...nextConfig, imdbUserId: id};
    const keys = Object.keys(settings).filter(key => !['remoteUrl', 'remoteToken', 'imdbAccounts'].includes(key)).sort();
    const identity = crypto.createHash('sha256').update(JSON.stringify(Object.fromEntries(keys.map(key => [key, settings[key]])), sortFields)).digest('hex').slice(0, 16);
    return path.join(cacheDirectory, 'snapshot-' + identity + '.json');
  }
  lists?.dispose();
  config = nextConfig;
  lists = require('../webos/service/watchlists')(Watchlist, config, request, pathFor);
  delete require.cache[require.resolve('./preview-details')];
  titleDetails = require('./preview-details')(config, account => lists.get(account)?.snapshot, request);
  torrents = require('../webos/service/qbittorrent')(config, path.join(cacheDirectory, 'torrents.json'),
    lists.torrentSnapshot, scanPlex, lists.complete);
}

function logRefresh(start) {
  start(state => {
    if (state.error) { console.error(state.error); return; }
    console.log('Watchlist: ' + state.snapshot.entries.length + ' titles, '
      + state.snapshot.picks.filter(pick => pick.options.length).length + ' available.');
  });
}

function scanPlex() {
  require('../webos/service/plex-scan')(config, request, () => lists.refreshAll(logRefresh));
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
  if (remote.handle(incoming, response, pathname)) return;
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
  if (pathname === '/api/details') {
    if (incoming.method !== 'GET') { send(response, 405, 'text/plain', 'GET required'); return; }
    const query = new URL(incoming.url, 'http://localhost').searchParams;
    titleDetails(query.get('id'), (error, pick) => send(response, pick ? 200 : 404, 'application/json',
      JSON.stringify({pick, detailsError: error ? error.message : '', downloadsEnabled: !!config.qbitUrl})), query.get('account'));
    return;
  }
  if (pathname === '/api/watchlist') {
    const query = new URL(incoming.url, 'http://localhost').searchParams;
    const state = lists.get(query.get('account'));
    lists.refresh(state, query.get('refresh') === '1', logRefresh);
    const client = Watchlist.clientSnapshot(state?.snapshot, query.get('source'), query.get('updatedAt'));
    send(response, 200, 'application/json', JSON.stringify({returnValue: true, snapshot: client,
      refreshing: !!state?.running, error: state?.error || ''}));
    return;
  }
  if (pathname === '/watchlist-backend.json' || pathname === '/watchlist-service-seed.json') { send(response, 403, 'text/plain', 'Forbidden'); return; }
  if (['/', '/index.html', '/phone.html'].includes(pathname)) {
    pathname = require('./preview-mode')(incoming.url, incoming.headers['user-agent']) === 'remote' ? '/phone.html' : '/index.html';
  }
  if (['/phone.html', '/phone.css', '/phone.js', '/phone-torrents.js'].includes(pathname)) {
    fs.readFile(path.join(__dirname, 'phone', pathname.slice(1)), (error, content) => {
      send(response, error ? 404 : 200, mime[path.extname(pathname)], error ? 'Not found' : content);
    }); return;
  }
  const filename = path.resolve(directory, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!filename.startsWith(directory + path.sep)) { send(response, 403, 'text/plain', 'Forbidden'); return; }
  fs.readFile(filename, (error, content) => {
    if (error) { send(response, 404, 'text/plain', 'Not found'); return; }
    if (pathname === '/config.js') content = content.toString() + '\nwindow.FMTV_PREVIEW = true;\n';
    if (pathname === '/' || pathname === '/index.html') {
      content = content.toString().replace('width=1920, height=1080', 'width=device-width, initial-scale=1').replace('</body>', '<script>new EventSource("/preview-events").onmessage = function () { location.reload(); };</script></body>');
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
  server.listen(port, bind, () => console.log('Preview: http://' + bind + ':' + port + ' — watching source files. Ctrl+C to stop.'));
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
