import { useEffect, useRef, useState } from 'react';
import { ChatMessage } from '../types';
import { Icon } from './Icon';

interface Props {
  messages: ChatMessage[];
  currentMemberId: string;
  isMobile?: boolean;
  rateLimited?: boolean;
  disconnected?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onSend: (text: string) => void;
}

function formatClockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatVideoTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function Chat({ messages, currentMemberId, isMobile, rateLimited, disconnected, collapsed, onToggleCollapse, onSend }: Props) {
  const [text, setText] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);

  useEffect(() => {
    const isBulk = messages.length > prevMessageCountRef.current + 1;
    prevMessageCountRef.current = messages.length;
    bottomRef.current?.scrollIntoView({ behavior: isBulk ? 'auto' : 'smooth' });
  }, [messages]);

  function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  }

  // On desktop, Chat is a flex child of aside and fills remaining space via flex: 1.
  // On mobile, aside scrolls so we use a clamped fixed height instead.
  const outerStyle: React.CSSProperties = isMobile
    ? {
        display: 'flex', flexDirection: 'column',
        height: collapsed ? 'auto' : 'clamp(220px, 36vh, 320px)',
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
      }
    : {
        display: 'flex', flexDirection: 'column',
        flex: collapsed ? '0 0 auto' : '1 1 0',
        minHeight: 0,
        overflow: 'hidden',
        borderTop: '1px solid var(--border)',
      };

  return (
    <div style={outerStyle}>
      {/* Section label — clickable to collapse when onToggleCollapse provided */}
      <div
        onClick={onToggleCollapse}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px', height: 34, flexShrink: 0,
          cursor: onToggleCollapse ? 'pointer' : undefined,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
          <Icon name="chat" size={13} /> Chat
        </span>
        {onToggleCollapse && (
          <Icon name={collapsed ? 'chevron-down' : 'chevron-up'} size={13} style={{ color: 'var(--text-faint)' }} />
        )}
      </div>

      {/* Messages + input — hidden when collapsed */}
      {!collapsed && (<><div style={{
        flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
        padding: '4px 14px', display: 'flex', flexDirection: 'column', gap: 9,
      }}>
        {messages.map((msg) => {
          if (msg.type === 'system') {
            return (
              <div key={msg.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border-soft)' }} />
                <span style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--text-faint)',
                  whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  <Icon name="play" size={10} style={{ opacity: 0.6 }} /> {msg.text}
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--border-soft)' }} />
              </div>
            );
          }

          const isMe = msg.memberId === currentMemberId;
          const isHovered = hoveredId === msg.id;
          const timestampParts: string[] = [formatClockTime(msg.sentAt)];
          if (msg.videoTimestamp !== undefined) {
            timestampParts.push(`at ${formatVideoTime(msg.videoTimestamp)}`);
          }

          return (
            <div
              key={msg.id}
              onMouseEnter={() => setHoveredId(msg.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}
            >
              {!isMe && (
                <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--accent)', marginBottom: 2, paddingLeft: 2 }}>
                  {msg.username}
                </span>
              )}
              <span style={{
                maxWidth: '86%', padding: '8px 12px',
                borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: isMe ? 'var(--accent)' : 'var(--surface-2)',
                color: isMe ? 'var(--accent-ink)' : 'var(--text)',
                fontSize: 13.5, fontWeight: 600, lineHeight: 1.35,
              }}>
                {msg.text}
              </span>
              {isHovered && (
                <span style={{
                  fontSize: 11, fontWeight: 600, color: 'var(--text-faint)',
                  marginTop: 3,
                  paddingLeft: isMe ? 0 : 2,
                  paddingRight: isMe ? 2 : 0,
                }}>
                  {timestampParts.join(' · ')}
                </span>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reconnecting banner */}
      {disconnected && (
        <div style={{
          margin: '0 10px 6px', padding: '7px 12px', borderRadius: 'var(--r-sm)',
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          fontSize: 12.5, fontWeight: 700, color: 'var(--text-dim)', textAlign: 'center',
        }}>
          Reconnecting…
        </div>
      )}

      {/* Input row */}
      <div style={{ display: 'flex', gap: 8, padding: 10, flexShrink: 0 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={disconnected ? 'Reconnecting…' : rateLimited ? '🌿 touch some grass first…' : 'Say something…'}
          maxLength={500}
          disabled={rateLimited || disconnected}
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 99,
            border: '1.5px solid var(--border)', background: 'var(--surface-2)',
            color: 'var(--text)', fontSize: 13.5, fontWeight: 600, outline: 'none',
            opacity: rateLimited || disconnected ? 0.45 : 1,
          }}
        />
        <button
          onClick={send}
          disabled={rateLimited || disconnected}
          style={{
            width: 40, height: 40, borderRadius: '50%', border: 'none', flexShrink: 0,
            background: 'var(--accent)', color: 'var(--accent-ink)',
            display: 'grid', placeItems: 'center',
            opacity: rateLimited || disconnected ? 0.45 : 1,
          }}
        >
          <Icon name="send" size={17} />
        </button>
      </div>
      </>)}
    </div>
  );
}
