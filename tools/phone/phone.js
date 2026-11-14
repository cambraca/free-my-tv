/* Served only by the preview. The TV's fixed-stage renderer is left untouched. */
'use strict';
if (globalThis.APP_VERSION) document.getElementById('brand-version').textContent = 'v' + globalThis.APP_VERSION;
const status = document.getElementById('status');
const connectionStatus = document.getElementById('connection');
let picks = [], tab = 'all', busy = false, limit = 40, detailGeneration = 0;
async function json(url, options) {
  const response = await fetch(url, options), value = await response.json();
  if (!response.ok || value.error) throw new Error(value.error || 'Request failed');
  return value;
}
async function command(payload) {
  if (busy) return;
  busy = true; status.textContent = '';
  try {
    await json('/api/remote/command', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
  } catch (error) { status.textContent = error.message; }
  finally { busy = false; }
}
function element(tag, text) { const node = document.createElement(tag); node.textContent = text; return node; }
function renderDetails(pick) {
  const dialog = document.getElementById('details');
  const content = document.getElementById('detail-content');
  content.replaceChildren();
  const artwork = pick.backdrop || pick.poster;
  if (artwork) {
    const image = document.createElement('img');
    image.className = 'detail-art' + (pick.backdrop ? '' : ' poster-fallback');
    image.src = artwork;
    image.alt = '';
    image.onerror = () => { image.hidden = true; };
    content.append(image);
  }
  const copy = element('div', ''); copy.className = 'detail-copy';
  const title = element('h2', pick.title); title.id = 'detail-title';
  const badge = element('p', pick.kind === 'tv' ? 'TV show' : 'Movie'); badge.className = 'detail-badge';
  copy.append(badge, title);
  const genres = pick.genres || [], genreNames = genres.map(genre => genre.toLowerCase());
  const metadata = (pick.meta || '').split(' · ').filter(part => !genreNames.includes(part.toLowerCase()));
  if (pick.kind === 'tv') {
    if (pick.seasons > 1) metadata.push(pick.seasons + ' seasons');
    else if (pick.seasons === 1 && pick.episodes > 0) metadata.push(pick.episodes + (pick.episodes === 1 ? ' episode' : ' episodes'));
  }
  if (metadata.length) { const meta = element('p', metadata.join(' · ')); meta.className = 'detail-meta'; copy.append(meta); }
  const genreRow = element('div', ''); genreRow.className = 'detail-genres';
  genres.forEach(genre => genreRow.append(element('span', genre))); copy.append(genreRow);
  if (pick.rating > 0) { const rating = element('p', '★ ' + Number(pick.rating).toFixed(1) + ' / 10 · TMDB'); rating.className = 'detail-rating'; copy.append(rating); }
  const actions = element('div', ''); actions.className = 'detail-actions';
  copy.append(actions);
  content.append(copy);
  pick.options.forEach(option => {
    const button = element('button', 'Open on TV · ' + option.service);
    button.onclick = () => { document.getElementById('details').close(); command({action: 'launch', imdbId: pick.imdbId, app: option.app}); };
    actions.append(button);
  });
  const people = pick.credits || {};
  const credits = element('div', ''); credits.className = 'detail-credits';
  function credit(label, names) {
    if (!names?.length) return;
    const row = element('p', ''); row.append(element('strong', label + ': '), element('span', names.join(', '))); credits.append(row);
  }
  credit(pick.kind === 'tv' ? 'Created by' : 'Directed by', pick.kind === 'tv' ? people.creators : people.directors);
  credit('Cast', people.cast); copy.append(credits);
  if (pick.overview) copy.append(element('p', pick.overview));
  if (pick.note) { const note = element('div', ''); note.className = 'detail-note'; note.append(element('strong', 'Your note'), element('p', pick.note)); copy.append(note); }
  const progress = element('div', ''); progress.id = 'detail-progress'; copy.append(progress);
}
async function details(pick) {
  const generation = ++detailGeneration, dialog = document.getElementById('details');
  renderDetails(pick);
  document.body.classList.add('details-open'); dialog.showModal(); dialog.scrollTop = 0;
  const current = () => generation === detailGeneration && dialog.open;
  try {
    const data = await json('/api/details?id=' + encodeURIComponent(pick.imdbId));
    if (!current()) return;
    const scroll = dialog.scrollTop;
    renderDetails(data.pick || pick); dialog.scrollTop = scroll;
    const progress = document.getElementById('detail-progress');
    if (data.downloadsEnabled) {
      const torrentInfo = async action => json('/api/torrents', {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action, imdbId: pick.imdbId})});
      const results = await Promise.allSettled([torrentInfo('status'), ...(pick.kind === 'tv' ? [torrentInfo('seasons')] : [])]);
      if (!current()) return;
      results.forEach((result, index) => {
        if (result.status === 'rejected') { progress.append(element('p', result.reason.message)); return; }
        if (index === 1) {
          if (result.value.seasons?.length) progress.append(element('p', 'Seasons in Plex: ' + result.value.seasons.join(', ')));
        }
        else if (!pick.options.length) (result.value.jobs || []).filter(job => job.imdbId === pick.imdbId).forEach(job => {
          progress.append(element('p', (job.season ? 'S' + job.season + ' · ' : '') + Math.floor((job.progress || 0) * 100) + '% · '
            + (job.complete ? 'Waiting for Plex…' : job.state)));
        });
      });
    }
  } catch (error) {
    // Optional enrichment failed; keep the title information already displayed.
  }
}
function render() {
  const list = document.getElementById('titles'), query = document.getElementById('search').value.toLowerCase(); list.replaceChildren();
  const matching = picks.filter(pick => pick.title.toLowerCase().includes(query) && (tab === 'watched' ? pick.watched : !pick.watched)
    && (tab === 'watched' || (tab === 'unavailable' ? !pick.options.length : pick.options.length))
    && (tab !== 'movie' && tab !== 'tv' || pick.kind === tab));
  matching.slice(0, limit).forEach(pick => {
    const card = element('button', ''); card.className = 'card';
    if (pick.poster) { const img = document.createElement('img'); img.src = pick.poster; img.alt = ''; img.loading = 'lazy'; card.append(img); }
    card.append(element('strong', pick.title), element('small', pick.meta || '')); card.onclick = () => details(pick); list.append(card);
  });
  if (matching.length > limit) { const more = element('button', 'Show more'); more.onclick = () => { limit += 40; render(); }; list.append(more); }
  if (!list.children.length) list.append(element('p', 'No matching titles.'));
}
document.getElementById('details').addEventListener('close', () => { detailGeneration++; document.body.classList.remove('details-open'); });
document.getElementById('close').onclick = () => document.getElementById('details').close();
document.getElementById('search').oninput = () => { limit = 40; render(); };
document.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => {
  tab = button.dataset.tab; limit = 40;
  document.querySelectorAll('[data-tab]').forEach(item => item.setAttribute('aria-pressed', String(item === button))); render();
});
async function load() {
  if (document.hidden) return;
  try {
    const data = await json('/api/watchlist');
    if (data.snapshot) { picks = data.snapshot.picks; render(); }
    connectionStatus.textContent = data.refreshing ? 'Refreshing watchlist…' : picks.length + ' titles';
    if (!busy) {
      const connection = await json('/api/remote/status');
      connectionStatus.textContent += connection.connected ? '' : ' · TV not connected';
    }
  } catch (error) { connectionStatus.textContent = error.message; }
}
load(); setInterval(load, 15000);
