# Phone preview and TV controller

Requires Node.js 22+ and Python 3. In your private `config.properties`, set:

```properties
preview_port=43333
preview_host=0.0.0.0
preview_token=REPLACE_WITH_A_RANDOM_SECRET_AT_LEAST_24_CHARACTERS
preview_url=http://YOUR_COMPUTER_LAN_IP:43333
tv_ip=YOUR_TV_LAN_IP
```

Generate the token locally with `python3 -c "import secrets; print(secrets.token_hex(24))"`.
Use fixed/reserved LAN addresses for the computer and TV. These settings are shared by both instances.
The token identifies the installed TV connection; browser access has no login. It is included in personal TV builds; never distribute those builds. Generic builds disable the bridge.

Start `node tools/preview.js`. On your phone, open `http://YOUR_COMPUTER_LAN_IP:43333/`.
Phones and recognized computer browsers automatically get the remote touch layout with the same logo,
light/dark colors and watchlist. The TV layout link opens the original desktop preview.
Bookmark `http://YOUR_COMPUTER_LAN_IP:43333/?mode=remote` to browse titles and open them on the TV. Tapping a title always opens its detail popup first;
choose **Open on TV** for a service from that popup. Search filters the titles. There are no directional, OK or Back remote buttons.
TV user agents and unclear devices default to the TV layout. Use `?mode=tv` or `?mode=remote` to force
either layout on any browser. Explicit modes override detection. Old `?remote=1` bookmarks still work.
The installed TV UI never changes. Connection status is compact and muted; optional metadata failures keep
the cached title details without adding a warning label.

Build the updated TV app using the same config and install it yourself. Open Free My TV on the TV before
sending commands. The TV connects in the background, retries unavailable servers every 30 seconds, and remains
fully functional without the computer. There is no LG pairing, wake-up, playback or volume control. Suspended
or closed TV apps cannot receive commands: reopen Free My TV with your physical remote. Commands expire and
are never queued for a later session. Leaving the controller page does not stop computer-side Plex work.

Plex launches normally on the TV, while the computer discovers the Plex client matching `tv_ip` and sends the
existing Companion details request through your Plex server. Plex must advertise this client with mirror
capability. Errors appear on the phone; success acknowledges the request, not proof of TV navigation. This
opens the title details, not autoplay. Real TV launch behavior still requires testing on your device.

Allow **TCP 43333 only from your home LAN**, including the phone and TV. For example, if your LAN is
`192.168.1.0/24` and you use UFW, run yourself:

```sh
sudo ufw allow from 192.168.1.0/24 to any port 43333 proto tcp
```

Use your actual subnet. Do not forward this port on your router. Anyone on the allowed LAN can browse and use the preview. Personal preview data
travels over your trusted LAN; this is not an internet hosting setup. `--port` overrides `preview_port`; make
`preview_url` match. Restart the server and rebuild/reinstall the TV app after changing bridge URL or token.
`--config /absolute/path/config.properties` selects an alternative shared config. `--no-build` serves an existing build.

## Start at boot with systemd

Edit `tools/systemd/free-my-tv-preview.service`, replacing YOUR_USER, repo path. The example uses `/usr/bin/env node`; if Node is installed through a version manager,
replace that with the absolute executable path from `command -v node`. A system service starts at boot without requiring desktop login. It runs as your regular
user and builds the preview before listening. Then run these commands yourself:

```sh
sudo cp tools/systemd/free-my-tv-preview.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now free-my-tv-preview
systemctl status free-my-tv-preview
journalctl -u free-my-tv-preview -f
```

To stop and disable: `sudo systemctl disable --now free-my-tv-preview`.
Source edits rebuild automatically. Server/configuration changes require `sudo systemctl restart free-my-tv-preview`.
No service is installed or enabled by the build.

## Torrent downloads from the phone

With `qbittorrent_url` configured, title details offer **Search torrents** for unavailable titles and TV shows.
Search terms include the movie’s release year or the show’s premiere year when known.
Movie and TV-show searches temporarily use qBittorrent’s **all** category.
New TV-show downloads enable sequential downloading (torrent piece order, not guaranteed episode order).
Movie downloads and existing torrents are unchanged.
Choose a season with −/+ on the results screen. The initial season is the first absent from Plex; presence
does not guarantee a season is complete. Inspect the release names and tap anywhere on a result row to start downloading it. Results show seeds and size. They stop moving once you interact with a row; **Update results**
appears only when newer results differ, and hides again after applying them. Back returns to details and cancels that search, while started downloads continue.

Progress appears in title details, including the wait for Plex indexing. The computer handles the download
and Plex refresh independently of the TV. This uses the same qBittorrent settings and destination folders as
the TV version, but the preview has its own tracking file. No TV connection is needed to search or download.

## iPhone Home Screen icon

In Safari, open the remote preview, tap Share → Add to Home Screen, keep Open as Web App enabled if offered,
and name it **TV**. The page supplies a duck-only icon; the Home Screen name supplies the **TV** label. If you already added it before the icon was available,
remove the old Home Screen shortcut and add it again; iOS caches these icons.
