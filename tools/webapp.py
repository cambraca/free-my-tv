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
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import translate  # noqa: E402  (the catalogues and the keys the web app uses)

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
    try:
        with open(path, encoding='utf-8-sig') as f:
            lines = f.readlines()
    except UnicodeDecodeError:   # Notepad's "Unicode" is UTF-16
        sys.exit('config.properties is saved as UTF-16 (Notepad\'s "Unicode"). Save it as UTF-8 and build again.')
    for line in lines:
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

    imdb_ids = [value.strip() for value in values.get('imdb_user_id', '').split(',') if value.strip()]
    if any(not re.fullmatch(r'(ur\d+|p\.[a-zA-Z0-9]+)', user_id) for user_id in imdb_ids):
        sys.exit('config.properties: imdb_user_id requires comma-separated IMDb user IDs (ur... or p....).')
    if len(imdb_ids) != len(set(imdb_ids)):
        sys.exit('config.properties: imdb_user_id contains duplicate IDs.')
    names = [value.strip() for value in values.get('imdb_name', '').split(',')]
    accounts = []
    for index, user_id in enumerate(imdb_ids):
        avatar = 'profiles/user%d.jpg' % (index + 1)
        accounts.append({'id': user_id, 'name': (names[index] if index < len(names) else '') or user_id,
                         'avatar': avatar if os.path.isfile(os.path.join(ROOT, 'web', avatar)) else ''})
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

    qbit_url = values.get('qbittorrent_url', '').rstrip('/')
    if qbit_url and not re.fullmatch(r'https?://[a-zA-Z0-9.-]+(?::[0-9]{1,5})?', qbit_url):
        sys.exit('config.properties: qbittorrent_url must be http(s)://hostname:port without a path.')

    if qbit_url and ':' in qbit_url.split('://')[1]:
        port = int(qbit_url.rsplit(':', 1)[1])
        if not 1 <= port <= 65535:
            sys.exit('config.properties: qbittorrent_url port must be between 1 and 65535.')

    remote_url = values.get('preview_url', '').rstrip('/')
    if remote_url and not re.fullmatch(r'http://[a-zA-Z0-9.-]+(?::[0-9]{1,5})?', remote_url):
        sys.exit('config.properties: preview_url must be http://computer-address:port without a path.')
    if remote_url and len(values.get('preview_token', '')) < 24:
        sys.exit('config.properties: preview_url requires preview_token with at least 24 characters.')

    return {
        'remoteUrl': values.get('preview_url', '').rstrip('/'),
        'remoteToken': values.get('preview_token', ''),
        'qbitUrl': qbit_url,
        'qbitUsername': values.get('qbittorrent_username', ''),
        'qbitPassword': values.get('qbittorrent_password', ''),
        'qbitMoviesPath': values.get('qbittorrent_movies_path', ''),
        'qbitShowsPath': values.get('qbittorrent_shows_path', ''),
        'tmdbKey': values.get('tmdb_key', ''),
        'tmdbRegion': values.get('tmdb_region', 'US') or 'US',
        'latitude': number('latitude', '40.7128'),
        'longitude': number('longitude', '-74.0060'),
        'city': values.get('city', ''),
        'language': values.get('language', 'auto') or 'auto',
        'temperature': values.get('temperature', 'auto') or 'auto',
        'imdbUserId': imdb_ids[0] if imdb_ids else '',
        'imdbAccounts': accounts,
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
    cache_config = {key: value for key, value in config.items() if key not in ('remoteUrl', 'remoteToken', 'imdbAccounts')}
    identity = hashlib.sha256(json.dumps(cache_config, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode('utf-8')).hexdigest()[:16]
    snapshot_path = os.path.join(directory, 'snapshot-' + identity + '.json')
    return config_path, snapshot_path


def watchlist_seed(config):
    """Refresh the build's private snapshot and bundle the last complete successful sync."""
    if not config.get('imdbUserId'):
        return None
    accounts = config['imdbAccounts']
    config_path = watchlist_paths(config)[0]
    paths = {account['id']: watchlist_paths(dict(config, imdbUserId=account['id']))[1] for account in accounts}
    with open(config_path, 'w', encoding='utf-8') as handle:
        json.dump(config, handle)
    if '--no-watchlist-sync' not in sys.argv:
        node = shutil.which('node')
        if node:
            result = subprocess.run([node, os.path.join(ROOT, 'tools', 'sync-watchlist.js'), config_path, json.dumps(paths)],
                                    check=False, env=dict(os.environ, NODE_NO_WARNINGS='1'))
            if result.returncode:
                print('Watchlist sync failed; bundling the last matching snapshot for each account, if available.')
        else:
            print('Install Node.js to preload your watchlist. The webOS service can also fetch it after installation.')
    seeds = {}
    for user_id, snapshot_path in paths.items():
        try:
            with open(snapshot_path, encoding='utf-8') as handle:
                seeds[user_id] = json.load(handle)
        except (OSError, ValueError):
            pass
    return seeds


def catalogues():
    """Each language's catalogue (app/assets/i18n), with only the keys the web app uses: {lang: {key: text}}."""
    keys = translate.web_keys()
    return {lang: {k: v for k, v in sorted(translate.load(lang).items()) if k in keys} for lang in translate.languages()}


def files(config, made_by):
    """The web app's files, {path inside the app: bytes}: web/, the settings, the catalogues, the app's symbols and font."""
    out = {}
    web = os.path.join(ROOT, 'web')
    profile_assets = {account['avatar'] for account in config.get('imdbAccounts', [])}
    for directory, _, names in os.walk(web):
        for name in sorted(names):
            path = os.path.join(directory, name)
            target = os.path.relpath(path, web).replace(os.sep, '/')
            if target.startswith('profiles/') and target not in profile_assets:
                continue
            with open(path, 'rb') as f:
                out[target] = f.read()
    with open(os.path.join(ROOT, 'webos', 'appinfo.json'), encoding='utf-8') as handle:
        version = json.load(handle)['version']
    out['version.js'] = ('window.APP_VERSION = %s;\n' % json.dumps(version)).encode('utf-8')
    out['version.js'] += ('window.IMDB_ACCOUNTS = %s;\n' % json.dumps(config.get('imdbAccounts', []))).encode('utf-8')
    out['config.js'] = ('/* Generated by %s. */\nwindow.APP_VERSION = %s;\nwindow.CONFIG = %s;\n'
                        % (made_by, json.dumps(version), json.dumps({key: value for key, value in config.items() if key not in ('qbitUsername', 'qbitPassword')}, ensure_ascii=False))).encode('utf-8')
    seed = watchlist_seed(config)
    out['watchlist-service-seed.json'] = json.dumps(seed, ensure_ascii=False).encode('utf-8')
    client_seeds = {}
    for user_id, snapshot in (seed or {}).items():
        client_seeds[user_id] = {key: snapshot[key] for key in ('schema', 'source', 'updatedAt', 'picks', 'warnings')}
        client_seeds[user_id]['entries'] = [entry['imdbId'] for entry in snapshot['entries']]
    out['watchlist-seed.js'] = ('window.WATCHLIST_SEEDS = %s;\n' % json.dumps(client_seeds, ensure_ascii=False)).encode('utf-8')
    out['i18n.js'] = ('/* Generated by %s from app/assets/i18n. */\nwindow.I18N_CATALOGUES = %s;\n'
                      % (made_by, json.dumps(catalogues(), ensure_ascii=False, separators=(',', ':')))).encode('utf-8')
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
    os.makedirs(out_dir, exist_ok=True)
    for path, content in app.items():
        target = os.path.join(out_dir, path)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=os.path.dirname(target), prefix='.fmtv-', delete=False) as handle:
            handle.write(content)
            temporary = handle.name
        os.replace(temporary, target)
    for directory, _, names in os.walk(out_dir):
        for name in names:
            target = os.path.join(directory, name)
            relative = os.path.relpath(target, out_dir).replace(os.sep, '/')
            if relative not in app and not name.startswith('.fmtv-'):
                try:
                    os.remove(target)
                except FileNotFoundError:
                    pass
