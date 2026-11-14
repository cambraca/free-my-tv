# LAN preview

Requires Node.js 22+ and Python 3. Set `preview_port=43333` and `preview_host=0.0.0.0` in your private
`config.properties` to allow home-network access, then run `node tools/preview.js`. Open
`http://YOUR_COMPUTER_LAN_IP:43333/` from another device. Browser access has no login.

Allow TCP 43333 from your home LAN only; do not forward the port on your router. For UFW, with an example
subnet of 192.168.1.0/24: `sudo ufw allow from 192.168.1.0/24 to any port 43333 proto tcp`.
Use your actual subnet. `--port` overrides the config; `--config` selects another properties file.

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
