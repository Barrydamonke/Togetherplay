# Togetherplay

Watch videos together in real time. One person hosts a room, shares a PIN, and everyone stays perfectly in sync — pause, seek, and chat like you're on the same couch. Streams directly from your own Jellyfin server.

---

## How it works

- The **host** creates a room and gets a 4-digit PIN
- **Guests** join with that PIN, or pick a room from the public browser on the landing page
- The host controls playback (play, pause, seek); everyone follows automatically
- Each person controls their own volume and subtitles independently
- A built-in chat runs alongside the video
- When no video is queued, the idle screen can display a custom embed — or just a plain "No video selected" message

---

## Prerequisites

- Node.js 18 or later
- A running [Jellyfin](https://jellyfin.org) server (reachable over the network or via a Cloudflare Tunnel)

---

## Local development

**1. Install dependencies**

```bash
npm run install:all
```

**2. Create the server environment file**

Copy the example and fill in your values:

```bash
cp .env.example server/.env
```

| Variable | Description |
|---|---|
| `JELLYFIN_URL` | Full URL to your Jellyfin server, e.g. `https://media.example.com` |
| `JELLYFIN_API_KEY` | API key from Jellyfin → Dashboard → API Keys |
| `JELLYFIN_USER_ID` | Your Jellyfin user ID (found in Dashboard → Users → click your user) |
| `ADMIN_PASSWORD` | Password for the in-app admin panel |

**3. Start the servers**

In two separate terminals:

```bash
# Terminal 1 — Express server (port 3000)
npm run dev:server

# Terminal 2 — Vite client (port 5173)
npm run dev:client
```

Open `http://localhost:5173` in your browser.

---

## Admin panel

If you prefer not to use a `.env` file, all Jellyfin settings can be configured from the app itself.

1. Click **Admin** in the top-right corner of the landing page
2. Enter your `ADMIN_PASSWORD`
3. Fill in the Jellyfin URL, API Key, and User ID, then click **Save changes**

Settings are saved to `server/config.json` and take effect immediately without a restart. This file is gitignored — it will never be committed.

---

## Self-hosting with Docker

A `Dockerfile` and `docker-compose.yml` are included for self-hosted deployments (e.g. Unraid, a home server, or any VPS).

### Quick start

```bash
# Clone the repo
git clone https://github.com/Barrydamonke/Togetherplay.git
cd Togetherplay

# Set your admin password in docker-compose.yml, then:
docker compose up -d
```

Open `http://<your-server-ip>:3000` in your browser.

### Environment variables

Set these in `docker-compose.yml` under `environment:`, or configure Jellyfin settings later through the in-app admin panel.

| Variable | Required | Description |
|---|---|---|
| `ADMIN_PASSWORD` | Yes | Password for the admin panel |
| `DATA_DIR` | Yes (set in compose) | Directory where `config.json` is stored — mount a volume here |
| `JELLYFIN_URL` | No* | Full URL to your Jellyfin server |
| `JELLYFIN_API_KEY` | No* | Jellyfin API key |
| `JELLYFIN_USER_ID` | No* | Jellyfin user ID |

*Can be configured at any time through the admin panel instead.

### Volumes

The compose file creates a named volume (`togetherness_data`) mounted at `/data`. This is where `config.json` is persisted so your settings survive container updates and restarts.

### Updating

```bash
git pull
docker compose up -d --build
```

---

## Using the app

### Creating a room (host)

1. Enter your name and click **Create a room**
2. Share the 4-digit PIN shown in the sidebar with your friends
3. Click the folder icon in the sidebar to open your Jellyfin library
4. Browse or search for a title and click **Queue** to add it
5. Press play when everyone has joined

### Joining a room (guest)

1. Enter your name and either:
   - Click a room in the **public room browser** on the landing page, or
   - Click **Join with a PIN** and type the 4-digit PIN the host gave you
2. Playback is controlled by the host — your volume and subtitles are your own

### Subtitles

Click the **CC** button in the video player controls to open the subtitle track selector. Pick any available track or select **Off**. This setting is local to you and does not affect anyone else in the room.

### Queue management

The host (and any viewers granted permission) can add, reorder, and remove videos using the queue panel in the sidebar. When the current video ends, the next one in the queue starts automatically.

### Room settings (host only)

Click the **settings** icon in the top-right of the sidebar to open the room settings panel.

- **Hidden room** — removes the room from the public browser; guests must use the PIN
- **Viewers can manage queue** — lets guests add videos and reorder the queue
- **Viewers can control playback** — lets guests play, pause, and seek
- **Idle screen embed URL** — paste any URL to display it as an iframe when no video is queued (leave blank for the default "No video selected" message)

### Video stats overlay

Toggle **Video stats overlay** in the settings panel to show codec, resolution, buffer level, and stream info directly on the player.

### Aspect ratio

The **Display** section of the settings panel lets you lock the player to a specific aspect ratio (16:9, 4:3, 2.39:1) or leave it on **Auto** to resize to each video's native dimensions.

---

## Coming soon

- **Upload service** — drop a video file directly into the room without needing a Jellyfin library
- **Persistent rooms** — room state currently lives in memory; a server restart clears active sessions
- **Rate limiting** — no throttling on socket events or API endpoints yet
- **Discord Activity Intergration** - This will work as a discord activity at some point in the future
