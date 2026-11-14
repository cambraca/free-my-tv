/* Phone-only qBittorrent view. Uses the same private backend as the TV layout. */
'use strict';
globalThis.PhoneTorrents = function ({pick, dialog, content, actions, progress, api, current, onRefresh, getPick, onViewChange}) {
  const node = (tag, text = '') => { const item = document.createElement(tag); item.textContent = text; return item; };
  let disposed = false, searchView = null, searchId = null, searchGeneration = 0;
  let pollTimer, statusTimer, statusBusy = false, seasonInfo = '', seasonError = '', jobs = [], season = 1, latest = [], displayedResults = '[]', frozen = false, downloading = false;
  let searchButton, searchStatus, rows, updateButton;
  const live = () => !disposed && current();
  const call = payload => api({...payload, imdbId: pick.imdbId});
  const maxSeason = Number(pick.seasons) || 999;
  const clamp = value => Math.max(1, Math.min(Math.floor(Number(value) || 1), maxSeason));
  function cancel(id) {
    if (id !== null && id !== undefined) call({action: 'cancel', searchId: id}).catch(() => {});
  }
  function stopSearch() {
    searchGeneration++; clearTimeout(pollTimer); cancel(searchId); searchId = null;
  }
  function drawStatus(error = '') {
    if (!live()) return;
    progress.replaceChildren();
    if (error) progress.append(node('p', error));
    if (seasonInfo) progress.append(node('p', seasonInfo));
    if (seasonError) progress.append(node('p', seasonError));
    if (!pick.options.length) jobs.filter(job => job.imdbId === pick.imdbId).forEach(job => {
      progress.append(node('p', (job.season ? 'S' + job.season + ' · ' : '') + Math.floor((job.progress || 0) * 100)
        + '% · ' + (job.complete ? 'Waiting for Plex…' : job.state)));
    });
    const tracked = jobs.some(job => job.imdbId === pick.imdbId && job.hash && job.state !== 'Removed from qBittorrent');
    if (searchButton) searchButton.hidden = tracked || (pick.options.length > 0 && pick.kind !== 'tv');
  }
  async function status() {
    if (!live() || statusBusy) return;
    clearTimeout(statusTimer);
    if (document.hidden) { statusTimer = setTimeout(status, 5000); return; }
    statusBusy = true;
    let delay = 5000;
    try {
      const result = await call({action: 'status'});
      if (!live()) return;
      const latestPick = getPick?.();
      if (latestPick) pick = {...pick, options: latestPick.options};
      jobs = result.jobs || []; drawStatus();
    } catch (error) { if (live()) drawStatus(error.message); delay = 60000; }
    finally {
      statusBusy = false;
      if (live()) statusTimer = setTimeout(status, delay);
    }
  }
  function back() {
    stopSearch();
    if (searchView) searchView.remove();
    searchView = null; content.hidden = false; onViewChange?.(false);
    if (live()) { drawStatus(); searchButton?.focus?.(); }
  }
  const resultSignature = results => JSON.stringify(results.map(({id, name, seeds, size}) => [id, name, seeds, size]));
  function refreshUpdateButton() {
    if (!updateButton) return;
    updateButton.hidden = !frozen || resultSignature(latest) === displayedResults;
    updateButton.parentElement.hidden = pick.kind !== 'tv' && updateButton.hidden;
  }
  function drawResults() {
    if (!live() || !searchView) return;
    rows.replaceChildren();
    latest.forEach(result => {
      // Each handler captures its stable ID, never a position in the changing backend ranking.
      const button = node('button'); button.className = 'torrent-result';
      const name = node('span', result.name); name.className = 'torrent-name';
      const stats = node('span'); stats.className = 'torrent-stats';
      stats.append(node('span', result.seeds + ' seeds'), node('span', (result.size / 1073741824).toFixed(1) + ' GB'));
      const download = node('span', 'Download'); download.className = 'torrent-download';
      button.append(name, stats, download);
      for (const event of ['pointerover', 'pointerdown', 'touchstart', 'focus']) button.addEventListener(event, () => { frozen = true; refreshUpdateButton(); });
      button.onclick = () => startDownload(result.id);
      button.disabled = downloading;
      rows.append(button);
    });
    displayedResults = resultSignature(latest); refreshUpdateButton();
  }
  async function startDownload(resultId) {
    if (downloading || !live() || !searchView) return;
    frozen = true;
    if (!resultId) { searchStatus.textContent = 'Download service is outdated. Restart the preview server, then search again.'; return; }
    downloading = true; clearTimeout(pollTimer);
    const id = searchId, generation = searchGeneration, selectedSeason = season;
    searchStatus.textContent = 'Starting download…';
    try {
      await call({action: 'download', searchId: id, resultId});
      if (!live()) return;
      // Keep tracking while qBittorrent resolves the hash, even if a status poll is temporarily offline.
      jobs.push({imdbId: pick.imdbId, season: pick.kind === 'tv' ? selectedSeason : 0, progress: 0, state: 'Adding torrent'});
      if (generation === searchGeneration) back();
      clearTimeout(statusTimer); await status(); onRefresh();
    } catch (error) {
      if (live() && generation === searchGeneration && searchView) searchStatus.textContent = error.message;
    } finally { downloading = false; }
  }
  function controls() {
    const bar = node('div'); bar.className = 'torrent-controls';
    if (pick.kind === 'tv') {
      bar.append(node('span', 'Season ' + season));
      for (const [step, label] of [[-1, '−'], [1, '+']]) {
        if (step < 0 && season === 1 || step > 0 && season >= maxSeason) continue;
        const button = node('button', label);
        button.setAttribute('aria-label', step < 0 ? 'Previous season' : 'Next season');
        button.onclick = () => { if (!downloading) { season = clamp(season + step); search(); } };
        bar.append(button);
      }
    }
    updateButton = node('button', 'Update results'); updateButton.onclick = () => { frozen = true; drawResults(); };
    updateButton.hidden = true; bar.append(updateButton);
    bar.hidden = pick.kind !== 'tv'; return bar;
  }
  async function search() {
    if (!live() || downloading) return;
    const previousSearchId = searchId;
    clearTimeout(pollTimer); searchId = null;
    const generation = ++searchGeneration;
    frozen = false; latest = []; displayedResults = '[]'; season = clamp(season);
    if (searchView) searchView.remove();
    searchView = node('section'); searchView.className = 'torrent-view detail-copy';
    searchView.append(node('h2', pick.title), controls());
    searchStatus = node('p', 'Searching…'); searchStatus.setAttribute('role', 'status');
    rows = node('div'); rows.className = 'torrent-results'; searchView.append(searchStatus, rows);
    content.hidden = true; dialog.append(searchView); dialog.scrollTop = 0; onViewChange?.(true);
    const valid = () => live() && generation === searchGeneration && !!searchView;
    try {
      const result = await call({action: 'search', season, previousSearchId});
      if (!valid()) { cancel(result.searchId); return; }
      if (result.searchId === undefined || result.searchId === null) throw new Error('Could not start search');
      searchId = result.searchId;
      async function poll() {
        if (!valid()) return;
        if (document.hidden || downloading) { pollTimer = setTimeout(poll, 2000); return; }
        try {
          const result = await call({action: 'results', searchId});
          if (!valid()) return;
          latest = (result.results || []).slice(0, 20);
          searchStatus.textContent = result.running ? 'Searching… (' + (result.results || []).length + ')' : (result.results || []).length + ' results';
          if (!frozen) drawResults();
          else refreshUpdateButton();
          if (result.running) pollTimer = setTimeout(poll, 2000);
        } catch (error) { if (valid()) searchStatus.textContent = error.message; }
      }
      await poll();
    } catch (error) { if (valid()) searchStatus.textContent = error.message; }
  }
  const ready = (async () => {
    await status();
    if (!live()) return;
    if (pick.kind === 'tv') {
      try {
        const result = await call({action: 'seasons'});
        if (!live()) return;
        season = clamp(result.next || 1);
        seasonInfo = result.seasons?.length ? 'Seasons in Plex: ' + result.seasons.join(', ') : '';
        drawStatus();
      } catch (error) { if (live()) { seasonError = error.message; drawStatus(); } }
    }
    if (!live() || pick.options.length && pick.kind !== 'tv') return;
    searchButton = node('button', 'Search torrents'); searchButton.onclick = search; actions.append(searchButton);
    searchButton.hidden = jobs.some(job => job.imdbId === pick.imdbId && job.hash && job.state !== 'Removed from qBittorrent');
  })();
  return {ready, back, get searching() { return !!searchView; }, dispose() {
    disposed = true; stopSearch(); clearTimeout(statusTimer);
    if (searchView) searchView.remove(); searchView = null; content.hidden = false; onViewChange?.(false);
  }};
};
