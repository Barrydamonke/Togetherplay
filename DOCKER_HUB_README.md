# Togetherplay

Watch your media together, in real time. Sync Jellyfin streams, YouTube videos, and more with friends — with chat, rooms, and a shared queue.

---

## Quick Start

### Docker Compose (recommended)

```yaml
services:
  togetherplay:
    image: barrydamonke/togetherplay:latest
    container_name: togetherplay
    ports:
      - "3000:3000"
    environment:
      - DATA_DIR=/data
      # Admin password is auto-generated on first boot if not set.
      # Check container logs for the generated password, then update it in the admin panel.
      # - ADMIN_PASSWORD=
      # Discord Activity (optional) — create an app at discord.com/developers
      # - DISCORD_CLIENT_ID=
      # - DISCORD_CLIENT_SECRET=
    volumes:
      - /your/path/here:/data              # persistent config storage
      - /your/path/here/downloads:/downloads  # yt-dlp download folder (optional)
    restart: unless-stopped
```

Replace `/your/path/here` with a folder on your host, then run:

```bash
docker compose up -d
```

---

### Docker Run

```bash
docker run -d \
  --name togetherplay \
  --restart unless-stopped \
  -p 3000:3000 \
  -e DATA_DIR=/data \
  -v /your/path/here:/data \
  -v /your/path/here/downloads:/downloads \
  barrydamonke/togetherplay:latest
```

---

### Unraid

1. In the Unraid WebUI, go to the **Docker** tab
2. Click the **Docker Repositories** sub-tab
3. Add the following URL to the Template repositories field and click Save:
   ```
   https://github.com/Barrydamonke/Togetherplay
   ```
4. Go back to the **Docker** tab and click **Add Container**
5. Select **togetherplay** from the Template dropdown
6. Fill in your host paths for the data and downloads folders, then click **Apply**

Alternatively, copy [`unraid-template.xml`](https://raw.githubusercontent.com/Barrydamonke/Togetherplay/main/unraid-template.xml) directly into `/boot/config/plugins/dockerMan/templates-user/` on your Unraid server, then Add Container as above.

---

## First Boot

On first boot, the site is locked until you complete setup in the admin panel. An admin password is auto-generated and printed to the container logs — check them with:

```bash
docker logs togetherplay
```

Then open `http://your-server-ip:3000/admin` and follow the setup steps.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATA_DIR` | Yes | Path inside the container where `config.json` is stored. Set to `/data` and mount that path as a volume. |
| `ADMIN_PASSWORD` | No | Override the auto-generated admin password. |
| `DISCORD_CLIENT_ID` | No | Discord application client ID for Discord Activity support. Can also be set in the admin panel. |
| `DISCORD_CLIENT_SECRET` | No | Discord application client secret. Can also be set in the admin panel. |

## Volumes

| Container Path | Purpose |
|---|---|
| `/data` | Persistent config storage — **must be mounted** or settings will be lost on container update |
| `/downloads` | Where yt-dlp saves downloaded YouTube videos (set `ytdlpDownloadDir` to `/downloads` in admin settings) |

---

## Discord Activity (optional)

Togetherplay can run as a Discord Activity, letting users watch together directly inside a voice channel. This requires extra setup in the Discord Developer Portal — it won't work out of the box because Discord needs to know your domain.

**Steps:**

1. Create an application at [discord.com/developers](https://discord.com/developers)
2. Enable **Activities** on the application
3. Under **URL Mappings**, add:
   - Root (`/`) → your Togetherplay domain (e.g. `togetherplay.example.com`)
   - `/proxy/jellyfin` → your Jellyfin domain (e.g. `jellyfin.example.com`)
4. Set your **Client ID** and **Client Secret** in the Togetherplay admin panel (or via env vars)

> Both Togetherplay and Jellyfin need to be accessible via a public domain (e.g. through a Cloudflare Tunnel) for Discord's proxy to reach them.

---

## Links

- [GitHub](https://github.com/Barrydamonke/Togetherplay)
- [Docker Hub](https://hub.docker.com/r/barrydamonke/togetherplay)
