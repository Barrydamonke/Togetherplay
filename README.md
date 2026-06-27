# Togetherplay

Watch videos together in real time. One person hosts a room, everyone stays perfectly in sync — pause, seek, chat, and queue videos like you're on the same couch. Streams directly from your own Jellyfin server, with optional YouTube downloads and Discord Activity support.

---

## Features

- **Synced playback** — host controls play, pause, and seek; everyone follows automatically
- **Jellyfin integration** — browse and queue from your own library
- **YouTube downloads** — add YouTube videos to the queue via yt-dlp
- **Chat** — built-in live chat alongside the video
- **Public room browser** — rooms visible on the landing page, or private with a PIN
- **Queue management** — add, reorder, and remove; autoplay to next item
- **Room permissions** — optionally let viewers manage the queue or control playback
- **Subtitles** — per-user subtitle track selection, doesn't affect others
- **Aspect ratio lock** — 16:9, 4:3, 2.39:1, or auto
- **Discord Activity** — watch together directly inside a Discord voice channel
- **Suggestions** — users can submit media or feature suggestions via webhook

---

## Self-hosting with Docker (recommended)

### Docker Compose

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
      # Discord Activity (optional) — see Discord Activity section below
      # - DISCORD_CLIENT_ID=
      # - DISCORD_CLIENT_SECRET=
    volumes:
      - /your/path/here:/data              # persistent config — required
      - /your/path/here/downloads:/downloads  # yt-dlp downloads — optional
    restart: unless-stopped
```

Replace `/your/path/here` with a folder on your host, then:

```bash
docker compose up -d
```

### Unraid

See [`unraid-template.xml`](./unraid-template.xml) — copy it to `/boot/config/plugins/dockerMan/templates-user/` on your server, then use **Add Container** in the Docker tab to get pre-filled fields.

### Updating

```bash
docker compose pull
docker compose up -d
```

Your config is preserved as long as `/data` is mounted to a host path.

---

## First Boot

On first boot the site is locked until you complete setup. An admin password is auto-generated and printed to the container logs:

```bash
docker logs togetherplay
```

Open `http://your-server-ip:3000/admin`, log in with the generated password, and fill in your Jellyfin details. The site unlocks after your first save.

---

## Environment Variables

All settings can be configured through the admin panel. These env vars are optional overrides:

| Variable | Description |
|---|---|
| `DATA_DIR` | **Required.** Set to `/data` — must match the volume mount. |
| `ADMIN_PASSWORD` | Override the auto-generated admin password. |
| `DISCORD_CLIENT_ID` | Discord application client ID. Can also be set in the admin panel. |
| `DISCORD_CLIENT_SECRET` | Discord application client secret. Can also be set in the admin panel. |

---

## Discord Activity (optional)

Togetherplay can run as a Discord Activity — users watch together directly inside a voice channel with no external browser needed.

**Setup requires a Discord application and a public domain for both Togetherplay and Jellyfin** (e.g. via Cloudflare Tunnel).

1. Create an application at [discord.com/developers](https://discord.com/developers)
2. Enable **Activities**
3. Under **URL Mappings**, add:
   - Root (`/`) → your Togetherplay domain (e.g. `togetherplay.example.com`)
   - `/proxy/jellyfin` → your Jellyfin domain (e.g. `jellyfin.example.com`)
4. Set your **Client ID** and **Client Secret** in the admin panel

---

## Local Development

**Requirements:** Node.js 20+

```bash
# Install all dependencies
npm run install:all

# Terminal 1 — Express server (port 3000)
npm run dev:server

# Terminal 2 — Vite client (port 5173)
npm run dev:client
```

Open `http://localhost:5173`. On first run you'll be prompted to complete admin setup before the app unlocks — this works the same as in Docker.

Optionally copy `.env.example` to `server/.env` to pre-fill credentials instead of using the admin panel:

```bash
cp .env.example server/.env
```

---

## Using the App

### Creating a room

1. Enter your name and click **Create a room**
2. Share the 4-digit PIN with your friends
3. Click the folder icon to open the Jellyfin browser, or the YouTube icon to add a download
4. Press play when everyone has joined

### Joining a room

1. Enter your name and either click a room in the public browser, or click **Join with a PIN**
2. Playback is controlled by the host — volume and subtitles are per-user

### Room settings (host only)

Open the **settings** icon in the sidebar:

- **Hidden room** — removes the room from the public browser
- **Viewers can manage queue** — lets guests add and reorder videos
- **Viewers can control playback** — lets guests play, pause, and seek
- **Idle screen embed URL** — show a custom iframe when no video is queued
- **Aspect ratio** — lock the player to a specific ratio or leave on Auto

---

## Coming Soon

- **Upload service** — drop a video file directly into a room without needing Jellyfin
- **Persistent rooms** — room state is currently in-memory; a server restart clears active sessions
