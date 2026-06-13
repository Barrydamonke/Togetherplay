import { useEffect, useRef, useState } from 'react';
import { ChatMessage } from '../types';
import { Icon } from './Icon';

interface Props {
  messages: ChatMessage[];
  currentMemberId: string;
  onSend: (text: string) => void;
}

export function Chat({ messages, currentMemberId, onSend }: Props) {
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: 'clamp(180px, 30vh, 248px)',
      borderTop: '1px solid var(--border)',
    }}>
      {/* Section label */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '0 16px', height: 34, flexShrink: 0,
        fontSize: 11.5, fontWeight: 800, letterSpacing: '.07em',
        textTransform: 'uppercase', color: 'var(--text-faint)',
      }}>
        <Icon name="chat" size={13} /> Chat
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
        padding: '4px 14px', display: 'flex', flexDirection: 'column', gap: 9,
      }}>
        {messages.map((msg) => {
          const isMe = msg.memberId === currentMemberId;
          return (
            <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
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
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div style={{ display: 'flex', gap: 8, padding: 10, flexShrink: 0 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Say something…"
          maxLength={500}
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 99,
            border: '1.5px solid var(--border)', background: 'var(--surface-2)',
            color: 'var(--text)', fontSize: 13.5, fontWeight: 600, outline: 'none',
          }}
        />
        <button
          onClick={send}
          style={{
            width: 40, height: 40, borderRadius: '50%', border: 'none', flexShrink: 0,
            background: 'var(--accent)', color: 'var(--accent-ink)',
            display: 'grid', placeItems: 'center',
          }}
        >
          <Icon name="send" size={17} />
        </button>
      </div>
    </div>
  );
}
