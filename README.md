<div align="center">

<img src="docs/assets/icon-512.png" width="96" alt="">

# Free My TV

**A fast, ad-free home screen for Google TV, LG and Samsung TVs.**

Trending picks from your own apps, the weather at a glance, and a look that follows the sunset.<br>
Open source. Built with Claude Code. One button to undo.

[**freemytv.io**](https://freemytv.io) · [Install](#install) · [LG TVs](#lg-tvs-webos) · [Samsung TVs](#samsung-tvs-tizen) · [Any TV](#any-tv) · [Make it yours](#make-it-yours)

<img src=".github/preview.webp" width="880" alt="The Free My TV home screen: a compact shelf of apps, watchlist picks, and weather">

</div>

## What you get

- **No ads.** No sponsored rows, banners or autoplaying promos. Not one.
- **Your apps, front and center.** The streaming apps you actually use, on a glass shelf. Pick them and their order right on the TV.
- **Trending, not sponsored.** Three fresh picks every hour (up to six, in Home Settings) from what's trending this week and the latest releases, only from apps you already have, and from the services you choose. The focused one opens wide and the others show their posters. Movies and Shows get their own tabs, and on Google TV your own [Plex library](#your-plex-library-optional) can join in.
- **Continue Watching** (Google TV and Android TV). *Home Settings* → *Top of the screen* puts what you left halfway in your apps on top, with its progress, and OK picks it up in its app. Or a big clock, or the picks.
- **Your TMDB key from your phone.** *Home Settings* → *TMDB key* shows a QR code: scan it and paste the key. On LG and Samsung, type it with the remote.
- **Weather at a glance.** A compact weather widget on the web launcher; Android retains its native forecast.
- **Live TV or your box on HDMI, one press away** (LG and Samsung). *Home Settings* → *Live TV button* picks what the first top button opens: Live TV, as before, or one of the TV's HDMI inputs, shown under the name you gave the input on the TV when it has one.
- **What's playing.** Music, a podcast or the radio going on in the background shows on the home screen and the screensaver: the title, the artist and the app, from any app that tells Android what it plays (*Home Settings*, off until you turn it on).
- **The status at a glance, and a mouse** (Google TV and Android TV). *Home Settings* → *Status icons* puts Wi-Fi or Ethernet, Bluetooth audio and a USB drive at the top of the home screen; off, nothing listens for them. A mouse or an air-mouse remote works too: hover moves the focus, the wheel scrolls, a click picks.
- **Light by day, dark by night.** It follows your city's real sunset, the way your phone does.
- **A screensaver to match.** Full-screen photos of the picks with a big glass clock. On LG and Samsung, *Home Settings* → *Screensaver* can make it a large clock with the weather instead, drifting slowly so it doesn't burn into OLED screens. Optionally (*Watch from the screensaver*, in Home Settings), OK opens the title on screen in its app, and any other button just closes it.
- **Dimming for a dark room** (LG and Samsung). *Home Settings* → *Dim* darkens Free My TV's own screens, not the apps you open: low, medium, high, or automatic (medium from 22:00 to 07:00). Off until you pick it.
- **Your own photos** (Google TV and Android TV). Send them from your computer (up to 100): the screensaver shows them, and without picks one is the home screen's background each hour.
- **Fast.** 60 fps, every frame in 16.6 ms, on the TV's own chip. The home screen uses 96 MB of memory instead of 242 MB (−60%).<br><sub>Measured on a 98″ TCL Google TV running Android 14.</sub>
- **Set up on the TV.** Language, your city, temperature, theme, how many picks and which streaming services they come from, the weather forecast and the apps on the shelf, in Free My TV's own settings.
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
   If the install seems stuck, look at the TV: on Android 14, Google Play Protect may hold it with *Risky app blocked* ("built for an older version of Android"), since Free My TV targets Android 13. Choose *More details* → *Install anyway*. Updates don't ask again.

   Chromecast with Google TV on Android 14 keeps port 5555 closed even with USB debugging on: turn on *Wireless debugging* (Developer options), pair with `adb pair <address:port> <code>`, then run `adb tcpip 5555` over that connection. Port 5555 closes again at every restart, so after one, *Original*, the watchdog and the boot check can't reach ADB until you run `adb tcpip 5555` again (the pairing stays).

   On TCL TVs, also let it run in the background (TCL blocks it by default, and the switch never starts). An uninstall takes the permission back, so run it again after every new install:
   ```bash
   adb shell "appops set io.freemytv AUTO_START allow || appops set io.freemytv APP_AUTO_START allow"
   ```
5. **On the TV**, open *Free My TV* → *Home Screen* → *Free My TV*. The TV asks *Allow USB debugging?* once more, now for Free My TV itself: tick *Always allow* and accept. (Run `adb disconnect 192.168.1.50:5555` first: on Android 8 to 10 the TV can hand that answer to a computer that's still connected.)

   On some TCL TVs (Android 11, Realtek), a second background killer, TGuard, can stop the switch while it measures the original home screen: the settings screen closes and the TV's own home screen stays. Android runs the switch again by itself within a minute or two; then press Home: Free My TV opening means it went through.

## LG TVs (webOS)

The same home screen as an LG app: the picks, the glass shelf with your apps, the watchlist browsing grid and compact weather, day and night, Home Settings and the shelf editor. It installs through LG's own Developer Mode, with nothing rooted or changed on the TV. LG's home screen stays where it is, and Free My TV is one press of a number key away (or in LG's app list, on remotes without them).

You need an LG TV (webOS 3 or newer) and a computer on the same Wi-Fi, with Python 3.

1. **On the TV**, open the LG Content Store and install **Developer Mode**. Sign in with a free [LG developer account](https://webostv.developer.lge.com), turn on **Dev Mode Status** (the TV restarts), then turn on **Key Server**. Write down the IP address and the passphrase it shows.
2. **On your computer**, get the code and build. `config.properties` works as for Google TV (your city, your [TMDB key](#the-tmdb-key)):
   ```bash
   git clone https://github.com/simbasjungles/free-my-tv && cd free-my-tv
   python3 webos/build.py
   ```
3. **Install.** The first time, it asks for the TV's passphrase; updates don't. On a TV that isn't 4K, it puts the app in at 1280 × 720, the size those TVs draw apps at:
   ```bash
   python3 webos/install.py 192.168.1.50
   ```
4. **On the TV**, while Free My TV is open, hold a number key on the remote. From then on, that key opens it from anywhere. On a remote without number keys, open it from LG's app list on the home screen, like any other app.

With Claude Code, say *"Install Free My TV on my LG TV at 192.168.1.50. I live in Lisbon."* It builds the app and hands you the install command, so you type the passphrase yourself.

With the [webOS Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel), you can skip the computer: add the repository `https://freemytv.io/webos/apps.json` in the Channel's settings, and Free My TV shows up in its list. That's the release build: it takes the city from the TV's time zone (change it in *Home Settings* → *City*), and for the picks you type your [TMDB key](#the-tmdb-key) in *Home Settings* → *TMDB key*. If you installed your own build, don't update it from there, or the release replaces it. On some LG TVs that aren't 4K, that build fills only the top-left part of the screen: `install.py` puts it in at the right size there.

On webOS 6 and newer, LG doesn't let apps installed through Developer Mode see which apps the TV has. Free My TV then shows the well-known ones it finds (Netflix, YouTube, Prime Video, Disney+, Apple TV, Plex and more) and asks the TV, once, for the access LG's phone app uses: a message on the TV asks whether to allow Free My TV. Allow it, and from the next start all your apps show, with their icons.

Older LG TVs (webOS 3) don't let Free My TV see their apps at all, so the shelf stays empty. There your computer asks the TV instead (the TV asks once whether to allow it), and the list and icons are built into the app. Run it again after installing new apps on the TV:
```bash
python3 webos/apps.py 192.168.1.50 && python3 webos/build.py && python3 webos/install.py 192.168.1.50
```

Developer Mode lasts about 40 days: open the Developer Mode app now and then and press **EXTEND**, or let your computer do it with `python3 webos/renew.py 192.168.1.50` (it needs the TV on and reachable, and the key `install.py` already saved). Run that on a schedule and you never touch EXTEND again — weekly is plenty; `webos/renew.py` shows a cron line for macOS and Linux and a Task Scheduler one for Windows. To remove Free My TV, run `python3 webos/install.py 192.168.1.50 --uninstall`.

## Samsung TVs (Tizen)

The same home screen as a Samsung app, with everything the LG one has: the picks, the shelf, the watchlist browsing grid and weather, day and night, and its own settings. It installs through Samsung's own Developer Mode, with nothing rooted or changed on the TV, and Samsung's home screen stays where it is.

You need a Samsung TV on Tizen, from 2015 or newer, and a computer on the same Wi-Fi (a 2015 UE48JU6100 on Tizen 2.3 was reported working, #317, while a 2016 Full HD UE49K5670 refuses developer installs altogether, with `failed[118]` even from Samsung's own `tizen install`, #349 (but this is fixable — see [tizen/install-118.md](tizen/install-118.md)): on a 2016 UE49KU6640 and a UN49KU6400 the same answer was a copy left by an earlier failed install, which `python3 tizen/install.py <IP> --uninstall` removed (sign with a Tizen certificate there: a Samsung one kept getting it on the KU6400); Orsay models can't run it, but a Google TV streamer on HDMI can). 2015 and 2016 TVs can't run TizenBrew, so on those build it yourself (below); TV Settings isn't in the drawer there, since apps can't open the TV's settings, nor on 2017 and 2018 TVs (Tizen 3 and 4), which freeze trying (#257); the remote's own Settings button works on all of them.

1. **On the TV**, open **Apps** and type `1 2 3 4 5` on the remote. Turn **Developer mode** on, type your computer's IP address in **Host PC IP**, and restart the TV.
2. **On your computer**, download [TizenBrew Installer](https://github.com/reisxd/TizenBrewInstaller/releases/latest), the community's installer for Samsung TVs, open it and connect to your TV.
3. **Install from GitHub:** type `simbasjungles/free-my-tv`. On 2023 and newer TVs it asks you to sign in to your Samsung account once, to sign the app for your TV.
4. **Straight to it:** in the TV's settings, under Start Screen Options, turn on **Autorun Last App**: the TV turns on into Free My TV (tested on a 2017 TV; 2019 and 2020 TVs don't reopen it, #356). There, move Free My TV to the first place in the Home bar, so it's one press away.

This build takes your city from the TV's time zone. For your exact city and the trending picks, build it with your own `config.properties` and [TMDB key](#the-tmdb-key): open the folder in Claude Code and say *"Install Free My TV on my Samsung TV at 192.168.1.50. I live in Lisbon."* It sets up Samsung's tools, and on 2023 and newer TVs you sign in to your Samsung account in the browser to make the certificate.

## Settings

The first values come from `config.properties`, created by the first build (Google TV, LG and Samsung use the same file). Most of them can also be changed on the TV, in *Free My TV* → *Home Settings*, and the TV's choice wins:

| Key | What it does | Default |
|---|---|---|
| `tmdb_key` | Your free TMDB key, for the picks | empty |
| `tmdb_region` | Your country (two letters): which titles are on which app | `US` |
| `latitude`, `longitude` | Your city, for the weather and the sunset | New York |
| `city` | The name on the weather card | `Weather` |
| `language` | `auto` (follows the TV), `en`, `es`, `pt`, `ru` or `de` | `auto` |
| `temperature` | `C`, `F` or `auto` | `auto` |
| `theme` | `auto` (dark from sunset to sunrise), `light` or `dark` | `auto` |
| `disable_assistant` | Also turn off Google Assistant | `false` |

Changed something? Run `./build.sh` and install again. Keep `freemytv.keystore`: updates are signed with it.

### The TMDB key

Free, and it takes two minutes: create an account at [themoviedb.org](https://www.themoviedb.org/signup), then open [Settings → API](https://www.themoviedb.org/settings/api) and request a developer key. Paste the *API Read Access Token* (or the *API Key*) after `tmdb_key=`. It's your key: `config.properties` stays out of git.

## Going back

On the TV: *Free My TV* → *Home Screen* → *Original*. The factory home screen, screensaver and every app come back exactly as they were. If the new home screen ever crashes three times in five minutes, it switches back by itself.

To remove it for good, switch to *Original* first, then uninstall *Free My TV* (Settings → Apps).

## What it changes

- It becomes the home screen and, unless `screensaver=false`, the screensaver.
- Picking Continue Watching in Home Settings grants `READ_TV_LISTINGS` with `pm grant` through the TV's own ADB; *Original* takes it back with `pm revoke`. Pictures come only from the TV (`content://`, `android.resource://`), never from the network.
- It turns off, without uninstalling:
  - the stock home screen and screensaver (the screensaver stays with `screensaver=false`);
  - Google TV's recovery home, Play Games and YouTube Music;
  - on TCL TVs, messages, store demo, hotel menu, manuals, mirroring and logging apps;
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
- **Continue Watching** reads Android TV's Watch Next list (what apps share about what you're watching). Only picking it grants `READ_TV_LISTINGS` through the TV's ADB; *Original* revokes it. Pictures load only from the TV (`content://`, `android.resource://`), never from the network.
- **Data** comes only from TMDB (trending titles, new releases, the most popular titles when those are few, and which app streams what in your country), Open-Meteo (forecast, sunrise and sunset), optionally Watchmode (the picks' own pages in their apps, with a `watchmode_key`), optionally your Plex server (with a `plex_url`), optionally your Immich server (your photos, with an `immich_server` and its key) and optionally Trakt (what you're watching and your watchlist, with a `trakt_client_id`, once you sign in on the TV).

| File | What it is |
|---|---|
| [`HomeView.java`](app/src/io/freemytv/HomeView.java) | The home screen |
| [`HomeMode.java`](app/src/io/freemytv/HomeMode.java) | Switching between Free My TV and Original |
| [`Adb.java`](app/src/io/freemytv/Adb.java) | The TV's own ADB, from inside the TV |
| [`Recs.java`](app/src/io/freemytv/Recs.java) | The picks (TMDB) |
| [`KeyPage.java`](app/src/io/freemytv/KeyPage.java), [`Qr.java`](app/src/io/freemytv/Qr.java) | The TMDB and Watchmode keys sent from a phone, and the QR code |
| [`WatchNext.java`](app/src/io/freemytv/WatchNext.java) | Continue Watching from the TV's lists |
| [`WatchArt.java`](app/src/io/freemytv/WatchArt.java) | Continue Watching pictures, only from the TV |
| [`HomeData.java`](app/src/io/freemytv/HomeData.java) | Weather |
| [`HomeApps.java`](app/src/io/freemytv/HomeApps.java) | The shelf, inputs and All Apps |
| [`DreamView.java`](app/src/io/freemytv/DreamView.java) | The screensaver |
| [`SettingsActivity.java`](app/src/io/freemytv/SettingsActivity.java) | The settings screen (the app's icon) |
| [`Prefs.java`](app/src/io/freemytv/Prefs.java) | Settings changed on the TV |
| [`RemoteKeys.java`](app/src/io/freemytv/RemoteKeys.java) | The remote's app buttons (TCL, Sony, Xiaomi and others) |
| [`RecentApps.java`](app/src/io/freemytv/RecentApps.java), [`ScreenBlur.java`](app/src/io/freemytv/ScreenBlur.java) | Recent Apps, over a blurred copy of the screen |
| [`Watchdog.java`](app/src/io/freemytv/Watchdog.java) | The safety net |
| [`web/home.js`](web/home.js) | The home screen on LG TVs |
| [`web/tv.js`](web/tv.js) | The TV's apps and inputs, on LG and Samsung |
| [`webos/build.py`](webos/build.py), [`webos/install.py`](webos/install.py), [`webos/renew.py`](webos/renew.py) | The LG app package, its install, and renewing Developer Mode |
| [`tizen/build.py`](tizen/build.py) | The Samsung app package |

The website ([freemytv.io](https://freemytv.io)) is in [`docs/`](docs): plain HTML, CSS and JS on GitHub Pages.

## Privacy

No accounts, no analytics, no tracking. The app talks to TMDB, Open-Meteo (with the coordinates you set, or your time zone's main city). Your settings stay on your computer and your TV.

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
