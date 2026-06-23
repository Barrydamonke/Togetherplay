import { useState } from 'react';
import { Room } from '../types';
import { Icon } from './Icon';

interface Props {
  room: Room;
  membersCollapsed: boolean;
  onToggleMembersCollapsed: () => void;
  channelName?: string | null;
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

// Renders only the PIN banner and the Watching section.
// Queue is rendered as a direct flex sibling in Room.tsx so it and Chat can share space.
export function Sidebar({ room, membersCollapsed, onToggleMembersCollapsed, channelName }: Props) {
  return (
    <div style={{ flexShrink: 0 }}>
      {/* PIN for regular rooms; voice channel label for Discord rooms */}
      <div style={{ padding: '14px 16px 6px' }}>
        {room.discordOnly ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', padding: '12px 14px', borderRadius: 'var(--r-md)',
            border: '1.5px dashed var(--border)', background: 'var(--surface-2)',
            color: 'var(--text)', boxSizing: 'border-box',
          }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
              Voice Channel
            </span>
            <span className="font-display" style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent)', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {channelName ?? '—'}
            </span>
          </div>
        ) : (
          <CopyPin pin={room.pin} />
        )}
      </div>

      {/* Watching / Members */}
      <div style={{ borderTop: '1px solid var(--border-soft)', marginTop: 6 }}>
        <div
          onClick={onToggleMembersCollapsed}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 16px', height: 34, cursor: 'pointer',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
            <Icon name="users" size={13} /> Watching · {room.members.length}
          </span>
          <Icon name={membersCollapsed ? 'chevron-down' : 'chevron-up'} size={13} style={{ color: 'var(--text-faint)' }} />
        </div>
        {!membersCollapsed && (
          <div style={{ padding: '2px 8px 8px' }}>
            {room.members.map((m, i) => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px', borderRadius: 'var(--r-sm)' }}>
                <span style={{ position: 'relative', flexShrink: 0 }}>
                  {m.avatar ? (
                    <img
                      src={m.avatar}
                      alt={m.username}
                      style={{ width: 30, height: 30, borderRadius: '50%', display: 'block' }}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <span style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: memberColor(i), color: '#fff',
                      display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13,
                    }}>
                      {m.username[0].toUpperCase()}
                    </span>
                  )}
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
        )}
      </div>
    </div>
  );
}

export { MEMBER_COLORS };
