# Customizations in the cambraca fork

This is the preservation guide for [cambraca/free-my-tv](https://github.com/cambraca/free-my-tv), forked from
`simbasjungles/free-my-tv`. Read it alongside `CLAUDE.md` before editing code or resolving upstream merges.
These differences are intentional, not omissions to repair by restoring upstream defaults. Change them only when
the user asks, and update this document when they change. Upstream-oriented descriptions in the README and project
guide do not override these fork-specific requirements.

## Scope and working rules

- The primary target is the user's LG webOS TV. The shared `web/` UI also affects Tizen and the browser preview.
- Android retains its native UI and upstream recommendation source. The IMDb watchlist, custom branding, and web
  Settings layout have not been ported to Android. Cryptocurrency features are disabled on Android too.
- `origin` is the upstream repository; `cambraca` is the user's fork remote. Do not swap those roles or rewrite
  existing commits just to merge upstream changes. Do not push unless explicitly requested.
- The user handles deployment and TV interaction. Do not connect to, pair with, install on, or change their TV
  while doing development unless explicitly requested. Local builds, browser checks, and mocked platform APIs are
  sufficient; do not assume native deep links have been verified on the TV.
- Edit sources under `web/`, `tools/`, and `webos/`, not generated copies under `out/webos/`, even when an attached
  editor link points there. Keep unrelated user and IDE changes out of task commits.
- Keep upstream's safety mechanisms and native platform fixes. Disabling launcher shortcuts does not authorize
  disabling or removing protected TV apps, system inputs, networking, or the original-home recovery path.

## Disabled cryptocurrency and TV-input features

### Cryptocurrency

There must be no visible Bitcoin, Ethereum, Solana, crypto, quotes-widget, or price-widget option or content.
Do not restore these features when merging improvements to upstream prices, settings, or screensavers.

- The shared web UI has no active quotes row, prices panel, cryptocurrency settings, or Binance requests.
  `coins.js` is neither generated nor loaded. Some former code remains commented out deliberately.
- Old saved preferences must not re-enable anything. The web preference/data APIs no longer expose the crypto
  feature, Android `Prefs.quotes()` always returns `false`, and `build.sh` forces `CRYPTO=false` regardless of local
  `show_crypto` values.
- Android's settings exclude quotes and coin rows. Preserve newer upstream rows such as Navigation sounds and
  their correct indices rather than reverting the entire settings class.
- `show_crypto` and `currency` are not active options in the example configuration. Do not put their controls or
  setup instructions back into this fork's feature documentation.
- Removed UI strings must also be removed from Android translation catalogues when they become unused; run
  `python3 tools/translate.py --check` instead of retaining dead UI to satisfy the catalogue validator.

Key files: `web/data.js`, `web/home.js`, `web/home.css`, `web/index.html`, `tools/webapp.py`, `build.sh`,
`app/src/io/freemytv/Prefs.java`, `app/src/io/freemytv/SettingsActivity.java`, `app/assets/i18n/`.

### TV inputs and Live TV

- The shared web launcher has no HDMI, antenna, other TV-input, or Live TV shortcut, discovery call, or selection
  menu. The only top-right action is Settings, beside the compact weather widget.
- Keep input/source launch paths commented out and keep filtering these entries out of All Apps. Hiding buttons
  alone is not enough if a merge exposes the same inputs elsewhere.
- The **TV Settings** action is intentional and stays available. It is not a Live TV shortcut.
- This is a web-launcher customization, not a request to remove native TV system functionality or Android's
  protected-app lists.

Key files: `web/tv.js`, `web/home.js`.

## IMDb watchlist, Plex, and streaming matches

### Configuration and recommendation source

Explore, Movies, and Shows in the web UI must come exclusively from the configured public IMDb watchlist, filtered
to titles available on the user's configured services. Do not fall back to trending titles, general recommendations,
or arbitrary Plex content when the watchlist is empty, unavailable, or still loading. Show an appropriate status
or the last valid cached watchlist instead.

Configuration belongs in the ignored local `config.properties`; `config.example.properties` documents its shape:

| Key | Contract |
| --- | --- |
| `imdb_user_id` | Public IMDb user/profile ID, either `ur...` or `p....`, not a full watchlist URL. |
| `watchlist_services` | Comma-separated `netflix`, `mubi`, and/or `plex`; default `netflix,mubi,plex`. |
| `tmdb_key` | Private TMDB key or read-access token for metadata and subscription availability. |
| `tmdb_region` | Two-letter country used for subscription availability; do not assume the US. |
| `plex_host` | Server IP or hostname only: no scheme, port, `/web/index.html`, or other path. |
| `plex_port` | Separate Plex API port; default `32400`. |
| `plex_token` | Optional private authentication token, never a committed value. |

Keep the local values local; do not hard-code the user's IMDb ID, Plex address, or tokens into sources or new
documentation. Native Android's newer upstream `watchmode_key`, `hide_services`, and `hide_animation` options remain
available there; they do not replace the web watchlist matcher or add a generic recommendation fallback.

### Complete public watchlist crawling

- `web/watchlist.js` is the shared ES5 module used by the UI, build-time sync, preview backend, and webOS service.
  IMDb has no stable official public watchlist API in this integration: it reads the site's anonymous GraphQL data,
  without collecting IMDb login credentials or cookies.
- Resolve `p....` profile IDs to the `ur...` user ID, then use `predefinedList(classType: WATCH_LIST).items`.
  The working cursor query uses `$after: ID`, not `String`. Switching to `titleListItemSearch` previously produced
  misleading access errors for a public list; an invalid cursor type produced HTTP 400.
- Crawl every cursor page, newest additions first, retaining addition dates/ranks, title IDs, type, artwork, and
  custom item notes. Do not silently cap the list to one page or a small number of titles.
- Repeated/non-advancing cursors, missing page data, access errors, and HTTP failures are failures, not proof of an
  empty list. Preserve the last complete data and report the problem rather than replacing it with partial data.
- IMDb's public visibility can differ from what its logged-in UI claims. The integration must work anonymously;
  do not solve visibility issues by embedding a personal session.

### Matching and Plex priority

- Match titles by IMDb IDs and exact TMDB resolution, not fuzzy title searches. Use TMDB's country-specific
  subscription availability for Netflix and MUBI; an app must also be installed and enabled in `watchlist_services`.
- Scan every page of the configured Plex server's movie and show libraries, matching IMDb/TMDB GUIDs. This is the
  user's local library, not Plex's online catalogue. Movies need playable media; shows need available episodes.
- Plex matches can work without a TMDB key. With TMDB available, retain its metadata/artwork and provider matches.
- If Plex and another service both have a title, launch Plex first. Featured sampling also gives Plex extra weight.
  This does not make Plex more likely in the uniformly shuffled Explore grid.
- Keep `tools/watchlist-network.js` usable on the older Node runtime of the webOS service: redirects, gzip,
  timeouts, and response/error handling are shared with the local tools. Its working `FreeMyTV/1.0` user agent is
  intentional; a browser-like user agent previously caused TMDB watch-page HTTP 403 responses.

### Immediate startup, background refresh, and safe removals

Preserve all three persistence layers, rather than making every app launch wait for a crawl:

1. `tools/sync-watchlist.js`, called through `tools/webapp.py`, preloads data during builds. The private build cache
   is `out/watchlist/snapshot-<config-hash>.json`. Bundle the client seed and the full service seed for first launch.
2. The packaged `io.freemytv.watchlist` webOS service refreshes stale data independently of the UI using an
   ActivityManager activity. Its durable cache is `/media/internal/io.freemytv.watchlist.json`.
3. The UI uses `localStorage` for the watchlist and preferences. Bundled seeds remain important because installed
   app updates can clear web storage. Validate source/config identity before reusing any snapshot.

Normal freshness is six hours, with throttled retries after failures; manual refresh bypasses freshness checks.
The preview backend uses the same matching code and private build cache. Tizen receives the bundled snapshot but
does not have the webOS Luna background service.

**Settings → Refresh IMDb and Plex** must trigger a full watchlist crawl, metadata/provider refresh, and Plex scan,
show busy/completion/error feedback, and avoid overlapping sync jobs. Keep this wired through the UI, TV bridge,
preview endpoint (`/api/watchlist?refresh=1`), and Luna service (`force: true`).

- A successful complete IMDb crawl replaces membership: removed watchlist items disappear.
- A successful complete Plex scan replaces library availability: missing copies disappear or fall back to another
  available subscription service. A title removed from IMDb is not retained merely because Plex still has it.
- An offline, timed-out, malformed, or partial Plex scan must retain the previous **complete** Plex library for
  the same source. Never replace it with an empty library or only the pages that happened to succeed.
- A confirmed, successfully fetched empty watchlist/library is different from a failed fetch and must clear the
  relevant data. Use atomic cache writes so interrupted refreshes do not corrupt the last saved snapshot.
- Preserve note-cache migration: `notesReady` forces old snapshots without note fields to be recrawled while
  keeping their usable cached metadata and Plex fallback. Do not discard all saved data just to upgrade notes.

Key files: `web/watchlist.js`, `web/data.js`, `web/tv.js`, `tools/watchlist-network.js`, `tools/sync-watchlist.js`,
`tools/webapp.py`, `tools/preview.js`, `webos/service/`, `webos/build.py`.

## Featured picks versus the larger browsing grid

These two selection policies are deliberately different. Do not share one ordering algorithm just to simplify code.

| Surface | Required selection/order |
| --- | --- |
| Top three featured picks, every tab | Semi-random weighted sampling favoring recent watchlist additions and Plex. |
| Bottom-page Explore grid | Uniform shuffle; no recency or Plex weighting. |
| Bottom-page Movies/Shows grids | Deterministic watchlist addition date descending, newest first, with stable tie-breakers. |

- Featured picks reshuffle on a new load, native relaunch, or return from a hidden/background state. Use a new
  session seed, avoid the previous featured three when enough alternatives exist, and keep picks stable during
  ordinary browsing. Deduplicate near-simultaneous foreground/relaunch events rather than reshuffling twice.
- The grid uses `Watchlist.browse` / `Data.browse`; the featured cards use their separate weighted catalogue.
  Plex is still the preferred launch provider for an Explore-grid title, even though its position is unweighted.
- Remember the selected Explore/Movies/Shows tab across app launches. Each tab also retains its grid position
  while switching tabs in a session; do not reset the tab to Explore when reopening the app.
- Screensaver artwork comes from the available watchlist picks, not a restored upstream trending feed.

## Web home-screen layout and appearance

### Branding, apps, and dark mode

- The title is **TV**, with the supplied `web/logo pato.png` duck image to its left. Do not restore **For You** or
  **CCCL**, or rename/remove the supplied image accidentally while packaging assets.
- Default shelf order: **Netflix, YouTube, MUBI, Spotify, Plex**, when installed. Other upstream default streaming
  services are intentionally not added to this shelf. All Apps and the shelf editor remain available for other apps.
- Use the bundled PNG logos in `web/logos/` even when webOS cannot expose app icons. Keep the black brand tiles,
  MUBI logo inversion, and normal app-icon/text fallbacks. Do not replace them with plain app-name tiles.
- The main app shelf is smaller and lower than upstream's original layout, with space below the featured row.
  Current measurements on the 1920×1080 stage: tiles at most 220px wide and 104px high, 32px gaps, platter at y=878
  with height 150px, tile y=901, focused scale 1.12. Preserve the compact appearance when adapting upstream sizing.
- Dark mode needs light inherited text for the title/grid/weather, appropriate muted secondary text, a legible
  dark weather surface, and inverted duck artwork. Check both themes; removing explicit colors can regress this.

### Two pages and TV-friendly cards

- The top/featured page contains the title, three tabs, three featured titles, and app shelf. A compact weather
  widget sits immediately left of Settings at the top-right.
- Down from the shelf opens the selected tab's larger watchlist grid. The app shelf stays pinned above it.
  The bottom page has **four columns**, no duplicate page title, and no weather widget.
- Do not reintroduce the removed “More titles”, “Back to featured”, or `33–40 / 143` status/footer bar. Its space
  belongs to the grid. The current viewport begins at y=258 and shows two complete rows plus a following-row preview.
- Support remote arrows, Page Up/Down, mouse/Magic Remote wheel, and Back. Back returns to the featured page;
  moving up from the first grid row reaches the shelf. Keep focus and browsing state separate so hovering the
  shelf does not unexpectedly close the grid.
- Render only nearby grid rows to limit image requests and TV memory use. Only fully visible rows accept pointer
  interaction; partially visible rows must not cause runaway scrolling when hovered.
- Extract custom IMDb item notes and show them **only while the title is focused**, over its artwork on a
  translucent dark overlay with large white text. Current font sizes are 38px on the large featured card and 34px
  on the smaller featured/grid cards. Preserve TV-distance readability, wrapping/clamping, and dark-mode contrast.
- Movie lengths use hours/minutes, such as **1h 28m**, not **88 min**. Normalize old cached metadata as well as
  newly fetched metadata.

### Settings

The web popup is called **Settings**, not **Home Settings**. Its visible rows are:

1. Theme
2. Refresh IMDb and Plex
3. All Apps
4. Shelf
5. TV Settings

Language, Temperature, and Weather widget controls are intentionally hidden here, not removed from configuration
or preferences. Crypto controls are disabled, not merely hidden. Preserve focus-row indices and the return from
the shelf editor after changing settings. Android keeps its separate native settings layout.

Key files: `web/index.html`, `web/home.js`, `web/home.css`, `web/data.js`, `web/strings.js`, `web/logos/`,
`web/logo pato.png`.

## Title-specific launch links

- Keep `TV.launchPick` and pass the selected title through both featured-card and grid activation paths.
- Resolve real Netflix/MUBI destinations from the title's TMDB watch page. Netflix needs its own numeric catalogue
  URL, never an IMDb or TMDB ID disguised as a Netflix ID.
- On webOS, preserve Netflix's `contentTarget` plus `contentId: 'm=' + url`; Plex uses the matched library item's
  `plex://server/...` destination. Other app/firmware versions may ignore launch parameters.
- When no exact URL is available, open the app normally and show the title-search toast instead of launching an
  invalid target. Native title navigation remains dependent on the installed app/firmware and needs TV testing;
  do not claim this is universally fixed merely because browser checks pass.

## Browser preview and packaging

Use Node.js 22+ and Python 3; no Docker, npm install, or TV connection is required:

```sh
node tools/preview.js
```

Open `http://127.0.0.1:8000`. This serves the build over HTTP so JavaScript runs without `file://` security issues,
builds the webOS preview, watches source/configuration changes, and rebuilds/reloads the page automatically.

- Keep the user's existing build command, `python3 webos/build.py --preview`, working. To serve an already-built
  preview, use `node tools/preview.js --no-build`; this also watches for changes. `--port` and `--config` are supported.
- Preview rebuilds use `--no-watchlist-sync` so editing CSS/JS does not synchronously recrawl the whole watchlist.
  The backend refreshes stale data separately, avoiding browser cross-origin restrictions for IMDb and Plex.
- Keep the server bound to localhost: generated config and caches can contain credentials and personal data.
  Restart the server after changing `tools/preview.js` itself; a browser reload does not reload the server process.
- Keep atomic per-file preview output writes. Deleting the entire preview directory on each rebuild caused races
  with concurrent watchers and requests.
- Package web subdirectories recursively, including both this fork's `web/logos/` and upstream's `web/icons/`.
  Preserve webOS service packaging alongside the client seed; a UI-only IPK loses durable background refresh.
- Personal build artifacts contain config and cached watchlist data. Never commit `config.properties`, tokens,
  signing keys, `out/`, or built packages, and do not share personal builds. Use `--generic` for shareable builds.

## Merging upstream safely

Keep upstream fixes that do not conflict with this fork's requirements, especially native Android compatibility,
recovery/safety, remote buttons, translations, and TV-platform discovery. Do not resolve every conflict by taking
one entire side: API migrations can require combining both sides.

The first upstream merge needed these specific combinations; future merges must preserve them too:

- Android settings use upstream's single-key `Ui.tr("English")` API and JSON catalogues, retain Navigation sounds,
  and have correct City/Weather indices, while still excluding every crypto row. Never restore old two-argument
  calls after upstream removes that API, or leave obsolete catalogue keys after deleting their last UI use.
- WebOS app discovery retains upstream's Luna → paired local remote-control API / `getAppLoadStatus` known-app
  detection fallbacks, including refusal persistence, rather than assuming every sample app is installed. Include **MUBI (`com.mubi`)**
  in the known-app list so it does not disappear on TVs that deny `listLaunchPoints`. Browser samples stay separate.
- Samsung keeps upstream's bundled icons, corrected app names, duplicate-Netflix/internal-app filtering, and
  Settings-menu fallback, without restoring input shortcuts or changing this fork's shelf selection.
- `reopened()` retains upstream's `PalmSystem.activate()` foreground fix **and** this fork's session reshuffle,
  selected-tab retention, and full UI refresh.
- Upstream's shelf-height calculations must not leave undefined variables or restore the old oversized shelf.
  Reconcile dimensions with this fork's CSS and pinned-grid placement, not just the conflict-marker lines.
- Build configuration keeps this fork's watchlist/Plex keys and crypto-off behavior while retaining upstream
  Android options. Shared web packaging must still include every asset directory and the watchlist service.
- Keep this document and its `AGENTS.md` link; an upstream README or guide describing quotes, inputs, generic
  trending picks, or opening preview files directly is not permission to restore those behaviors here.

### Validation checklist

1. Inspect the complete resolved diff, including automatically merged lines adjacent to conflicts. Check for
   remaining conflict markers and whitespace errors with `git diff --check` and `git diff --cached --check`.
2. Keep browser and webOS-service code ES5-compatible; Node-only preview tooling may use modern JavaScript.
   Run syntax checks on changed JS, `bash -n build.sh`, and Python compilation checks for changed build tools.
3. Run `python3 tools/translate.py --check` after changes affecting Android strings/catalogues.
4. Build locally with `python3 webos/build.py --preview --no-watchlist-sync` when preserving the existing cache is
   sufficient, or without `--no-watchlist-sync` when intentionally testing a real sync. Run `./build.sh` only when
   Android validation is needed and the SDK/JDK are available; it deletes `out/`, including the web build/cache.
5. Smoke-test the local HTTP preview: three watchlist picks, four grid columns, correct per-tab order, compact
   shelf, top-page weather, focused notes, readable dark mode, and exactly the intended Settings options. Reopen
   the app and verify the featured picks refresh without resetting the tab.
6. For matching/refresh changes, verify full pagination, watchlist removals, Plex removals, confirmed empty data,
   offline/malformed/partial Plex responses retaining the last complete library, and forced-refresh propagation.
   Use mocks for platform discovery, pairing, and launches instead of connecting to the TV.
7. Stage only intended source/docs changes. Verify no private config/cache/artifacts or unrelated user changes are
   included. Commit when requested; do not push or deploy as part of resolving a merge.
