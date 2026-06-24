import { Router, Request, Response } from 'express';
import { getConfig, saveConfig, AppConfig } from '../config';

const router = Router();

function checkAuth(req: Request, res: Response): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    res.status(503).json({ error: 'ADMIN_PASSWORD is not configured on the server.' });
    return false;
  }
  if (req.headers['x-admin-password'] !== password) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

router.post('/auth', (req: Request, res: Response) => {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    res.status(503).json({ error: 'ADMIN_PASSWORD is not configured on the server.' });
    return;
  }
  const { password: submitted } = req.body as { password: string };
  if (submitted === password) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Wrong password.' });
  }
});

router.get('/config', (req: Request, res: Response) => {
  if (!checkAuth(req, res)) return;
  res.json(getConfig());
});

router.post('/config', (req: Request, res: Response) => {
  if (!checkAuth(req, res)) return;
  const {
    jellyfinUrl, jellyfinApiKey, jellyfinUserId, uploadServiceUrl,
    githubRepoUrl, landingMessage, suggestionWebhookUrl,
    ytdlpPath, ytdlpDownloadDir, ytdlpDefaultArgs,
    ytdlpApprovalRequired, ytdlpApprovalWebhookUrl,
  } = req.body as AppConfig;
  saveConfig({
    jellyfinUrl, jellyfinApiKey, jellyfinUserId, uploadServiceUrl,
    githubRepoUrl: githubRepoUrl || 'https://github.com/Barrydamonke/Togetherplay',
    landingMessage: landingMessage ?? '',
    suggestionWebhookUrl: suggestionWebhookUrl ?? '',
    ytdlpPath: ytdlpPath ?? '/usr/local/bin/yt-dlp',
    ytdlpDownloadDir: ytdlpDownloadDir ?? '/downloads',
    ytdlpDefaultArgs: ytdlpDefaultArgs ?? "-f bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4] --merge-output-format mp4",
    ytdlpApprovalRequired: ytdlpApprovalRequired ?? false,
    ytdlpApprovalWebhookUrl: ytdlpApprovalWebhookUrl ?? '',
  });
  res.json({ ok: true });
});

export default router;
