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
  const { jellyfinUrl, jellyfinApiKey, jellyfinUserId, uploadServiceUrl, githubRepoUrl, landingMessage } = req.body as AppConfig;
  saveConfig({
    jellyfinUrl, jellyfinApiKey, jellyfinUserId, uploadServiceUrl,
    githubRepoUrl: githubRepoUrl || 'https://github.com/Barrydamonke/Togetherness',
    landingMessage: landingMessage ?? '',
  });
  res.json({ ok: true });
});

export default router;
