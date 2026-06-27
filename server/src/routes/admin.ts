import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { getConfig, saveConfig, AppConfig, resolveAdminPassword } from '../config';

const router = Router();

interface RecoveryEntry   { code: string;  expiresAt: number; }
interface RecoverySession { token: string; expiresAt: number; }

let pendingCode:   RecoveryEntry   | null = null;
let activeSession: RecoverySession | null = null;

const RECOVERY_TTL = 15 * 60 * 1000;

function generateRecoveryCode(): string {
  // Exclude visually ambiguous characters: 0/O, 1/I/L
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  const raw = Array.from(bytes).map((b) => chars[b % chars.length]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function checkAuth(req: Request, res: Response): boolean {
  const recoveryToken = req.headers['x-recovery-token'] as string | undefined;
  if (recoveryToken && activeSession && activeSession.token === recoveryToken && Date.now() < activeSession.expiresAt) {
    return true;
  }

  const password = resolveAdminPassword();
  if (!password) {
    res.status(503).json({ error: 'No admin password configured. Use the forgot-password flow.' });
    return false;
  }
  if (req.headers['x-admin-password'] === password) return true;

  res.status(401).json({ error: 'Unauthorized' });
  return false;
}

// POST /admin/auth
router.post('/auth', (req: Request, res: Response) => {
  const password = resolveAdminPassword();
  if (!password) {
    res.status(503).json({ error: 'No admin password configured. Use the forgot-password flow.' });
    return;
  }
  const { password: submitted } = req.body as { password: string };
  if (submitted === password) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Wrong password.' });
  }
});

// GET /admin/setup-status  (public — no auth required)
router.get('/setup-status', (_req: Request, res: Response) => {
  res.json({ setupComplete: getConfig().setupComplete });
});

// GET /admin/config
router.get('/config', (req: Request, res: Response) => {
  if (!checkAuth(req, res)) return;
  const { adminPassword: _, ...cfg } = getConfig();
  res.json({ ...cfg, adminPassword: '' }); // password is write-only; never sent to client
});

// POST /admin/config
router.post('/config', (req: Request, res: Response) => {
  if (!checkAuth(req, res)) return;

  const body = req.body as Partial<AppConfig> & { adminPassword?: string };
  const current = getConfig();
  const newPassword = body.adminPassword || '';

  saveConfig({
    jellyfinUrl:        body.jellyfinUrl        ?? current.jellyfinUrl,
    jellyfinApiKey:     body.jellyfinApiKey      ?? current.jellyfinApiKey,
    jellyfinUserId:     body.jellyfinUserId      ?? current.jellyfinUserId,
    uploadServiceUrl:   body.uploadServiceUrl    ?? current.uploadServiceUrl,
    githubRepoUrl:      body.githubRepoUrl       || 'https://github.com/Barrydamonke/Togetherplay',
    landingMessage:     body.landingMessage      ?? '',
    suggestionWebhookUrl: body.suggestionWebhookUrl ?? '',
    ytdlpPath:          body.ytdlpPath           ?? '/usr/bin/yt-dlp',
    ytdlpDownloadDir:   body.ytdlpDownloadDir    ?? '/downloads',
    ytdlpDefaultArgs:   body.ytdlpDefaultArgs    ?? '-f bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4] --merge-output-format mp4',
    ytdlpApprovalRequired:  body.ytdlpApprovalRequired  ?? false,
    ytdlpApprovalWebhookUrl: body.ytdlpApprovalWebhookUrl ?? '',
    discordClientId:     body.discordClientId     ?? current.discordClientId,
    discordClientSecret: body.discordClientSecret ?? current.discordClientSecret,
    adminPassword: newPassword || current.adminPassword,
    setupComplete: true, // first successful save marks setup complete
  });

  if (newPassword) activeSession = null; // invalidate recovery session after password change

  res.json({ ok: true });
});

// POST /admin/forgot-password  (public — logs a one-time recovery code to the container console)
router.post('/forgot-password', (_req: Request, res: Response) => {
  const code = generateRecoveryCode();
  pendingCode = { code, expiresAt: Date.now() + RECOVERY_TTL };

  const sep = '-'.repeat(52);
  console.log(`\n${sep}`);
  console.log('  TOGETHERPLAY — ADMIN RECOVERY CODE');
  console.log(sep);
  console.log(`  Recovery code: ${code}`);
  console.log('  Valid for 15 minutes. Enter it in the admin panel.');
  console.log(`${sep}\n`);

  res.json({ ok: true });
});

// POST /admin/verify-recovery  (public — validates code, returns a short-lived session token)
router.post('/verify-recovery', (req: Request, res: Response) => {
  const { code } = req.body as { code?: string };
  if (!code) {
    res.status(400).json({ error: 'Missing code.' });
    return;
  }

  const normalised = code.trim().toUpperCase().replace(/[\s-]/g, '');
  const expected   = pendingCode?.code.replace('-', '') ?? '';

  if (!pendingCode || Date.now() > pendingCode.expiresAt || normalised !== expected) {
    res.status(401).json({ error: 'Invalid or expired recovery code.' });
    return;
  }

  pendingCode = null; // one-time use
  const token = randomBytes(32).toString('hex');
  activeSession = { token, expiresAt: Date.now() + RECOVERY_TTL };

  res.json({ recoveryToken: token });
});

export default router;
