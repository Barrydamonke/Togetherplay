import { Router, Request, Response } from 'express';
import { getConfig } from '../config';

const router = Router();

async function jellyfinFetch(path: string): Promise<unknown> {
  const { jellyfinUrl, jellyfinApiKey } = getConfig();
  const res = await fetch(`${jellyfinUrl}${path}`, {
    headers: { 'X-Emby-Token': jellyfinApiKey },
  });
  if (!res.ok) throw new Error(`Jellyfin responded with ${res.status}`);
  return res.json();
}

// Browse library items — used by the host's Jellyfin browser modal.
router.get('/items', async (req: Request, res: Response) => {
  try {
    const { jellyfinUserId } = getConfig();
    const { parentId, search, limit = '50', startIndex = '0' } = req.query;
    let path =
      `/Users/${jellyfinUserId}/Items` +
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
  const { jellyfinUrl, jellyfinApiKey, jellyfinUserId } = getConfig();

  if (!jellyfinUrl) {
    res.status(500).json({ error: 'Jellyfin URL is not configured. Set it in the admin panel.' });
    return;
  }

  try {
    const item = await jellyfinFetch(
      `/Users/${jellyfinUserId}/Items/${itemId}?Fields=MediaSources`
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
        `${jellyfinUrl}/Videos/${itemId}/stream` +
        `?MediaSourceId=${encodeURIComponent(mediaSourceId)}` +
        `&api_key=${jellyfinApiKey}&Static=true`;
      isHls = false;
    } else {
      const tag = source?.ETag ? `&Tag=${encodeURIComponent(source.ETag)}` : '';
      streamUrl =
        `${jellyfinUrl}/Videos/${itemId}/master.m3u8` +
        `?MediaSourceId=${encodeURIComponent(mediaSourceId)}` +
        `&api_key=${jellyfinApiKey}${tag}`;
      isHls = true;
    }

    console.log(`stream-url for ${itemId}: isHls=${isHls} url=${streamUrl}`);
    res.json({ streamUrl, isHls });
  } catch (err) {
    console.error('stream-url error:', err);
    res.status(500).json({ error: 'Failed to get stream URL from Jellyfin.' });
  }
});

// Returns a random sample of items with poster images for the landing page background.
router.get('/random-posters', async (_req: Request, res: Response) => {
  const { jellyfinUserId } = getConfig();
  if (!jellyfinUserId) {
    res.json({ Items: [] });
    return;
  }
  try {
    const data = await jellyfinFetch(
      `/Users/${jellyfinUserId}/Items` +
      `?IncludeItemTypes=Movie,Series` +
      `&Recursive=true` +
      `&Fields=PrimaryImageAspectRatio` +
      `&Limit=100` +
      `&SortBy=SortName&SortOrder=Ascending`,
    ) as { Items?: Array<{ Id: string; Name: string; PrimaryImageAspectRatio?: number }> };

    const withPosters = (data.Items ?? []).filter((i) => i.PrimaryImageAspectRatio);
    for (let k = withPosters.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [withPosters[k], withPosters[j]] = [withPosters[j], withPosters[k]];
    }
    res.json({ Items: withPosters.slice(0, 8) });
  } catch {
    res.json({ Items: [] });
  }
});

// Proxy thumbnails so Jellyfin credentials stay server-side.
router.get('/thumbnail/:itemId', async (req: Request, res: Response) => {
  const { itemId } = req.params;
  const { maxWidth = '400' } = req.query;
  const { jellyfinUrl, jellyfinApiKey } = getConfig();
  try {
    const imageRes = await fetch(
      `${jellyfinUrl}/Items/${itemId}/Images/Primary?MaxWidth=${maxWidth}`,
      { headers: { 'X-Emby-Token': jellyfinApiKey } }
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
