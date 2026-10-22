<div align="center">

<img src="docs/assets/icon-512.png" width="96" alt="">

# Free My TV

**A fast, ad-free home screen for Google TV, LG and Samsung TVs.**

Your IMDb watchlist on your own services, the weather at a glance, and a look that follows the sunset.<br>
Open source. Built with Claude Code. One button to undo.

[**freemytv.io**](https://freemytv.io) · [Install](#install) · [LG TVs](#lg-tvs-webos) · [Samsung TVs](#samsung-tvs-tizen) · [Any TV](#any-tv) · [Make it yours](#make-it-yours)

<img src=".github/preview.webp" width="880" alt="The Free My TV home screen: a glass shelf of apps, trending picks, and a drawer with the weather and crypto prices">

</div>

## What you get

- **No ads.** No sponsored rows, banners or autoplaying promos. Not one.
- **Your apps, front and center.** The streaming apps you actually use, on a glass shelf. Pick them and their order right on the TV.
- **Your watchlist on LG and Samsung.** Three fresh picks whenever you open the app, available on your configured services in your country. Recent additions are more likely to appear. Movies and Shows get their own tabs; local Plex copies take priority. Press Down from the app shelf to browse more titles.
- **Weather, one press away.** The hour-by-hour forecast, sunrise and sunset.
- **Light by day, dark by night.** It follows your city's real sunset, the way your phone does.
- **A screensaver to match.** Full-screen photos of the picks with a big glass clock.
- **Fast.** 60 fps, every frame in 16.6 ms, on the TV's own chip. The home screen uses 96 MB of memory instead of 242 MB (−60%).<br><sub>Measured on a 98″ TCL Google TV running Android 14.</sub>
- **Set up on the TV.** Language, your city, temperature, theme, the weather card, and the apps on the shelf, in Free My TV's own settings.
- **Safe.** No root. Nothing is uninstalled. One button brings back the factory home screen.

## Install

About ten minutes. You need a Google TV or Android TV (Android 9 or newer) and a computer on the same Wi-Fi.

### The easy way: Claude Code

1. **On the TV**, turn on developer mode: Settings → System → About → press *Android TV OS build* 7 times. Then Settings → System → Developer options → turn on **USB debugging**. Write down the TV's IP address (Settings → Network & Internet).
2. **On your computer**, get the code:
   ```bash
   git clone https://github.com/simbasjungles/free-my-tv && cd free-my-tv
   ```
3. **Open [Claude Code](https://claude.com/claude-code) in that folder** and say:
   > Install Free My TV on my TV at 192.168.1.50. I live in Lisbon.

   It installs the tools it needs, builds the app and puts it on your TV. Swap in your TV's IP and your city.
4. **On the TV**, open *Free My TV* → *Home Screen* → *Free My TV*, and accept the debugging prompt (tick *Always allow*).

### The manual way

1. **On the TV**, do step 1 above.
2. **Tools:** a JDK (17+), the Android SDK command-line tools (build-tools 34, platform android-34) and adb. On a Mac:
   ```bash
   brew install --cask temurin android-commandlinetools android-platform-tools
   sdkmanager "build-tools;34.0.0" "platforms;android-34"
   ```
   On Linux, get OpenJDK 17, Android's command-line tools and adb from your package manager, then run the same `sdkmanager` line. On Windows, use WSL.
3. **Build:**
   ```bash
   ./build.sh
   ```
   The first run creates `config.properties`. Set your city and your [TMDB key](#the-tmdb-key) there, then run it again.
4. **Install:**
   ```bash
   adb connect 192.168.1.50:5555
   adb install -r FreeMyTV.apk
   ```
   On TCL TVs, also let it run in the background (TCL blocks it by default, and the switch never starts):
   ```bash
   adb shell "appops set io.freemytv AUTO_START allow || appops set io.freemytv APP_AUTO_START allow"
   ```
5. **On the TV**, open *Free My TV* → *Home Screen* → *Free My TV*.

## LG TVs (webOS)

The same home screen as an LG app: watchlist picks, the glass shelf with your apps, a scrollable watchlist and compact weather, day and night, Home Settings and the shelf editor. It installs through LG's own Developer Mode, with nothing rooted or changed on the TV. LG's home screen stays where it is, and Free My TV is one press of a number key away.

You need an LG TV (webOS 3 or newer) and a computer on the same Wi-Fi, with Python 3.
Install Node.js on the computer too to preload the watchlist during the build.

1. **On the TV**, open the LG Content Store and install **Developer Mode**. Sign in with a free [LG developer account](https://webostv.developer.lge.com), turn on **Dev Mode Status** (the TV restarts), then turn on **Key Server**. Write down the IP address and the passphrase it shows.
2. **On your computer**, get the code and build. `config.properties` works as for Google TV (your city, your [TMDB key](#the-tmdb-key)):
   ```bash
   git clone https://github.com/simbasjungles/free-my-tv && cd free-my-tv
   python3 webos/build.py
   ```
3. **Install.** The first time, it asks for the TV's passphrase; updates don't:
   ```bash
   python3 webos/install.py 192.168.1.50
   ```
4. **On the TV**, while Free My TV is open, hold a number key on the remote. From then on, that key opens it from anywhere.

With Claude Code, say *"Install Free My TV on my LG TV at 192.168.1.50. I live in Lisbon."* It builds the app and hands you the install command, so you type the passphrase yourself.

Developer Mode lasts about 40 days: open the Developer Mode app now and then and press **EXTEND**. To remove Free My TV, run `python3 webos/install.py 192.168.1.50 --uninstall`.

### Browser preview with automatic rebuilds

With Node.js 22+ and Python 3 installed, run:

```bash
node tools/preview.js
```

Open **http://127.0.0.1:8000**. The server runs `python3 webos/build.py --preview` for you, watches the source
files and `config.properties`, and rebuilds and reloads the browser when they change. Watchlist requests run
through the local server, so browser cross-origin restrictions do not block IMDb or Plex. No npm install,
Docker, or TV connection is needed. Use `--port 8001` for another port; Ctrl+C stops the server.

Your existing `python3 webos/build.py --preview` command still works. To serve that already-built preview,
run `node tools/preview.js --no-build`. Both modes keep watching for changes. The watcher skips network syncing
during rebuilds; the preview refreshes stale watchlist data in the background and shares the build's private cache.

## Samsung TVs (Tizen)

The same home screen as a Samsung app: the cached picks, the shelf, the drawer with the inputs and weather, day and night, and its own settings. It installs through Samsung's own Developer Mode, with nothing rooted or changed on the TV, and Samsung's home screen stays where it is.

You need a Samsung TV from 2017 or newer (Tizen 3+) and a computer on the same Wi-Fi.

1. **On the TV**, open **Apps** and type `1 2 3 4 5` on the remote. Turn **Developer mode** on, type your computer's IP address in **Host PC IP**, and restart the TV.
2. **On your computer**, download [TizenBrew Installer](https://github.com/reisxd/TizenBrewInstaller/releases/latest), the community's installer for Samsung TVs, open it and connect to your TV.
3. **Install from GitHub:** type `simbasjungles/free-my-tv`. On 2023 and newer TVs it asks you to sign in to your Samsung account once, to sign the app for your TV.
4. **Straight to it:** in the TV's settings, under Start Screen Options, turn on **Autorun Last App**: the TV turns on into Free My TV.

This build takes your city from the TV's time zone. For your exact city and the trending picks, build it with your own `config.properties` and [TMDB key](#the-tmdb-key): open the folder in Claude Code and say *"Install Free My TV on my Samsung TV at 192.168.1.50. I live in Lisbon."* It sets up Samsung's tools, and on 2023 and newer TVs you sign in to your Samsung account in the browser to make the certificate.

## Settings

The first values come from `config.properties`, created by the first build (Google TV, LG and Samsung use the same file). Most of them can also be changed on the TV, in *Free My TV* → *Home Settings*, and the TV's choice wins:

| Key | What it does | Default |
|---|---|---|
| `tmdb_key` | Your free TMDB key, for the picks | empty |
| `tmdb_region` | Your country (two letters): which titles are on which app | `US` |
| `imdb_user_id` | Public IMDb watchlist user ID, such as `ur12345` or `p.…` (LG/Samsung) | empty |
| `watchlist_services` | Services you subscribe to: `netflix`, `mubi`, `plex`, comma-separated | `netflix,mubi,plex` |
| `plex_host` | Plex server IP or hostname, without a scheme, port or path | empty |
| `plex_port` | Plex API port | `32400` |
| `plex_token` | Optional Plex authentication token | empty |
| `latitude`, `longitude` | Your city, for the weather and the sunset | New York |
| `city` | The name on the weather card | `Weather` |
| `language` | `auto` (follows the TV), `en`, `es`, `pt`, `ru` or `de` | `auto` |
| `temperature` | `C`, `F` or `auto` | `auto` |
| `disable_assistant` | Also turn off Google Assistant | `false` |

Changed something? Run `./build.sh` and install again. Keep `freemytv.keystore`: updates are signed with it.

### IMDb watchlist and Plex (webOS)

Make your IMDb watchlist **Public**, then set `imdb_user_id` to the user ID from its URL. For example:

```properties
imdb_user_id=p.ni7x2s4olrk7zu2gpfl7o5jkuq
watchlist_services=netflix,mubi,plex
plex_host=192.168.100.12
plex_port=32400
plex_token=
```

`plex_host` is just the address; the app constructs the API URL. If Plex requires authentication, add its
`X-Plex-Token` as `plex_token` in your local config. A TMDB key enables country-specific subscription matches;
Plex can match IMDb IDs without one. Availability data comes from JustWatch through TMDB. An installed app must
also be listed in `watchlist_services` to supply picks. Plex matches only your server's movie and show libraries,
using IMDb/TMDB IDs; Plex's unrelated online catalog is excluded. Shows must have episodes in the library.

Run `python3 webos/build.py --preview`. The build crawls the watchlist newest-first through every cursor page,
matches its entries, and bundles a snapshot for the very first launch. The private build cache is in `out/watchlist/`.
On webOS, a packaged JavaScript service refreshes stale data in the background when the app opens, independently
of the UI, and can finish after you leave the app. Refreshes happen at most every six hours; the service stores a
complete snapshot in `/media/internal`, and the UI also uses `localStorage`. Failed requests keep the last good
data, with an on-screen status. Updates can clear packaged apps' `localStorage`, so the bundled snapshot matters.
No separate server is required. A private IMDb watchlist cannot be fetched without an IMDb login; login credentials
are not collected by this app.

Explore mixes movies and shows; Movies and Shows filter that same watchlist. Picks stay stable while browsing,
and reshuffle when the app opens or returns to the foreground. The previous featured titles are avoided when
enough alternatives exist. A weighted shuffle favors recently added entries while still giving older entries a chance. If a title is
in Plex, it also gets extra weight; if it is on a subscription service too, its card opens Plex first. Browser previews and Samsung builds use the
bundled snapshot; the local preview server also supports live background refreshes. The packaged background
service is specific to webOS. Android keeps its existing recommendation source.

Title cards now pass a title target when launching an app. TMDB's API only provides provider names, so the matcher
also reads the title's TMDB watch page to extract actual Netflix/MUBI destinations. Netflix receives its own
catalog URL, never an IMDb or TMDB ID. Some app/firmware versions may ignore launch parameters. If no destination
can be resolved, the app opens normally and Free My TV displays the title to search for. Exact title navigation
still needs checking on your TV. Crypto widgets and their settings are disabled, including previously saved toggles.

Press **Down** from the app shelf to browse the selected tab's full available watchlist in four columns. The app
shelf stays at the top. A compact weather widget sits beside Settings on the featured page. Use arrows to scroll, Page Up/Down to move
faster, or the mouse/Magic Remote wheel. Back returns to the featured page. The selected tab is remembered. The
grid only renders nearby rows to keep memory and image requests low on the TV. Live TV and input shortcuts are disabled.
In this larger grid, Explore uses a uniform shuffle, while Movies and Shows sort by watchlist addition date,
newest first. The three featured picks keep their separate weighted shuffle.
Custom IMDb item notes appear over the artwork while a title is focused, using large white text on a translucent
dark background. Movie runtimes use hours and minutes, for example `1h 28m`.

**Settings → Refresh IMDb and Plex** immediately crawls the entire watchlist and scans Plex again, bypassing
the usual cache interval. Removed watchlist titles disappear after a successful crawl; removed Plex copies are
dropped after a complete successful library scan, with another subscription service used when available. If Plex
cannot connect, times out, or returns an incomplete scan, its last successful library remains available until a
later successful refresh. A confirmed empty watchlist or Plex library clears the corresponding entries.

### The TMDB key

Free, and it takes two minutes: create an account at [themoviedb.org](https://www.themoviedb.org/signup), then open [Settings → API](https://www.themoviedb.org/settings/api) and request a developer key. Paste the *API Read Access Token* (or the *API Key*) after `tmdb_key=`. It's your key: `config.properties` stays out of git.

## Going back

On the TV: *Free My TV* → *Home Screen* → *Original*. The factory home screen, screensaver and every app come back exactly as they were. If the new home screen ever crashes three times in five minutes, it switches back by itself.

To remove it for good, switch to *Original* first, then uninstall *Free My TV* (Settings → Apps).

## What it changes

- It becomes the home screen and the screensaver.
- It turns off, without uninstalling:
  - the stock home screen and screensaver;
  - Google TV's recovery home, Play Games and YouTube Music;
  - on TCL TVs, the TCL Channel, messages, store demo, hotel menu, manuals, mirroring and logging apps;
  - on Philco TVs, AI PONT (promo channels and app downloads) and the manual;
  - on Multilaser TVs, Anoki's screen-content recognition (ACR), the store demo and the manual;
  - Google Assistant, only with `disable_assistant=true`.
- On TCL TVs, the remote's Netflix, YouTube and Prime buttons keep working through a small accessibility service that only reads those buttons. Pick what each one opens in *Free My TV* → *Remote Buttons*; *Original* turns the service off. On Vestel-made TVs (F&U and other store brands) the same goes for the Netflix button.
- Picture, sound, inputs, remote pairing, Google services and the Play Store are on a protected list, checked before every change.
- Apps that saved a Wi-Fi network are never turned off, since Android would erase the network. If the TV's first setup saved yours, the switch asks you to forget the network and connect again in Settings first (saved networks out of range don't show there; Claude Code can remove them).

## Any TV

Free My TV runs on Google TV and Android TV: TCL, Sony, Hisense, Philips, Xiaomi, Vestel-made TVs (F&U) and more, plus streamers like Chromecast with Google TV, the Google TV Streamer, onn 4K and NVIDIA Shield. And on [LG](#lg-tvs-webos) and [Samsung](#samsung-tvs-tizen) TVs, as an app.

**Any other TV:** plug a Google TV streamer into HDMI and free that one. Same steps, same home screen.

**A different brand or model:** ask Claude. Free My TV is made to be adapted by AI. Open the folder in Claude Code and say *"set it up for my Sony"*: it reads your TV, finds its home screen and its promo apps, updates the lists below and walks you through a test. [CLAUDE.md](CLAUDE.md) tells it how.

| What | Where |
|---|---|
| Apps to turn off | `DEBLOAT` in [`HomeMode.java`](app/src/io/freemytv/HomeMode.java) |
| Apps never to touch | `PROTECTED` in the same file |
| Apps on the shelf | `SHELF` in [`HomeApps.java`](app/src/io/freemytv/HomeApps.java) |
| Your brand's live TV app | `LIVE_TV_APPS` in the same file |

## Make it yours

It's your code, and Claude Code finds its way around it. Try:

- *"Add Crunchyroll to the shelf."*
- *"Add Spanish."*
- *"Switch to the night look an hour after sunset."*

## How it works

- **A plain Android app, no Gradle, no libraries.** [`build.sh`](build.sh) runs aapt2 → javac → d8 → zipalign → apksigner and makes a 2 MB APK.
- **It uses the TV's own ADB, from inside the TV.** The app connects to `127.0.0.1:5555` with its own key (that's the *Allow USB debugging?* prompt) and runs the same commands you would: `cmd package set-home-activity`, `settings put secure screensaver_components`, `pm disable-user`. Nothing listens to the network.
- **Drawn by hand on one Canvas**, with Android 13 shaders for the frosted glass and the sky (plain fills on Android 9 to 12, with lighter shadows and no GPU layers on 9 to 11 for their older GPUs).
- **A safety net.** A watchdog in a separate process brings back the stock home screen after three crashes in five minutes, and a boot check keeps your choice after TV updates.
- **On LG and Samsung, the same design in plain HTML, CSS and JavaScript** ([`web/`](web)), written for the Chromium of older TVs, with no frameworks. [`webos/build.py`](webos/build.py) packs it with `config.properties` into an `.ipk` without LG's tools, and [`webos/install.py`](webos/install.py) installs it through Developer Mode; on LG it lists and opens apps through the TV's own service bus (Luna), as LG's launcher does. [`tizen/build.py`](tizen/build.py) packs the same app into a Samsung `.wgt`, which uses Tizen's web APIs for the apps and the inputs. To preview it on a computer: `python3 webos/build.py --preview`, then open `out/webos/index.html` (a stand-in lists sample apps).
- **Data** from IMDb (your public watchlist), TMDB/JustWatch (title metadata and subscription availability), your Plex server (local library matches), and Open-Meteo (forecast, sunrise and sunset). Android retains its existing TMDB recommendation source.

| File | What it is |
|---|---|
| [`HomeView.java`](app/src/io/freemytv/HomeView.java) | The home screen |
| [`HomeMode.java`](app/src/io/freemytv/HomeMode.java) | Switching between Free My TV and Original |
| [`Adb.java`](app/src/io/freemytv/Adb.java) | The TV's own ADB, from inside the TV |
| [`Recs.java`](app/src/io/freemytv/Recs.java) | The picks (TMDB) |
| [`HomeData.java`](app/src/io/freemytv/HomeData.java) | Weather and prices |
| [`HomeApps.java`](app/src/io/freemytv/HomeApps.java) | The shelf, inputs and All Apps |
| [`DreamView.java`](app/src/io/freemytv/DreamView.java) | The screensaver |
| [`SettingsActivity.java`](app/src/io/freemytv/SettingsActivity.java) | The settings screen (the app's icon) |
| [`Prefs.java`](app/src/io/freemytv/Prefs.java) | Settings changed on the TV |
| [`RemoteKeys.java`](app/src/io/freemytv/RemoteKeys.java) | The TCL remote's app buttons |
| [`Watchdog.java`](app/src/io/freemytv/Watchdog.java) | The safety net |
| [`web/home.js`](web/home.js) | The home screen on LG TVs |
| [`web/tv.js`](web/tv.js) | The TV's apps and inputs, on LG and Samsung |
| [`webos/build.py`](webos/build.py), [`webos/install.py`](webos/install.py) | The LG app package and its install |
| [`tizen/build.py`](tizen/build.py) | The Samsung app package |

The website ([freemytv.io](https://freemytv.io)) is in [`docs/`](docs): plain HTML, CSS and JS on GitHub Pages.

## Privacy

No analytics or tracking. The web app reads your public IMDb watchlist, TMDB/JustWatch availability, your configured
Plex server, and Open-Meteo (with the coordinates you set, or your time zone's main city). Your configuration,
optional Plex token and watchlist caches stay on your computer and TV. Personal build packages contain your
configuration and cached watchlist; use `--generic` for a package to share.

## Credits

- Built with [Claude Code](https://claude.com/claude-code).
- The LG version builds on what [@danielthejoker18](https://github.com/danielthejoker18) found in [FreeMyTvWebOS](https://github.com/danielthejoker18/FreeMyTvWebOS) (MIT): installing through Developer Mode and opening apps through the TV's service bus.
- On Samsung TVs it installs with [TizenBrew Installer](https://github.com/reisxd/TizenBrewInstaller) by [@reisxd](https://github.com/reisxd).
- This product uses the TMDB API but is not endorsed or certified by [TMDB](https://www.themoviedb.org/).
- Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0). Prices from the [Binance](https://www.binance.com/) public API.
- Icons: [Material Symbols](https://fonts.google.com/icons) (Apache 2.0). Font: [Inter](https://rsms.me/inter/) (SIL OFL 1.1). Coin logos: [cryptocurrency-icons](https://github.com/spothq/cryptocurrency-icons) (CC0).
- Not affiliated with Google, TCL, LG, Samsung or any streaming service. App names and logos belong to their owners.

## License

[MIT](LICENSE). Fork it, change it, ship it.
