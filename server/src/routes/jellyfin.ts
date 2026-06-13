import { Router, Request, Response } from 'express';

const router = Router();

const JELLYFIN_URL = process.env.JELLYFIN_URL ?? '';
const JELLYFIN_API_KEY = process.env.JELLYFIN_API_KEY ?? '';
const JELLYFIN_USER_ID = process.env.JELLYFIN_USER_ID ?? '';

async function jellyfinFetch(path: string): Promise<unknown> {
  const res = await fetch(`${JELLYFIN_URL}${path}`, {
    headers: { 'X-Emby-Token': JELLYFIN_API_KEY },
  });
  if (!res.ok) throw new Error(`Jellyfin responded with ${res.status}`);
  return res.json();
}

// Browse library items — used by the host's Jellyfin browser modal.
router.get('/items', async (req: Request, res: Response) => {
  try {
    const { parentId, search, limit = '50', startIndex = '0' } = req.query;
    let path =
      `/Users/${JELLYFIN_USER_ID}/Items` +
      `?IncludeItemTypes=Movie,Episode,Video,Folder,CollectionFolder,Series,Season` +
      `&Recursive=false` +
      `&Fields=Overview,RunTimeTicks,PrimaryImageAspectRatio,Type` +
      `&Limit=${limit}&StartIndex=${startIndex}` +
      `&SortBy=SortName&SortOrder=Ascending`;
    if (parentId) path += `&ParentId=${parentId}`;
    if (search) {
      path += `&SearchTerm=${encodeURIComponent(search as string)}&Recursive=true`;
    }
    const data = await jellyfinFetch(path);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch Jellyfin library' });
  }
});

// Returns a stream URL — the browser connects directly to Jellyfin via Cloudflare Tunnel.
// Video data never touches this server.
// Fetches the proper MediaSourceId first; falls back to direct stream for browser-native formats.
router.get('/stream-url/:itemId', async (req: Request, res: Response) => {
  const { itemId } = req.params;

  if (!JELLYFIN_URL) {
    res.status(500).json({ error: 'JELLYFIN_URL is not set in environment.' });
    return;
  }

  try {
    const item = await jellyfinFetch(
      `/Users/${JELLYFIN_USER_ID}/Items/${itemId}?Fields=MediaSources`
    ) as {
      MediaSources?: Array<{
        Id: string;
        ETag?: string;
        SupportsDirectStream?: boolean;
        Container?: string;
      }>;
    };

    const source = item.MediaSources?.[0];
    const mediaSourceId = source?.Id ?? itemId;

    let streamUrl: string;
    let isHls: boolean;

    if (source?.SupportsDirectStream) {
      streamUrl =
        `${JELLYFIN_URL}/Videos/${itemId}/stream` +
        `?MediaSourceId=${encodeURIComponent(mediaSourceId)}` +
        `&api_key=${JELLYFIN_API_KEY}&Static=true`;
      isHls = false;
    } else {
      const tag = source?.ETag ? `&Tag=${encodeURIComponent(source.ETag)}` : '';
      streamUrl =
        `${JELLYFIN_URL}/Videos/${itemId}/master.m3u8` +
        `?MediaSourceId=${encodeURIComponent(mediaSourceId)}` +
        `&api_key=${JELLYFIN_API_KEY}${tag}`;
      isHls = true;
    }

    console.log(`stream-url for ${itemId}: isHls=${isHls} url=${streamUrl}`);
    res.json({ streamUrl, isHls });
  } catch (err) {
    console.error('stream-url error:', err);
    res.status(500).json({ error: 'Failed to get stream URL from Jellyfin.' });
  }
});

// Proxy thumbnails so Jellyfin credentials stay server-side.
router.get('/thumbnail/:itemId', async (req: Request, res: Response) => {
  const { itemId } = req.params;
  const { maxWidth = '400' } = req.query;
  try {
    const imageRes = await fetch(
      `${JELLYFIN_URL}/Items/${itemId}/Images/Primary?MaxWidth=${maxWidth}`,
      { headers: { 'X-Emby-Token': JELLYFIN_API_KEY } }
    );
    if (!imageRes.ok) {
      res.status(404).send('Not found');
      return;
    }
    const buffer = await imageRes.arrayBuffer();
    const contentType = imageRes.headers.get('content-type') ?? 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(buffer));
  } catch {
    res.status(500).send('Error fetching thumbnail');
  }
});

export default router;
