import { Router, Request, Response } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';
import { getConfig } from '../config';
import {
  fetchMetadata,
  createDownload,
  approveDownload,
  denyDownload,
  getDownload,
  getAllDownloads,
  deleteDownload,
  sendApprovalWebhook,
} from '../youtube';

const router = Router();

function checkAuth(req: Request, res: Response): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    res.status(503).json({ error: 'ADMIN_PASSWORD is not configured.' });
    return false;
  }
  if (req.headers['x-admin-password'] !== password) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

function validateVideoUrl(url: string): string | null {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return 'Invalid URL'; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return 'Only http/https URLs are allowed';
  const host = parsed.hostname;
  if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|localhost$)/i.test(host)) {
    return 'Private/loopback addresses are not allowed';
  }
  return null;
}

// GET /api/youtube/info?url=...
router.get('/info', async (req: Request, res: Response) => {
  const { url } = req.query as { url?: string };
  if (!url) {
    res.status(400).json({ error: 'Missing url parameter' });
    return;
  }
  const urlError = validateVideoUrl(url);
  if (urlError) {
    res.status(400).json({ error: urlError });
    return;
  }
  const { ytdlpPath } = getConfig();
  if (!ytdlpPath) {
    res.status(503).json({ error: 'yt-dlp binary path is not set. Configure it in admin settings.' });
    return;
  }
  try {
    const metadata = await fetchMetadata(url);
    res.json(metadata);
  } catch (err) {
    console.error('[yt-dlp] fetchMetadata error:', err);
    res.status(500).json({ error: 'Failed to fetch video metadata. Check server logs.' });
  }
});

// POST /api/youtube/download
router.post('/download', async (req: Request, res: Response) => {
  if (!checkAuth(req, res)) return;
  const { url, title, thumbnailUrl, duration, estimatedSizeMb, requestedBy } = req.body as {
    url: string;
    title: string;
    thumbnailUrl?: string;
    duration?: number;
    estimatedSizeMb?: number;
    requestedBy?: string;
  };

  if (!url || !title) {
    res.status(400).json({ error: 'url and title are required' });
    return;
  }
  const urlError = validateVideoUrl(url);
  if (urlError) {
    res.status(400).json({ error: urlError });
    return;
  }
  const { ytdlpPath } = getConfig();
  if (!ytdlpPath) {
    res.status(503).json({ error: 'yt-dlp is not configured. Set the binary path in admin settings.' });
    return;
  }

  const download = createDownload(
    url, title, thumbnailUrl ?? '', duration ?? 0, estimatedSizeMb ?? 0, requestedBy ?? 'anonymous',
  );

  if (download.status === 'pending_approval') {
    const serverUrl = `${req.protocol}://${req.get('host')}`;
    await sendApprovalWebhook(download, serverUrl);
  }

  res.json({ id: download.id, status: download.status });
});

// GET /api/youtube/approve/:id?token=...  (called from Discord link)
router.get('/approve/:id', (req: Request, res: Response) => {
  const { token } = req.query as { token?: string };
  if (!token) {
    res.status(400).send('Missing token');
    return;
  }
  const ok = approveDownload(req.params.id, token);
  if (!ok) {
    res.status(400).send('Invalid or expired approval link. It may have already been used.');
    return;
  }
  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Approved</title></head>
<body style="font-family:sans-serif;text-align:center;padding:60px 20px;background:#111;color:#fff">
<h2 style="color:#3ba55c">✅ Download Approved</h2>
<p style="color:#aaa">The download has started. You can close this tab.</p>
</body></html>`);
});

// GET /api/youtube/deny/:id?token=...  (called from Discord link)
router.get('/deny/:id', (req: Request, res: Response) => {
  const { token } = req.query as { token?: string };
  if (!token) {
    res.status(400).send('Missing token');
    return;
  }
  const ok = denyDownload(req.params.id, token);
  if (!ok) {
    res.status(400).send('Invalid or expired link. It may have already been used.');
    return;
  }
  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Denied</title></head>
<body style="font-family:sans-serif;text-align:center;padding:60px 20px;background:#111;color:#fff">
<h2 style="color:#ed4245">❌ Download Denied</h2>
<p style="color:#aaa">The request has been denied. You can close this tab.</p>
</body></html>`);
});

// GET /api/youtube/file/:id  (stream the downloaded file)
router.get('/file/:id', (req: Request, res: Response) => {
  const download = getDownload(req.params.id);
  if (!download || download.status !== 'ready' || !download.filename) {
    res.status(404).json({ error: 'File not found or not ready' });
    return;
  }
  const { ytdlpDownloadDir } = getConfig();
  const filePath = join(ytdlpDownloadDir, download.filename);
  if (!existsSync(filePath)) {
    res.status(404).json({ error: 'File not found on disk' });
    return;
  }
  res.sendFile(filePath);
});

// GET /api/youtube/downloads  (admin — list all downloads)
router.get('/downloads', (req: Request, res: Response) => {
  if (!checkAuth(req, res)) return;
  res.json(getAllDownloads());
});

// DELETE /api/youtube/downloads/:id  (admin — manually delete a download)
router.delete('/downloads/:id', (req: Request, res: Response) => {
  if (!checkAuth(req, res)) return;
  const ok = deleteDownload(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Download not found' });
    return;
  }
  res.json({ ok: true });
});

export default router;
