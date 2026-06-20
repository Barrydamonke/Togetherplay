import { useEffect, useState } from 'react';

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
import { Video } from '../types';
import { Icon } from './Icon';

interface Props {
  onAdd: (video: Video) => void;
  onClose: () => void;
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

export function JellyfinBrowser({ onAdd, onClose }: Props) {
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

        {/* Search */}
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

        {/* Jellyfin status pill */}
        {jellyfinStatus && jellyfinStatus !== 'ok' && (
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

        {/* Items */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '0 12px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
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
      </div>
    </div>
  );
}
