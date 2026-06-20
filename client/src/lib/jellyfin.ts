export interface JellyfinItem {
  Id: string;
  Name: string;
  Type: string;
  RunTimeTicks?: number;
  ImageTags?: { Primary?: string };
  Overview?: string;
}

export interface JellyfinItemsResponse {
  Items: JellyfinItem[];
  TotalRecordCount: number;
}

export async function fetchItems(params: {
  parentId?: string;
  search?: string;
  limit?: number;
  startIndex?: number;
}): Promise<JellyfinItemsResponse> {
  const query = new URLSearchParams();
  if (params.parentId) query.set('parentId', params.parentId);
  if (params.search) query.set('search', params.search);
  if (params.limit != null) query.set('limit', String(params.limit));
  if (params.startIndex != null) query.set('startIndex', String(params.startIndex));
  const res = await fetch(`/api/jellyfin/items?${query}`);
  if (!res.ok) throw new Error('Failed to fetch library');
  return res.json() as Promise<JellyfinItemsResponse>;
}

export async function getStreamUrl(jellyfinId: string): Promise<{ streamUrl: string; isHls: boolean }> {
  // Inside Discord's Activity iframe, media-src CSP blocks direct Jellyfin URLs.
  // Force HLS so hls.js fetches segments via XHR (which patchUrlMappings intercepts)
  // rather than setting video.src directly to the cross-origin stream URL.
  const forceHls = window.location.hostname.endsWith('.discordapp.com');
  const res = await fetch(`/api/jellyfin/stream-url/${jellyfinId}${forceHls ? '?forceHls=1' : ''}`);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Failed to get stream URL');
  }
  return res.json() as Promise<{ streamUrl: string; isHls: boolean }>;
}

export function thumbnailUrl(jellyfinId: string): string {
  return `/api/jellyfin/thumbnail/${jellyfinId}`;
}

export function formatDuration(ticks?: number): string {
  if (!ticks) return '';
  const s = Math.floor(ticks / 10_000_000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export const BROWSEABLE_TYPES = new Set(['Folder', 'CollectionFolder', 'Series', 'Season']);
export const PLAYABLE_TYPES = new Set(['Movie', 'Episode', 'Video']);
