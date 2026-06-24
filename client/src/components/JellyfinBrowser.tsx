import { useEffect, useRef, useState, useCallback } from 'react';

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
import {
  fetchItems,
  getStreamUrl,
  thumbnailUrl,
  formatDuration,
  BROWSEABLE_TYPES,
  PLAYABLE_TYPES,
  JellyfinItem,
} from '../lib/jellyfin';
import { getFavourites, Favourite } from '../lib/favourites';
import { Video } from '../types';
import { Icon } from './Icon';
import { getSocket } from '../lib/socket';

interface Props {
  onAdd: (video: Video) => void;
  onClose: () => void;
  username?: string;
}

interface YTMeta {
  title: string;
  thumbnailUrl: string;
  duration: number;
  estimatedSizeMb: number;
}

type YTStatus = 'idle' | 'fetching' | 'ready' | 'pending_approval' | 'downloading' | 'done' | 'error' | 'denied';

function isYouTubeUrl(str: string): boolean {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(str.trim());
}

function ytFormatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface BreadcrumbEntry {
  id: string | undefined;
  name: string;
}

const THUMB_COLORS = ['#ff7a52', '#6fae8e', '#5e6fb5', '#d98b9e', '#c98a52', '#7fa6cf', '#9b6ae0', '#3fae93'];
function thumbGradient(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `linear-gradient(150deg, ${THUMB_COLORS[h % THUMB_COLORS.length]}, #1a1a2e)`;
}

export function JellyfinBrowser({ onAdd, onClose, username }: Props) {
  const [tab, setTab] = useState<'library' | 'youtube'>('library');

  // Library state
  const [items, setItems] = useState<JellyfinItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbEntry[]>([
    { id: undefined, name: 'Library' },
  ]);
  const [adding, setAdding] = useState<string | null>(null);
  const [jellyfinStatus, setJellyfinStatus] = useState<'ok' | 'unreachable' | 'not_configured' | null>(null);
  const [failedThumbs, setFailedThumbs] = useState<Set<string>>(new Set());
  const [favourites] = useState<Favourite[]>(() => getFavourites());

  // YouTube state
  const [ytUrl, setYtUrl] = useState('');
  const [ytMeta, setYtMeta] = useState<YTMeta | null>(null);
  const [ytStatus, setYtStatus] = useState<YTStatus>('idle');
  const [ytError, setYtError] = useState('');
  const [ytDownloadId, setYtDownloadId] = useState<string | null>(null);
  const ytFetchAbortRef = useRef<AbortController | null>(null);

  // Socket: listen for yt-dlp status updates
  useEffect(() => {
    if (!ytDownloadId) return;
    const socket = getSocket();
    const handler = ({ id, status: s, error: e }: { id: string; status: string; error?: string }) => {
      if (id !== ytDownloadId) return;
      if (s === 'ready') {
        setYtStatus('done');
        if (ytMeta) {
          const video: Video = {
            id: ytDownloadId,
            title: ytMeta.title,
            source: 'youtube',
            streamUrl: `/api/youtube/file/${ytDownloadId}`,
            thumbnailUrl: ytMeta.thumbnailUrl || undefined,
            duration: ytMeta.duration || undefined,
            ytDownloadId,
          };
          onAdd(video);
        }
      } else if (s === 'downloading') {
        setYtStatus('downloading');
      } else if (s === 'error') {
        setYtStatus('error');
        setYtError(e ?? 'Download failed. Check the server logs.');
      } else if (s === 'denied') {
        setYtStatus('denied');
      }
    };
    socket.on('youtube:status_update', handler);
    return () => { socket.off('youtube:status_update', handler); };
  }, [ytDownloadId, ytMeta, onAdd]);

  const fetchYtMeta = useCallback(async (targetUrl: string) => {
    if (ytFetchAbortRef.current) ytFetchAbortRef.current.abort();
    const controller = new AbortController();
    ytFetchAbortRef.current = controller;
    setYtStatus('fetching');
    setYtMeta(null);
    setYtError('');
    try {
      const res = await fetch(`/api/youtube/info?url=${encodeURIComponent(targetUrl)}`, { signal: controller.signal });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as YTMeta;
      setYtMeta(data);
      setYtStatus('ready');
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setYtError(String(err));
      setYtStatus('error');
    }
  }, []);

  function handleYtUrlChange(value: string) {
    setYtUrl(value);
    setYtMeta(null);
    setYtError('');
    setYtStatus('idle');
    if (isYouTubeUrl(value)) fetchYtMeta(value);
  }

  async function handleYtDownload() {
    if (!ytMeta || !ytUrl) return;
    setYtStatus('downloading');
    setYtError('');
    try {
      const res = await fetch('/api/youtube/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: ytUrl,
          title: ytMeta.title,
          thumbnailUrl: ytMeta.thumbnailUrl,
          duration: ytMeta.duration,
          estimatedSizeMb: ytMeta.estimatedSizeMb,
          requestedBy: username ?? 'anonymous',
        }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const { id, status: initialStatus } = await res.json() as { id: string; status: string };
      setYtDownloadId(id);
      setYtStatus(initialStatus === 'pending_approval' ? 'pending_approval' : 'downloading');
    } catch (err) {
      setYtError(String(err));
      setYtStatus('error');
    }
  }

  useEffect(() => {
    fetch('/api/jellyfin/health')
      .then((r) => r.json())
      .then((data: { ok: boolean; reason?: string }) => {
        if (data.ok) setJellyfinStatus('ok');
        else setJellyfinStatus(data.reason === 'not_configured' ? 'not_configured' : 'unreachable');
      })
      .catch(() => setJellyfinStatus('unreachable'));
  }, []);

  const currentParentId = breadcrumbs[breadcrumbs.length - 1].id;

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentParentId]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await fetchItems({ parentId: currentParentId, limit: 50 });
      setItems(data.Items);
    } catch {
      setError('Failed to load library. Check your Jellyfin config.');
    } finally {
      setLoading(false);
    }
  }

  const filteredItems = search.trim()
    ? items.filter((item) => item.Name.toLowerCase().includes(search.trim().toLowerCase()))
    : items;

  function navigate(item: JellyfinItem) {
    setBreadcrumbs((prev) => [...prev, { id: item.Id, name: item.Name }]);
    setSearch('');
  }

  function navigateTo(index: number) {
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
    setSearch('');
  }

  async function addFavToQueue(fav: Favourite) {
    setAdding(fav.jellyfinId);
    try {
      const { streamUrl, isHls } = await getStreamUrl(fav.jellyfinId);
      onAdd({
        id: generateId(),
        title: fav.title,
        source: 'jellyfin',
        streamUrl,
        isHls,
        thumbnailUrl: fav.thumbnailUrl,
        duration: fav.duration,
        jellyfinId: fav.jellyfinId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get stream URL.');
    } finally {
      setAdding(null);
    }
  }

  async function addToQueue(item: JellyfinItem) {
    setAdding(item.Id);
    try {
      const { streamUrl, isHls } = await getStreamUrl(item.Id);
      onAdd({
        id: generateId(),
        title: item.Name,
        source: 'jellyfin',
        streamUrl,
        isHls,
        thumbnailUrl: thumbnailUrl(item.Id),
        duration: item.RunTimeTicks ? Math.floor(item.RunTimeTicks / 10_000_000) : undefined,
        jellyfinId: item.Id,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get stream URL for that item.');
    } finally {
      setAdding(null);
    }
  }

  return (
    <div
      onClick={onClose}
      className="animate-pop-in"
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'grid', placeItems: 'center',
        background: 'var(--scrim)', backdropFilter: 'blur(4px)', padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 620, maxHeight: '82vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow)', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span style={{
              width: 38, height: 38, borderRadius: 'var(--r-md)',
              background: 'var(--accent-soft)', color: 'var(--accent)',
              display: 'grid', placeItems: 'center',
            }}>
              <Icon name="folder" size={20} />
            </span>
            <div>
              <h2 className="font-display" style={{ fontSize: 20, fontWeight: 600, margin: 0, color: 'var(--text)' }}>
                Your library
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: 'var(--text-faint)', marginTop: 1 }}>
                {breadcrumbs.map((crumb, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    {i > 0 && <Icon name="chevron" size={11} />}
                    <button
                      onClick={() => navigateTo(i)}
                      style={{
                        background: 'none', border: 'none', padding: 0,
                        fontWeight: 700, fontSize: 12.5,
                        color: i === breadcrumbs.length - 1 ? 'var(--text)' : 'var(--text-faint)',
                      }}
                    >
                      {crumb.name}
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 34, height: 34, borderRadius: '50%',
              border: '1px solid var(--border)', background: 'var(--surface-2)',
              color: 'var(--text-dim)', display: 'grid', placeItems: 'center',
            }}
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 6, padding: '0 20px 14px' }}>
          <button
            onClick={() => setTab('library')}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: tab === 'library' ? 'var(--accent-soft)' : 'var(--surface-2)',
              color: tab === 'library' ? 'var(--accent)' : 'var(--text-dim)',
              fontWeight: 800, fontSize: 13,
            }}
          >
            Library
          </button>
          <button
            onClick={() => setTab('youtube')}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: tab === 'youtube' ? 'rgba(255,68,68,0.12)' : 'var(--surface-2)',
              color: tab === 'youtube' ? '#ff4444' : 'var(--text-dim)',
              fontWeight: 800, fontSize: 13,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
            YouTube
          </button>
        </div>

        {/* Search — library tab only */}
        {tab === 'library' && (
        <div style={{ padding: '0 20px 14px' }}>
          <form onSubmit={(e) => e.preventDefault()} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 14px', borderRadius: 'var(--r-md)', border: '1.5px solid var(--border)', background: 'var(--surface-2)' }}>
            <Icon name="search" size={17} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your server…"
              style={{ flex: 1, border: 'none', background: 'none', color: 'var(--text)', fontSize: 14.5, fontWeight: 600, outline: 'none' }}
            />
          </form>
        </div>
        )}

        {/* Jellyfin status pill — library tab only */}
        {tab === 'library' && jellyfinStatus && jellyfinStatus !== 'ok' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            margin: '0 20px 12px',
            padding: '8px 14px', borderRadius: 99,
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            color: '#d97706',
            fontWeight: 700, fontSize: 13,
          }}>
            <Icon name="warning" size={15} />
            {jellyfinStatus === 'not_configured'
              ? 'Jellyfin not configured — check Admin settings'
              : 'Jellyfin server unreachable'}
          </div>
        )}

        {/* YouTube tab content */}
        {tab === 'youtube' && (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* URL input */}
            <div style={{ position: 'relative' }}>
              <input
                type="url"
                value={ytUrl}
                onChange={(e) => handleYtUrlChange(e.target.value)}
                placeholder="Search or paste YouTube URL"
                autoFocus
                spellCheck={false}
                disabled={ytStatus === 'downloading' || ytStatus === 'pending_approval' || ytStatus === 'done'}
                style={{
                  width: '100%', padding: '11px 40px 11px 13px', borderRadius: 10,
                  border: '1.5px solid var(--border)', background: 'var(--surface-2)',
                  color: 'var(--text)', fontSize: 14, fontWeight: 600, outline: 'none',
                  fontFamily: 'inherit', boxSizing: 'border-box',
                  opacity: (ytStatus === 'downloading' || ytStatus === 'pending_approval' || ytStatus === 'done') ? 0.6 : 1,
                }}
              />
              {ytStatus === 'fetching' && (
                <div style={{
                  position: 'absolute', right: 13, top: 'calc(50% - 7.5px)',
                  width: 15, height: 15, borderRadius: '50%',
                  border: '2px solid var(--border)', borderTopColor: 'var(--accent)',
                  animation: 'yt-spin 0.7s linear infinite',
                }} />
              )}
            </div>

            {/* Metadata card */}
            {ytMeta && (ytStatus === 'ready' || ytStatus === 'downloading' || ytStatus === 'pending_approval' || ytStatus === 'done') && (
              <div style={{
                display: 'flex', gap: 14, padding: 14, borderRadius: 12,
                background: 'var(--surface-2)', border: '1px solid var(--border)',
              }}>
                {ytMeta.thumbnailUrl && (
                  <img
                    src={ytMeta.thumbnailUrl}
                    alt=""
                    style={{ width: 96, height: 54, objectFit: 'cover', borderRadius: 8, flexShrink: 0, background: 'var(--surface-3)' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
                  <div style={{
                    fontWeight: 700, fontSize: 14, color: 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  }}>
                    {ytMeta.title}
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {ytMeta.duration > 0 && (
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>
                        {ytFormatDuration(ytMeta.duration)}
                      </span>
                    )}
                    {ytMeta.estimatedSizeMb > 0 && (
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-faint)' }}>
                        ~{ytMeta.estimatedSizeMb} MB
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Status messages */}
            {ytStatus === 'pending_approval' && (
              <div style={{ padding: '11px 14px', borderRadius: 10, background: 'rgba(88,101,242,0.12)', border: '1px solid rgba(88,101,242,0.4)', fontSize: 13, fontWeight: 600, color: '#8b96f0' }}>
                ⏳ Awaiting approval — a notification was sent to Discord. The download will start once approved.
              </div>
            )}
            {ytStatus === 'downloading' && (
              <div style={{ padding: '11px 14px', borderRadius: 10, background: 'var(--accent-soft)', border: '1px solid var(--accent)', fontSize: 13, fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 13, height: 13, borderRadius: '50%', flexShrink: 0, border: '2px solid var(--accent)', borderTopColor: 'transparent', animation: 'yt-spin 0.7s linear infinite' }} />
                Downloading… this may take a moment.
              </div>
            )}
            {ytStatus === 'done' && (
              <div style={{ padding: '11px 14px', borderRadius: 10, background: 'rgba(59,165,92,0.12)', border: '1px solid rgba(59,165,92,0.4)', fontSize: 13, fontWeight: 700, color: '#3ba55c' }}>
                ✅ Added to queue!
              </div>
            )}
            {ytStatus === 'denied' && (
              <div style={{ padding: '11px 14px', borderRadius: 10, background: 'rgba(237,66,69,0.12)', border: '1px solid rgba(237,66,69,0.4)', fontSize: 13, fontWeight: 600, color: '#ed4245' }}>
                ❌ Request denied.
              </div>
            )}
            {ytStatus === 'error' && ytError && (
              <div style={{ padding: '11px 14px', borderRadius: 10, background: 'rgba(237,66,69,0.12)', border: '1px solid rgba(237,66,69,0.4)', fontSize: 13, fontWeight: 600, color: '#ed4245' }}>
                Error: {ytError}
              </div>
            )}

            {/* Download button */}
            {ytStatus === 'ready' && ytMeta && (
              <button
                onClick={handleYtDownload}
                style={{
                  width: '100%', padding: '12px 18px', borderRadius: 10, border: 'none',
                  background: 'var(--accent)', color: 'var(--accent-ink)',
                  fontWeight: 800, fontSize: 14, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: '0 8px 20px -8px var(--accent)',
                }}
              >
                <Icon name="plus" size={16} /> Download &amp; Add to Queue
              </button>
            )}
            <style>{`@keyframes yt-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Items — library tab only */}
        {tab === 'library' && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '0 12px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>

          {/* Favourites — only shown when not actively searching */}
          {!search.trim() && favourites.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 8px 4px', fontSize: 11.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
                <Icon name="heart" size={13} style={{ color: 'var(--accent)' }} /> Favourites
              </div>
              {favourites.map((fav) => (
                <div key={fav.jellyfinId} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: 10, borderRadius: 'var(--r-md)' }}>
                  <div style={{
                    width: 44, height: 62, borderRadius: 8, flexShrink: 0, overflow: 'hidden',
                    background: thumbGradient(fav.title),
                  }}>
                    {fav.thumbnailUrl && (
                      <img
                        src={fav.thumbnailUrl}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fav.title}</div>
                    {fav.duration && (
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-faint)' }}>
                        {Math.floor(fav.duration / 3600) > 0
                          ? `${Math.floor(fav.duration / 3600)}h ${String(Math.floor((fav.duration % 3600) / 60)).padStart(2, '0')}m`
                          : `${Math.floor(fav.duration / 60)}:${String(fav.duration % 60).padStart(2, '0')}`}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => addFavToQueue(fav)}
                    disabled={adding === fav.jellyfinId}
                    style={{
                      padding: '8px 15px', borderRadius: 'var(--r-sm)', border: 'none',
                      background: 'var(--accent)', color: 'var(--accent-ink)',
                      fontWeight: 800, fontSize: 13, opacity: adding === fav.jellyfinId ? 0.5 : 1,
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <Icon name="plus" size={15} /> {adding === fav.jellyfinId ? '…' : 'Queue'}
                  </button>
                </div>
              ))}
              <div style={{ height: 1, background: 'var(--border-soft)', margin: '6px 8px 2px' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px 4px', fontSize: 11.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
                <Icon name="folder" size={13} /> Library
              </div>
            </>
          )}

          {loading && (
            <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontWeight: 600, padding: '30px 0' }}>Loading…</p>
          )}
          {error && (
            <p style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 13.5, padding: '8px 0' }}>{error}</p>
          )}
          {!loading && filteredItems.length === 0 && !error && (
            <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontWeight: 600, padding: '30px 0' }}>No items found.</p>
          )}
          {filteredItems.map((item) => {
            const browseable = BROWSEABLE_TYPES.has(item.Type);
            const playable = PLAYABLE_TYPES.has(item.Type);
            return (
              <div
                key={item.Id}
                style={{ display: 'flex', alignItems: 'center', gap: 13, padding: 10, borderRadius: 'var(--r-md)' }}
              >
                <div style={{
                  position: 'relative', width: 44, height: 62, borderRadius: 8, flexShrink: 0, overflow: 'hidden',
                  background: failedThumbs.has(item.Id) ? thumbGradient(item.Name) : 'var(--surface-3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {failedThumbs.has(item.Id) ? (
                    <span style={{
                      fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.9)',
                      textAlign: 'center', padding: '2px 5px', lineHeight: 1.3,
                      textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                      wordBreak: 'break-word', overflow: 'hidden', maxHeight: 50, width: '100%',
                    }}>
                      {item.Name}
                    </span>
                  ) : (
                    <>
                      {browseable && (
                        <span style={{
                          position: 'absolute', inset: 0,
                          color: 'var(--text-faint)',
                          display: 'grid', placeItems: 'center',
                        }}>
                          <Icon name="folder" size={22} />
                        </span>
                      )}
                      <img
                        src={thumbnailUrl(item.Id)}
                        alt=""
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={() => setFailedThumbs(prev => new Set(prev).add(item.Id))}
                      />
                    </>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--text)' }}>{item.Name}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-faint)' }}>
                    {item.Type}{item.RunTimeTicks ? ` · ${formatDuration(item.RunTimeTicks)}` : ''}
                  </div>
                </div>

                {browseable && (
                  <button
                    onClick={() => navigate(item)}
                    style={{
                      padding: '8px 15px', borderRadius: 'var(--r-sm)',
                      border: '1.5px solid var(--border)', background: 'var(--surface)',
                      color: 'var(--text)', fontWeight: 800, fontSize: 13,
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    Open <Icon name="chevron" size={14} />
                  </button>
                )}
                {playable && (
                  <button
                    onClick={() => addToQueue(item)}
                    disabled={adding === item.Id}
                    style={{
                      padding: '8px 15px', borderRadius: 'var(--r-sm)', border: 'none',
                      background: 'var(--accent)', color: 'var(--accent-ink)',
                      fontWeight: 800, fontSize: 13, opacity: adding === item.Id ? 0.5 : 1,
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <Icon name="plus" size={15} /> {adding === item.Id ? '…' : 'Queue'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
}
