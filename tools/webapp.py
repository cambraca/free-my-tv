"""What the LG (webos/build.py) and Samsung (tizen/build.py) packages share: the settings and the web app's files.

The settings come from config.properties, the same file as the Android build. --generic leaves it out (the GitHub
release is built that way): no TMDB key, and the TV's time zone picks the city and the region.
"""
import json
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

GENERIC = {'tmdbKey': '', 'tmdbRegion': '', 'latitude': '', 'longitude': '', 'city': '', 'language': 'auto',
           'temperature': 'auto', 'imdbUserId': '', 'watchlistServices': ['netflix', 'mubi', 'plex'],
           'plexHost': '', 'plexPort': 32400, 'plexToken': ''}


def config_from_args(args):
    """The settings for these command-line arguments (--generic, --config PATH or config.properties)."""
    if '--generic' in args:
        return dict(GENERIC)
    path = os.path.join(ROOT, 'config.properties')
    if '--config' in args:
        path = os.path.abspath(args[args.index('--config') + 1])
    return read_config(path)


def read_config(path):
    if not os.path.exists(path):
        shutil.copy(os.path.join(ROOT, 'config.example.properties'), path)
        print('Created config.properties: add your TMDB key and your city there (optional), then build again.')
    values = {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            values[key.strip()] = value.strip().strip('"')

    def number(key, default):
        v = values.get(key, '') or default
        if not re.match(r'^-?\d+(\.\d+)?$', v):
            sys.exit('config.properties: %s must be a number (got "%s")' % (key, v))
        return v

    imdb_user = values.get('imdb_user_id', '')
    if imdb_user and not re.fullmatch(r'(ur\d+|p\.[a-zA-Z0-9]+)', imdb_user):
        sys.exit('config.properties: imdb_user_id must be an IMDb user ID, not a URL.')
    plex_host = values.get('plex_host', '')
    if plex_host and not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9.-]*', plex_host):
        sys.exit('config.properties: plex_host must be an IP address or hostname without http://, port or path.')
    plex_port = values.get('plex_port', '32400') or '32400'
    if not plex_port.isdigit() or not 1 <= int(plex_port) <= 65535:
        sys.exit('config.properties: plex_port must be between 1 and 65535.')
    services = [value.strip().lower() for value in values.get('watchlist_services', 'netflix,mubi,plex').split(',')
                if value.strip()]
    if any(service not in ('netflix', 'mubi', 'plex') for service in services):
        sys.exit('config.properties: watchlist_services supports netflix, mubi and plex.')

    return {
        'tmdbKey': values.get('tmdb_key', ''),
        'tmdbRegion': values.get('tmdb_region', 'US') or 'US',
        'latitude': number('latitude', '40.7128'),
        'longitude': number('longitude', '-74.0060'),
        'city': values.get('city', ''),
        'language': values.get('language', 'auto') or 'auto',
        'temperature': values.get('temperature', 'auto') or 'auto',
        'imdbUserId': imdb_user,
        'watchlistServices': services,
        'plexHost': plex_host,
        'plexPort': int(plex_port),
        'plexToken': values.get('plex_token', ''),
    }


def watchlist_paths(config):
    """Private build configuration and snapshot paths for this exact source."""
    directory = os.path.join(ROOT, 'out', 'watchlist')
    os.makedirs(directory, exist_ok=True)
    config_path = os.path.join(directory, 'config.json')
    identity = hashlib.sha256(json.dumps(config, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode('utf-8')).hexdigest()[:16]
    snapshot_path = os.path.join(directory, 'snapshot-' + identity + '.json')
    return config_path, snapshot_path


def watchlist_seed(config):
    """Refresh the build's private snapshot and bundle the last complete successful sync."""
    if not config.get('imdbUserId'):
        return None
    config_path, snapshot_path = watchlist_paths(config)
    with open(config_path, 'w', encoding='utf-8') as handle:
        json.dump(config, handle)
    node = shutil.which('node')
    if '--no-watchlist-sync' in sys.argv:
        pass
    elif node:
        result = subprocess.run([node, os.path.join(ROOT, 'tools', 'sync-watchlist.js'), config_path, snapshot_path],
                                check=False, env=dict(os.environ, NODE_NO_WARNINGS='1'))
        if result.returncode:
            print('Watchlist sync failed; bundling the last matching snapshot, if available.')
    else:
        print('Install Node.js to preload your watchlist. The webOS service can also fetch it after installation.')
    try:
        with open(snapshot_path, encoding='utf-8') as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return None


def files(config, made_by):
    """The web app's files, {path inside the app: bytes}: web/, the settings, the app's symbols and font."""
    out = {}
    web = os.path.join(ROOT, 'web')
    for directory, _, names in os.walk(web):
        for name in sorted(names):
            path = os.path.join(directory, name)
            target = os.path.relpath(path, web).replace(os.sep, '/')
            with open(path, 'rb') as f:
                out[target] = f.read()
    out['config.js'] = ('/* Generated by %s. */\nwindow.CONFIG = %s;\n'
                        % (made_by, json.dumps(config, ensure_ascii=False))).encode('utf-8')
    seed = watchlist_seed(config)
    out['watchlist-service-seed.json'] = json.dumps(seed, ensure_ascii=False).encode('utf-8')
    client_seed = None
    if seed:
        client_seed = {key: seed[key] for key in ('schema', 'source', 'updatedAt', 'picks', 'warnings')}
        client_seed['entries'] = [entry['imdbId'] for entry in seed['entries']]
    out['watchlist-seed.js'] = ('window.WATCHLIST_SEED = %s;\n' % json.dumps(client_seed, ensure_ascii=False)).encode('utf-8')
    symbols = os.path.join(ROOT, 'app', 'assets', 'symbols')
    for name in sorted(os.listdir(symbols)):
        if name.endswith('.png') or name.startswith('LICENSE'):
            with open(os.path.join(symbols, name), 'rb') as f:
                out['symbols/' + name] = f.read()
    for name in ('InterVariable.ttf', 'OFL.txt'):
        with open(os.path.join(ROOT, 'app', 'assets', 'fonts', name), 'rb') as f:
            out['fonts/' + name] = f.read()
    return out


def preview(app, out_dir):
    """Leaves the app's files in out_dir, to open index.html in a browser."""
    if os.path.isdir(out_dir):
        shutil.rmtree(out_dir)
    for path, content in app.items():
        target = os.path.join(out_dir, path)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, 'wb') as f:
            f.write(content)
