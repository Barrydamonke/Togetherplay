import { DiscordSDK, patchUrlMappings } from '@discord/embedded-app-sdk';

export interface DiscordContext {
  username: string;
  avatar: string | null;
  instanceId: string;
}

export async function tryInitDiscord(): Promise<DiscordContext | null> {
  // Discord injects frame_id into the URL when loading as an Activity.
  if (!new URLSearchParams(window.location.search).has('frame_id')) return null;

  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID as string | undefined;
  if (!clientId) {
    console.warn('[Discord] VITE_DISCORD_CLIENT_ID not set — cannot init Activity');
    return null;
  }

  try {
    const sdk = new DiscordSDK(clientId);
    await sdk.ready();

    const { code } = await sdk.commands.authorize({
      client_id: clientId,
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: ['identify'],
    });

    const res = await fetch('/api/discord/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) throw new Error(`Token endpoint returned ${res.status}`);

    const { access_token, user, jellyfinHost } = await res.json() as {
      access_token: string;
      user: { id: string; username: string; avatar: string | null };
      jellyfinHost: string | null;
    };

    // Rewrite Jellyfin stream URLs to go through Discord's URL proxy.
    // Video stream URLs contain the Jellyfin origin directly; without this patch,
    // the Discord iframe sandbox blocks those cross-origin requests.
    // hls.js uses XHR for segment fetches, which also gets patched transparently.
    if (jellyfinHost) {
      patchUrlMappings([{ prefix: '/proxy/jellyfin', target: jellyfinHost }]);
    }

    await sdk.commands.authenticate({ access_token });

    return {
      username: user.username,
      avatar: user.avatar,
      instanceId: sdk.instanceId,
    };
  } catch (err) {
    console.error('[Discord] Init failed, falling back to normal mode:', err);
    return null;
  }
}
