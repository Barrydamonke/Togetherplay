import { Router, Request, Response } from 'express';
import { getConfig } from '../config';

const router = Router();

const ALLOWED_TYPES = ['media', 'feature', 'bug', 'subtitles'] as const;
type SuggestionType = typeof ALLOWED_TYPES[number];

const TYPE_COLORS: Record<SuggestionType, number> = {
  media:     0x5865F2,
  feature:   0x3BA55C,
  bug:       0xED4245,
  subtitles: 0xF0A500,
};

const TYPE_LABELS: Record<SuggestionType, string> = {
  media:     'Media suggestion',
  feature:   'Feature suggestion',
  bug:       'Bug report',
  subtitles: 'Subtitle request',
};

// Per-video subtitle request cooldown: once per jellyfinId per 24 hours globally.
const subtitleCooldownMap = new Map<string, number>();
const SUBTITLE_COOLDOWN = 24 * 60 * 60 * 1000;

// Per-IP rate limit: 5 suggestions per minute.
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT = 5;
const RATE_WINDOW = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (rateLimitMap.get(ip) ?? []).filter(t => now - t < RATE_WINDOW);
  if (recent.length >= RATE_LIMIT) return true;
  recent.push(now);
  rateLimitMap.set(ip, recent);
  return false;
}

router.post('/', async (req: Request, res: Response) => {
  const ip = req.ip ?? 'unknown';
  if (isRateLimited(ip)) {
    res.status(429).json({ error: 'Too many suggestions. Please wait a moment.' });
    return;
  }

  const { type, message, roomPin, mediaId } = req.body as { type: string; message: string; roomPin?: string; mediaId?: string };

  if (!ALLOWED_TYPES.includes(type as SuggestionType) || !message?.trim()) {
    res.status(400).json({ error: 'Invalid type or missing message.' });
    return;
  }

  const safeType = type as SuggestionType;

  // Subtitle requests: check 24h cooldown before doing anything else.
  // The timestamp is only written after a successful delivery so a failed
  // attempt (e.g. no webhook configured) doesn't silently absorb the next try.
  if (safeType === 'subtitles' && mediaId) {
    const key = String(mediaId).slice(0, 200);
    const last = subtitleCooldownMap.get(key);
    if (last !== undefined && Date.now() - last < SUBTITLE_COOLDOWN) {
      res.json({ ok: true, alreadyRequested: true });
      return;
    }
  }

  const { suggestionWebhookUrl } = getConfig();
  if (!suggestionWebhookUrl) {
    res.status(503).json({ error: 'Suggestions are not configured on this server.' });
    return;
  }

  const label = TYPE_LABELS[safeType];
  const color = TYPE_COLORS[safeType];

  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: 'Type', value: label, inline: true },
  ];
  if (roomPin) fields.push({ name: 'Room', value: String(roomPin).slice(0, 100), inline: true });
  fields.push({ name: 'Message', value: message.slice(0, 1024) });

  try {
    const result = await fetch(suggestionWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: label,
          color,
          fields,
          footer: { text: 'Togetherplay' },
          timestamp: new Date().toISOString(),
        }],
      }),
    });

    if (!result.ok) {
      console.error('[suggestions] Webhook returned', result.status);
      res.status(502).json({ error: 'Webhook delivery failed.' });
      return;
    }

    if (safeType === 'subtitles' && mediaId) {
      subtitleCooldownMap.set(String(mediaId).slice(0, 200), Date.now());
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[suggestions] Could not reach webhook:', err);
    res.status(502).json({ error: 'Could not reach webhook.' });
  }
});

export default router;
