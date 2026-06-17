import { useState, useRef } from 'react';
import { Room, Video } from '../types';
import { JellyfinBrowser } from './JellyfinBrowser';
import { Icon } from './Icon';

interface Props {
  room: Room;
  isHost: boolean;
  onSetCurrentVideo: (index: number) => void;
  onRemoveFromQueue: (index: number) => void;
  onAddVideo: (video: Video) => void;
  onReorderQueue: (from: number, to: number) => void;
}

const MEMBER_COLORS = ['#ff7a52', '#6fae8e', '#5e6fb5', '#d98b9e', '#c98a52', '#7fa6cf', '#9b6ae0', '#3fae93'];

function memberColor(index: number) {
  return MEMBER_COLORS[index % MEMBER_COLORS.length];
}

function CopyPin({ pin }: { pin: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(pin).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button onClick={copy} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      width: '100%', padding: '12px 14px', borderRadius: 'var(--r-md)',
      border: '1.5px dashed var(--border)', background: 'var(--surface-2)',
      color: 'var(--text)',
    }}>
      <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
        Room PIN
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
        <span className="font-display" style={{ fontSize: 22, fontWeight: 600, letterSpacing: '.18em', color: 'var(--accent)' }}>
          {pin}
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: copied ? 'var(--online)' : 'var(--text-faint)' }}>
          {copied ? 'Copied!' : 'Copy'}
        </span>
      </span>
    </button>
  );
}

export function Sidebar({ room, isHost, onSetCurrentVideo, onRemoveFromQueue, onAddVideo, onReorderQueue }: Props) {
  const [showBrowser, setShowBrowser] = useState(false);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const canManageQueue = isHost || room.viewerCanManageQueue;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* PIN */}
      <div style={{ padding: '14px 16px 6px' }}>
        <CopyPin pin={room.pin} />
      </div>

      {/* Members */}
      <div style={{ borderTop: '1px solid var(--border-soft)', marginTop: 6 }}>
        <div style={{
          display: 'flex', alignItems: 'center', padding: '0 16px', height: 34,
          fontSize: 11.5, fontWeight: 800, letterSpacing: '.07em',
          textTransform: 'uppercase', color: 'var(--text-faint)', gap: 7,
        }}>
          <Icon name="users" size={13} /> Watching · {room.members.length}
        </div>
        <div style={{ padding: '2px 8px 8px' }}>
          {room.members.map((m, i) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px', borderRadius: 'var(--r-sm)' }}>
              <span style={{ position: 'relative', flexShrink: 0 }}>
                <span style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: memberColor(i), color: '#fff',
                  display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13,
                }}>
                  {m.username[0].toUpperCase()}
                </span>
                <span style={{
                  position: 'absolute', right: -1, bottom: -1,
                  width: 10, height: 10, borderRadius: '50%',
                  background: 'var(--online)', border: '2px solid var(--surface)',
                }} />
              </span>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{m.username}</span>
              {m.isHost && (
                <span style={{
                  marginLeft: 'auto', fontSize: 11, fontWeight: 800,
                  color: 'var(--accent)', background: 'var(--accent-soft)',
                  padding: '3px 9px', borderRadius: 99,
                }}>HOST</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Queue */}
      <div style={{ borderTop: '1px solid var(--border-soft)', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px', height: 34, flexShrink: 0,
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
            <Icon name="list" size={13} /> Up next
          </span>
          {canManageQueue && (
            <button
              onClick={() => setShowBrowser(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 12.5, fontWeight: 800, color: 'var(--accent)',
                background: 'var(--accent-soft)', border: 'none',
                padding: '5px 11px', borderRadius: 99,
              }}
            >
              <Icon name="plus" size={14} /> Add
            </button>
          )}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {room.queue.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 13.5, fontWeight: 600, padding: '20px 0' }}>
              {canManageQueue ? 'Add something to watch.' : "Queue's empty."}
            </p>
          )}
          {room.queue.map((video, index) => {
            const isCurrent = index === room.currentVideoIndex;
            const isDragTarget = dragOver === index && dragIndexRef.current !== index;
            return (
              <div
                key={video.id}
                draggable={canManageQueue && !isCurrent}
                onDragStart={() => { dragIndexRef.current = index; }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(index); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => {
                  const from = dragIndexRef.current;
                  if (from !== null && from !== index) onReorderQueue(from, index);
                  dragIndexRef.current = null;
                  setDragOver(null);
                }}
                onDragEnd={() => { dragIndexRef.current = null; setDragOver(null); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 11,
                  padding: 8, borderRadius: 'var(--r-md)',
                  background: isCurrent ? 'var(--accent-soft)' : isDragTarget ? 'var(--surface-2)' : 'transparent',
                  boxShadow: isCurrent ? 'inset 0 0 0 1.5px var(--accent)' : isDragTarget ? 'inset 0 0 0 1.5px var(--border)' : 'none',
                  cursor: canManageQueue && !isCurrent ? 'grab' : 'default',
                  transition: 'background .1s, box-shadow .1s',
                }}
              >
                {/* Drag handle — non-current items when queue management is allowed */}
                {canManageQueue && !isCurrent && (
                  <span style={{ color: 'var(--text-faint)', flexShrink: 0, cursor: 'grab', display: 'grid', placeItems: 'center' }}>
                    <Icon name="grip" size={16} />
                  </span>
                )}

                {/* Thumbnail or gradient fallback */}
                {video.thumbnailUrl ? (
                  <img
                    src={video.thumbnailUrl}
                    alt=""
                    style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 8, flexShrink: 0, background: 'var(--surface-3)' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div style={{
                    width: 36, height: 50, borderRadius: 8, flexShrink: 0,
                    background: `linear-gradient(150deg, ${MEMBER_COLORS[index % MEMBER_COLORS.length]}, #1a1a2e)`,
                  }} />
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {video.title}
                  </div>
                  {isCurrent
                    ? <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)' }}>Now playing</div>
                    : video.duration
                      ? <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-faint)' }}>{formatDuration(video.duration)}</div>
                      : null}
                </div>

                {isHost && (
                  <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                    {!isCurrent && (
                      <button
                        onClick={() => onSetCurrentVideo(index)}
                        title="Play now"
                        style={miniBtn}
                      >
                        <Icon name="play" size={13} />
                      </button>
                    )}
                    <button
                      onClick={() => onRemoveFromQueue(index)}
                      title="Remove"
                      style={miniBtn}
                    >
                      <Icon name="close" size={13} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {showBrowser && (
        <JellyfinBrowser
          onAdd={(video) => { onAddVideo(video); setShowBrowser(false); }}
          onClose={() => setShowBrowser(false)}
        />
      )}
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--text-dim)', display: 'grid', placeItems: 'center',
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
