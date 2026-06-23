import { Router, Request, Response } from 'express';
import { getConfig } from '../config';

const router = Router();

const TYPE_COLORS: Record<string, number> = {
  media:   0x5865F2,
  feature: 0x3BA55C,
  bug:     0xED4245,
};

const TYPE_LABELS: Record<string, string> = {
  media:   'Media suggestion',
  feature: 'Feature suggestion',
  bug:     'Bug report',
};

router.post('/', async (req: Request, res: Response) => {
  const { type, message, roomPin } = req.body as { type: string; message: string; roomPin?: string };

  if (!type || !message?.trim()) {
    res.status(400).json({ error: 'type and message are required.' });
    return;
  }

  const { suggestionWebhookUrl } = getConfig();
  if (!suggestionWebhookUrl) {
    res.status(503).json({ error: 'Suggestions are not configured on this server.' });
    return;
  }

  const label = TYPE_LABELS[type] ?? type;
  const color = TYPE_COLORS[type] ?? 0x95a5a6;

  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: 'Type', value: label, inline: true },
  ];
  if (roomPin) fields.push({ name: 'Room', value: roomPin, inline: true });
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
      console.error('[suggestions] Webhook returned', result.status, await result.text());
      res.status(502).json({ error: 'Webhook delivery failed.' });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[suggestions] Could not reach webhook:', err);
    res.status(502).json({ error: 'Could not reach webhook.' });
  }
});

export default router;
