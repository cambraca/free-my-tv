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

Start `node tools/preview.js`. The preview exposes `/api/remote/status` and `/api/remote/command` for
browser clients. Commands reference a title in the server snapshot and its configured service; no arbitrary
launch parameters are accepted. The installed TV receiver identifies itself with the bridge token and `tv_ip`.

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
