import { useState, useEffect, useRef, useCallback } from 'react';
import { Video } from '../types';
import { getSocket } from '../lib/socket';
import { Icon } from './Icon';

interface Props {
  onAdd: (video: Video) => void;
  onClose: () => void;
  username: string;
}

interface YTMeta {
  title: string;
  thumbnailUrl: string;
  duration: number;
  estimatedSizeMb: number;
}

type PanelStatus = 'idle' | 'fetching' | 'ready' | 'pending_approval' | 'downloading' | 'done' | 'error' | 'denied';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function isYouTubeUrl(str: string): boolean {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(str.trim());
}

export function YouTubePanel({ onAdd, onClose, username }: Props) {
  const [url, setUrl] = useState('');
  const [meta, setMeta] = useState<YTMeta | null>(null);
  const [status, setStatus] = useState<PanelStatus>('idle');
  const [error, setError] = useState('');
  const [downloadId, setDownloadId] = useState<string | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const socket = getSocket();

  // Listen for status updates from the server
  useEffect(() => {
    if (!downloadId) return;
    const handler = ({ id, status: s, error: e }: { id: string; status: string; error?: string }) => {
      if (id !== downloadId) return;
      if (s === 'ready') {
        setStatus('done');
        // Build the Video object and add it to the queue
        if (meta) {
          const video: Video = {
            id: downloadId,
            title: meta.title,
            source: 'youtube',
            streamUrl: `/api/youtube/file/${downloadId}`,
            thumbnailUrl: meta.thumbnailUrl || undefined,
            duration: meta.duration || undefined,
            ytDownloadId: downloadId,
          };
          onAdd(video);
        }
      } else if (s === 'downloading') {
        setStatus('downloading');
      } else if (s === 'error') {
        setStatus('error');
        setError(e ?? 'Download failed. Check the server logs.');
      } else if (s === 'denied') {
        setStatus('denied');
      }
    };
    socket.on('youtube:status_update', handler);
    return () => { socket.off('youtube:status_update', handler); };
  }, [downloadId, meta, onAdd, socket]);

  const fetchMeta = useCallback(async (targetUrl: string) => {
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    setStatus('fetching');
    setMeta(null);
    setError('');
    try {
      const res = await fetch(`/api/youtube/info?url=${encodeURIComponent(targetUrl)}`, { signal: controller.signal });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as YTMeta;
      setMeta(data);
      setStatus('ready');
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(String(err));
      setStatus('error');
    }
  }, []);

  function handleUrlChange(value: string) {
    setUrl(value);
    setMeta(null);
    setError('');
    setStatus('idle');
    if (isYouTubeUrl(value)) {
      fetchMeta(value);
    }
  }

  async function handleDownload() {
    if (!meta || !url) return;
    setStatus('downloading');
    setError('');
    try {
      const res = await fetch('/api/youtube/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          title: meta.title,
          thumbnailUrl: meta.thumbnailUrl,
          duration: meta.duration,
          estimatedSizeMb: meta.estimatedSizeMb,
          requestedBy: username,
        }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const { id, status: initialStatus } = await res.json() as { id: string; status: string };
      setDownloadId(id);
      if (initialStatus === 'pending_approval') {
        setStatus('pending_approval');
      } else {
        setStatus('downloading');
      }
    } catch (err) {
      setError(String(err));
      setStatus('error');
    }
  }

  const isWorking = status === 'fetching' || status === 'downloading' || status === 'pending_approval' || status === 'done';

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'var(--scrim)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        className="animate-pop-in"
        style={{
          width: '100%', maxWidth: 520,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-xl)', padding: 24, boxShadow: 'var(--shadow)',
          display: 'flex', flexDirection: 'column', gap: 18,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: 'rgba(255,0,0,0.12)', color: '#ff4444',
              display: 'grid', placeItems: 'center',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
            </span>
            <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>Add from YouTube</span>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center',
              border: '1px solid var(--border)', background: 'var(--surface-2)',
              color: 'var(--text-dim)', cursor: 'pointer',
            }}
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        {/* URL Input */}
        <div style={{ position: 'relative' }}>
          <input
            type="url"
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="Search or paste YouTube URL"
            disabled={isWorking}
            autoFocus
            spellCheck={false}
            style={{
              width: '100%', padding: '11px 40px 11px 13px', borderRadius: 10,
              border: '1.5px solid var(--border)', background: 'var(--surface-2)',
              color: 'var(--text)', fontSize: 14, fontWeight: 600, outline: 'none',
              fontFamily: 'inherit', boxSizing: 'border-box',
              opacity: isWorking ? 0.6 : 1,
            }}
          />
          {status === 'fetching' && (
            <div style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              width: 16, height: 16, borderRadius: '50%',
              border: '2px solid var(--border)', borderTopColor: 'var(--accent)',
              animation: 'spin 0.7s linear infinite',
            }} />
          )}
        </div>

        {/* Metadata card */}
        {meta && (status === 'ready' || status === 'downloading' || status === 'pending_approval' || status === 'done') && (
          <div style={{
            display: 'flex', gap: 14, padding: 14, borderRadius: 12,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
          }}>
            {meta.thumbnailUrl && (
              <img
                src={meta.thumbnailUrl}
                alt=""
                style={{
                  width: 96, height: 54, objectFit: 'cover', borderRadius: 8,
                  flexShrink: 0, background: 'var(--surface-3)',
                }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
              <div style={{
                fontWeight: 700, fontSize: 14, color: 'var(--text)',
                overflow: 'hidden', textOverflow: 'ellipsis',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>
                {meta.title}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {meta.duration > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>
                    {formatDuration(meta.duration)}
                  </span>
                )}
                {meta.estimatedSizeMb > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-faint)' }}>
                    ~{meta.estimatedSizeMb} MB
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Status messages */}
        {status === 'pending_approval' && (
          <div style={{
            padding: '12px 14px', borderRadius: 10,
            background: 'rgba(88,101,242,0.12)', border: '1px solid rgba(88,101,242,0.4)',
            fontSize: 13, fontWeight: 600, color: '#8b96f0',
          }}>
            ⏳ Awaiting approval — a notification has been sent to Discord. The download will start once approved.
          </div>
        )}
        {status === 'downloading' && (
          <div style={{
            padding: '12px 14px', borderRadius: 10,
            background: 'var(--accent-soft)', border: '1px solid var(--accent)',
            fontSize: 13, fontWeight: 600, color: 'var(--accent)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <div style={{
              width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
              border: '2px solid var(--accent)', borderTopColor: 'transparent',
              animation: 'spin 0.7s linear infinite',
            }} />
            Downloading… this may take a moment.
          </div>
        )}
        {status === 'done' && (
          <div style={{
            padding: '12px 14px', borderRadius: 10,
            background: 'rgba(59,165,92,0.12)', border: '1px solid rgba(59,165,92,0.4)',
            fontSize: 13, fontWeight: 700, color: '#3ba55c',
          }}>
            ✅ Added to queue!
          </div>
        )}
        {status === 'denied' && (
          <div style={{
            padding: '12px 14px', borderRadius: 10,
            background: 'rgba(237,66,69,0.12)', border: '1px solid rgba(237,66,69,0.4)',
            fontSize: 13, fontWeight: 600, color: '#ed4245',
          }}>
            ❌ Request denied.
          </div>
        )}
        {status === 'error' && error && (
          <div style={{
            padding: '12px 14px', borderRadius: 10,
            background: 'rgba(237,66,69,0.12)', border: '1px solid rgba(237,66,69,0.4)',
            fontSize: 13, fontWeight: 600, color: '#ed4245',
          }}>
            Error: {error}
          </div>
        )}

        {/* Download button */}
        {status === 'ready' && meta && (
          <button
            onClick={handleDownload}
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
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
