import { Router, Request, Response } from 'express';
import { getConfig } from '../config';

const router = Router();

const JELLYFIN_HEADERS = {
  'X-Emby-Token': '',
  'User-Agent': 'Togetherplay/1.3.4',
};

async function jellyfinFetch(path: string): Promise<unknown> {
  const { jellyfinUrl, jellyfinApiKey } = getConfig();
  const res = await fetch(`${jellyfinUrl}${path}`, {
    headers: { ...JELLYFIN_HEADERS, 'X-Emby-Token': jellyfinApiKey },
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
        MediaStreams?: Array<{ Type: string; Codec?: string; IsDefault?: boolean; BitRate?: number }>;
      }>;
    };

    const source = item.MediaSources?.[0];
    const mediaSourceId = source?.Id ?? itemId;

    // Video codecs not universally supported across all browsers/devices.
    // VP9 and VP8 are unsupported on iOS Safari; AV1 requires very recent hardware on iOS.
    const BROWSER_UNSUPPORTED_VIDEO = new Set(['vp9', 'vp8', 'av1']);
    const videoStreams = (source?.MediaStreams ?? []).filter((s) => s.Type === 'Video');
    const defaultVideo = videoStreams.find((s) => s.IsDefault) ?? videoStreams[0];
    const videoCodec = defaultVideo?.Codec?.toLowerCase() ?? '';
    const forceVideoTranscode = BROWSER_UNSUPPORTED_VIDEO.has(videoCodec);

    // When transcoding video, derive a target bitrate from the source.
    // h264_vaapi in VBR mode requires a non-zero -b:v; without it Jellyfin passes
    // -b:v 0 and ffmpeg immediately aborts with "Bitrate must be set for VBR RC mode."
    const sourceVideoBitrate = defaultVideo?.BitRate ?? 0;
    const targetVideoBitrate = sourceVideoBitrate > 0
      ? Math.min(Math.max(sourceVideoBitrate * 2, 4_000_000), 20_000_000)
      : 8_000_000;

    // Audio codecs not supported by any desktop browser via MSE.
    const BROWSER_UNSUPPORTED_AUDIO = new Set(['eac3', 'truehd', 'dts', 'dca', 'ac3', 'mlp']);
    const audioStreams = (source?.MediaStreams ?? []).filter((s) => s.Type === 'Audio');
    const defaultAudio = audioStreams.find((s) => s.IsDefault) ?? audioStreams[0];
    const audioCodec = defaultAudio?.Codec?.toLowerCase() ?? '';
    const forceAudioTranscode = BROWSER_UNSUPPORTED_AUDIO.has(audioCodec);

    let streamUrl: string;
    let isHls: boolean;

    if (source?.SupportsDirectStream && !forceVideoTranscode && !forceAudioTranscode) {
      streamUrl =
        `${jellyfinUrl}/Videos/${itemId}/stream` +
        `?MediaSourceId=${encodeURIComponent(mediaSourceId)}` +
        `&api_key=${jellyfinApiKey}&Static=true`;
      isHls = false;
    } else {
      const tag = source?.ETag ? `&Tag=${encodeURIComponent(source.ETag)}` : '';
      // AudioCodec=aac / VideoCodec=h264 tell Jellyfin to transcode incompatible
      // tracks. Jellyfin skips transcoding any track that is already compatible.
      const videoParam = forceVideoTranscode ? `&VideoCodec=h264&VideoBitRate=${targetVideoBitrate}` : '';
      streamUrl =
        `${jellyfinUrl}/Videos/${itemId}/master.m3u8` +
        `?MediaSourceId=${encodeURIComponent(mediaSourceId)}` +
        `&api_key=${jellyfinApiKey}${tag}&AudioCodec=aac${videoParam}`;
      isHls = true;
    }

    console.log(`stream-url for ${itemId}: isHls=${isHls}, videoCodec=${videoCodec || 'unknown'}, audioCodec=${audioCodec || 'unknown'}, forceVideoTranscode=${forceVideoTranscode}, forceAudioTranscode=${forceAudioTranscode}`);
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
      `&Limit=500` +
      `&SortBy=Random`,
    ) as { Items?: Array<{ Id: string; Name: string; PrimaryImageAspectRatio?: number }> };

    const withPosters = (data.Items ?? []).filter((i) => i.PrimaryImageAspectRatio);
    res.json({ Items: withPosters.slice(0, 50) });
  } catch {
    res.json({ Items: [] });
  }
});

// Returns available subtitle tracks for a Jellyfin item.
router.get('/subtitle-tracks/:itemId', async (req: Request, res: Response) => {
  const { itemId } = req.params;
  const { jellyfinUserId } = getConfig();
  try {
    const item = await jellyfinFetch(
      `/Users/${jellyfinUserId}/Items/${itemId}?Fields=MediaSources`
    ) as {
      MediaSources?: Array<{
        MediaStreams?: Array<{
          Index: number;
          Type: string;
          Language?: string;
          DisplayTitle?: string;
          IsDefault?: boolean;
          IsForced?: boolean;
        }>;
      }>;
    };
    const streams = item.MediaSources?.[0]?.MediaStreams ?? [];
    const tracks = streams
      .filter((s) => s.Type === 'Subtitle')
      .map((s) => ({
        index: s.Index,
        language: s.Language ?? 'und',
        displayTitle: s.DisplayTitle ?? `Track ${s.Index}`,
        isDefault: s.IsDefault ?? false,
        isForced: s.IsForced ?? false,
      }));
    res.json({ tracks });
  } catch {
    res.json({ tracks: [] });
  }
});

// Proxies a subtitle VTT file so Jellyfin credentials stay server-side.
router.get('/subtitles/:itemId/:trackIndex', async (req: Request, res: Response) => {
  const { itemId, trackIndex } = req.params;
  const { jellyfinUrl, jellyfinApiKey, jellyfinUserId } = getConfig();
  try {
    // Resolve the mediaSourceId — required by Jellyfin's subtitle URL format.
    const item = await jellyfinFetch(
      `/Users/${jellyfinUserId}/Items/${itemId}?Fields=MediaSources`
    ) as { MediaSources?: Array<{ Id: string }> };
    const mediaSourceId = item.MediaSources?.[0]?.Id ?? itemId;

    const r = await fetch(
      `${jellyfinUrl}/Videos/${itemId}/${mediaSourceId}/Subtitles/${trackIndex}/0/Stream.vtt`,
      { headers: { ...JELLYFIN_HEADERS, 'X-Emby-Token': jellyfinApiKey } }
    );
    if (!r.ok) { res.status(404).send('Not found'); return; }
    const text = await r.text();
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(text);
  } catch {
    res.status(500).send('Error fetching subtitles');
  }
});

// Returns structured codec / format info for the video stats overlay.
router.get('/media-info/:itemId', async (req: Request, res: Response) => {
  const { itemId } = req.params;
  const { jellyfinUserId } = getConfig();
  try {
    const item = await jellyfinFetch(
      `/Users/${jellyfinUserId}/Items/${itemId}?Fields=MediaSources`
    ) as {
      MediaSources?: Array<{
        Container?: string;
        SupportsDirectStream?: boolean;
        MediaStreams?: Array<{
          Type: string;
          Codec?: string;
          Profile?: string;
          Width?: number;
          Height?: number;
          AverageFrameRate?: number;
          RealFrameRate?: number;
          BitRate?: number;
          BitDepth?: number;
          ColorSpace?: string;
          ColorTransfer?: string;
          ColorPrimaries?: string;
          PixelFormat?: string;
          Channels?: number;
          ChannelLayout?: string;
          SampleRate?: number;
          IsDefault?: boolean;
        }>;
      }>;
    };

    const source = item.MediaSources?.[0];
    const streams = source?.MediaStreams ?? [];

    const BROWSER_UNSUPPORTED_VIDEO = new Set(['vp9', 'vp8', 'av1']);
    const BROWSER_UNSUPPORTED_AUDIO = new Set(['eac3', 'truehd', 'dts', 'dca', 'ac3', 'mlp']);

    const videoStream = streams.find((s) => s.Type === 'Video');
    const audioStream = streams.find((s) => s.IsDefault && s.Type === 'Audio')
      ?? streams.find((s) => s.Type === 'Audio');

    const videoCodec = videoStream?.Codec?.toLowerCase() ?? '';
    const audioCodec = audioStream?.Codec?.toLowerCase() ?? '';

    res.json({
      container: source?.Container ?? null,
      isDirectStream: !!(
        source?.SupportsDirectStream
        && !BROWSER_UNSUPPORTED_VIDEO.has(videoCodec)
        && !BROWSER_UNSUPPORTED_AUDIO.has(audioCodec)
      ),
      isVideoTranscoded: BROWSER_UNSUPPORTED_VIDEO.has(videoCodec),
      isAudioTranscoded: BROWSER_UNSUPPORTED_AUDIO.has(audioCodec),
      video: videoStream ? {
        codec: videoStream.Codec ?? null,
        profile: videoStream.Profile ?? null,
        width: videoStream.Width ?? null,
        height: videoStream.Height ?? null,
        fps: videoStream.RealFrameRate ?? videoStream.AverageFrameRate ?? null,
        bitrate: videoStream.BitRate ?? null,
        bitDepth: videoStream.BitDepth ?? null,
        colorSpace: videoStream.ColorSpace ?? null,
        colorTransfer: videoStream.ColorTransfer ?? null,
        pixelFormat: videoStream.PixelFormat ?? null,
      } : null,
      audio: audioStream ? {
        codec: audioStream.Codec ?? null,
        profile: audioStream.Profile ?? null,
        channels: audioStream.Channels ?? null,
        channelLayout: audioStream.ChannelLayout ?? null,
        sampleRate: audioStream.SampleRate ?? null,
        bitrate: audioStream.BitRate ?? null,
      } : null,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch media info' });
  }
});

// Quick reachability check — used by the landing page to show an offline marker.
router.get('/health', async (_req: Request, res: Response) => {
  const { jellyfinUrl, jellyfinApiKey } = getConfig();
  if (!jellyfinUrl || !jellyfinApiKey) {
    res.json({ ok: false, reason: 'not_configured' });
    return;
  }
  try {
    const r = await fetch(`${jellyfinUrl}/System/Info/Public`, {
      headers: { ...JELLYFIN_HEADERS, 'X-Emby-Token': jellyfinApiKey },
      signal: AbortSignal.timeout(5000),
    });
    res.json({ ok: r.ok, reason: r.ok ? undefined : 'unreachable' });
  } catch {
    res.json({ ok: false, reason: 'unreachable' });
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
      { headers: { ...JELLYFIN_HEADERS, 'X-Emby-Token': jellyfinApiKey } }
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
