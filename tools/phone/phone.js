/* Served only by the preview. The TV's fixed-stage renderer is left untouched. */
'use strict';
if (globalThis.APP_VERSION) document.getElementById('brand-version').textContent = 'v' + globalThis.APP_VERSION;
const status = document.getElementById('status');
const connectionStatus = document.getElementById('connection');
const previewLocation = PreviewLocation.read();
let picks = [], tab = previewLocation.tab || 'all', titleToRestore = previewLocation.title;
let busy = false, limit = 40, detailGeneration = 0, torrentPanel = null;
const accounts = globalThis.IMDB_ACCOUNTS || [];
const accountKey = 'fmtv.imdbAccount';
function stored(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch (error) { return null; }
}
let activeAccount = PreviewLocation.selectAccount(accounts, previewLocation.account, stored(accountKey));
let accountGeneration = 0;
function accountQuery() { return activeAccount ? 'account=' + encodeURIComponent(activeAccount) : ''; }
function rememberLocation(title) {
  PreviewLocation.write(tab, title, activeAccount);
  document.getElementById('tv-layout').href = '/?mode=tv' + location.hash;
}
function renderProfiles() {
  if (accounts.length < 2) return;
  const holder = document.getElementById('profiles');
  holder.hidden = false;
  holder.replaceChildren();
  accounts.forEach(profile => {
    const button = element('button', '');
    button.title = profile.name;
    button.setAttribute('aria-label', profile.name);
    button.disabled = profile.id === activeAccount;
    button.setAttribute('aria-pressed', String(profile.id === activeAccount));
    const face = element('span', profile.name.charAt(0).toUpperCase());
    face.className = 'profile-face';
    if (profile.avatar) {
      const image = document.createElement('img');
      image.alt = '';
      image.onerror = () => image.remove();
      image.src = profile.avatar;
      face.append(image);
    }
    button.append(face, element('span', profile.name));
    button.onclick = () => {
      if (activeAccount === profile.id) return;
      activeAccount = profile.id;
      accountGeneration++;
      titleToRestore = '';
      rememberLocation();
      try { localStorage.setItem(accountKey, JSON.stringify(activeAccount)); } catch (error) {}
      picks = []; limit = 40;
      connectionStatus.textContent = 'Loading watchlist…';
      for (const item of holder.children) {
        item.disabled = item === button;
        item.setAttribute('aria-pressed', String(item.disabled));
      }
      render(); load();
    };
    holder.append(button);
  });
}
async function json(url, options) {
  const response = await fetch(url, options), value = await response.json();
  if (!response.ok || value.error) throw new Error(value.error || 'Request failed');
  return value;
}
async function command(payload) {
  if (busy) return;
  busy = true; status.textContent = '';
  try {
    await json('/api/remote/command', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...payload, account: activeAccount})});
  } catch (error) { status.textContent = error.message; }
  finally { busy = false; }
}
function element(tag, text) { const node = document.createElement(tag); node.textContent = text; return node; }
function renderDetails(pick, ratings) {
  const dialog = document.getElementById('details');
  const content = document.getElementById('detail-content');
  content.replaceChildren();
  function addArtwork(src, className) {
    if (!src) return;
    const image = document.createElement('img');
    image.className = 'detail-art ' + className;
    image.loading = 'lazy';
    image.src = src;
    image.alt = '';
    image.onerror = () => { image.hidden = true; };
    content.append(image);
  }
  addArtwork(pick.backdrop || pick.poster, 'detail-portrait-art' + (pick.backdrop ? '' : ' poster-fallback'));
  addArtwork(pick.poster, 'detail-poster');
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
  const ratingRow = element('p', ''); ratingRow.className = 'detail-rating'; ratingRow.id = 'detail-ratings';
  TitleRatings.render(ratingRow, pick, ratings, 'preview'); copy.append(ratingRow);
  const actions = element('div', ''); actions.id = 'detail-actions'; actions.className = 'detail-actions';
  copy.append(actions);
  content.append(copy);
  const progress = element('div', ''); progress.id = 'detail-progress'; copy.append(progress);
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
}
async function details(pick) {
  titleToRestore = '';
  rememberLocation(pick.imdbId);
  torrentPanel?.dispose(); torrentPanel = null;
  const generation = ++detailGeneration, dialog = document.getElementById('details');
  renderDetails(pick);
  document.body.classList.add('details-open'); dialog.showModal(); dialog.scrollTop = 0;
  const current = () => generation === detailGeneration && dialog.open;
  const titleQuery = '?id=' + encodeURIComponent(pick.imdbId) + (activeAccount ? '&' + accountQuery() : '');
  let detailedPick = pick, ratings;
  json('/api/ratings' + titleQuery).then(data => {
    if (!current()) return;
    ratings = data.ratings;
    TitleRatings.render(document.getElementById('detail-ratings'), detailedPick, ratings, 'preview');
  }).catch(() => {});
  try {
    const data = await json('/api/details' + titleQuery);
    if (!current()) return;
    const scroll = dialog.scrollTop;
    detailedPick = data.pick || pick;
    renderDetails(detailedPick, ratings); dialog.scrollTop = scroll;
    const progress = document.getElementById('detail-progress');
    if (data.downloadsEnabled) {
      torrentPanel = PhoneTorrents({pick: data.pick || pick, dialog, content: document.getElementById('detail-content'),
        actions: document.getElementById('detail-actions'), progress,
        api: payload => json('/api/torrents', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)}),
        current, onRefresh: load, getPick: () => picks.find(item => item.imdbId === pick.imdbId),
        onViewChange: searching => {
          const back = document.getElementById('close');
          back.textContent = searching ? '← Back to details' : '← Back to titles';
          if (searching) back.focus?.();
        }});
      await torrentPanel.ready;
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
document.getElementById('details').addEventListener('close', () => {
  detailGeneration++; torrentPanel?.dispose(); torrentPanel = null; document.body.classList.remove('details-open');
  rememberLocation();
});
document.getElementById('close').onclick = () => {
  if (torrentPanel?.searching) torrentPanel.back();
  else document.getElementById('details').close();
};
document.getElementById('search').oninput = () => { limit = 40; render(); };
const tabButtons = document.querySelectorAll('[data-tab]');
function updateTabs() { tabButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tab === tab))); }
updateTabs();
tabButtons.forEach(button => button.onclick = () => {
  tab = button.dataset.tab; limit = 40; titleToRestore = '';
  rememberLocation();
  updateTabs(); render();
});
async function load() {
  if (document.hidden) return;
  const generation = accountGeneration;
  try {
    const data = await json('/api/watchlist' + (activeAccount ? '?' + accountQuery() : ''));
    if (generation !== accountGeneration) return;
    if (data.snapshot) {
      const source = data.snapshot.source;
      const legacy = stored('fmtv.watched');
      const watched = source && (stored('fmtv.watched.' + source) || (legacy?.source === source ? legacy : null));
      picks = data.snapshot.picks.map(pick => watched?.ids?.[pick.imdbId] ? {...pick, watched: true} : pick);
      render();
      const restored = titleToRestore && picks.find(pick => pick.imdbId === titleToRestore);
      if (restored) details(restored);
    }
    connectionStatus.textContent = data.refreshing ? 'Refreshing watchlist…' : picks.length + ' titles';
    if (!busy) {
      const connection = await json('/api/remote/status');
      if (generation === accountGeneration) connectionStatus.textContent += connection.connected ? '' : ' · TV not connected';
    }
  } catch (error) { if (generation === accountGeneration) connectionStatus.textContent = error.message; }
}
rememberLocation(titleToRestore);
renderProfiles(); load(); setInterval(load, 15000);
