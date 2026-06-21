import { Router, Request, Response } from 'express';
import { getConfig } from '../config';

const router = Router();

router.post('/token', async (req: Request, res: Response) => {
  const { code } = req.body as { code?: string };
  if (!code) {
    res.status(400).json({ error: 'Missing code' });
    return;
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.status(500).json({ error: 'Discord not configured — set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET' });
    return;
  }

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
      }),
    });
    if (!tokenRes.ok) {
      const errorBody = await tokenRes.text().catch(() => '(unreadable)');
      console.error('[Discord] Token exchange failed:', tokenRes.status, errorBody);
      res.status(502).json({ error: 'Discord token exchange failed', detail: errorBody });
      return;
    }
    const { access_token } = await tokenRes.json() as { access_token: string };

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!userRes.ok) {
      res.status(502).json({ error: 'Failed to fetch Discord user' });
      return;
    }
    const user = await userRes.json() as {
      id: string;
      username: string;
      global_name: string | null;
      avatar: string | null;
    };

    // Pass jellyfinHost to the client so it can call patchUrlMappings.
    // Video stream URLs contain the Jellyfin origin and must be rewritten to go
    // through Discord's proxy — without this, cross-origin video requests are blocked.
    const { jellyfinUrl } = getConfig();
    let jellyfinHost: string | null = null;
    try {
      if (jellyfinUrl) jellyfinHost = new URL(jellyfinUrl).host;
    } catch {}

    res.json({
      access_token,
      user: {
        id: user.id,
        username: user.global_name ?? user.username,
        avatar: user.avatar
          ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
          : null,
      },
      jellyfinHost,
    });
  } catch {
    res.status(500).json({ error: 'Token exchange failed' });
  }
});

export default router;
