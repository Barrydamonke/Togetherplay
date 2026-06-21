import { useState, CSSProperties } from 'react';
import { Room, AspectRatio } from '../types';
import { Icon } from './Icon';

const ASPECT_RATIOS: { value: AspectRatio; label: string }[] = [
  { value: 'auto',    label: 'Auto' },
  { value: '16/9',   label: '16 : 9' },
  { value: '4/3',    label: '4 : 3' },
  { value: '2.39/1', label: '2.39 : 1' },
];

interface Props {
  room: Room;
  isHost: boolean;
  currentUsername: string;
  aspectRatio: AspectRatio;
  onSetAspectRatio: (ratio: AspectRatio) => void;
  showStats: boolean;
  onSetShowStats: (v: boolean) => void;
  sidebarWidth?: number;
  onSetSidebarWidth?: (w: number) => void;
  onRename: (name: string) => void;
  onUpdateSettings: (settings: Partial<{ hidden: boolean; viewerCanManageQueue: boolean; viewerCanControl: boolean; idleGameUrl: string }>) => void;
  onClose: () => void;
}

const inputStyle: CSSProperties = {
  flex: 1, padding: '10px 13px', borderRadius: 10,
  border: '1.5px solid var(--border)', background: 'var(--surface-2)',
  color: 'var(--text)', fontSize: 14, fontWeight: 600, outline: 'none',
  fontFamily: 'inherit',
};

const labelCap: CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 800,
  letterSpacing: '.05em', textTransform: 'uppercase',
  color: 'var(--text-faint)', marginBottom: 8,
};

const sectionHead: CSSProperties = {
  fontSize: 11, fontWeight: 800, letterSpacing: '.06em',
  textTransform: 'uppercase', color: 'var(--text-faint)',
  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
};

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        position: 'relative', width: 36, height: 20, borderRadius: 99,
        background: on ? 'var(--accent)' : 'rgba(128,128,128,.3)',
        border: 'none', cursor: 'pointer', flexShrink: 0,
        transition: 'background .2s',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 19 : 3,
        width: 14, height: 14, borderRadius: '50%', background: '#fff',
        transition: 'left .2s',
        boxShadow: '0 1px 3px rgba(0,0,0,.3)',
      }} />
    </button>
  );
}

function SettingRow({ label, description, on, onToggle }: { label: string; description: string; on: boolean; onToggle: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: '1px solid var(--border-soft)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{label}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-dim)', fontWeight: 600, marginTop: 2 }}>{description}</div>
      </div>
      <Toggle on={on} onToggle={onToggle} />
    </div>
  );
}

export function RoomSettings({ room, isHost, currentUsername, aspectRatio, onSetAspectRatio, showStats, onSetShowStats, sidebarWidth, onSetSidebarWidth, onRename, onUpdateSettings, onClose }: Props) {
  const [name, setName] = useState(currentUsername);
  const [nameSaved, setNameSaved] = useState(false);
  const [idleGameUrl, setIdleGameUrl] = useState(room.idleGameUrl ?? '');
  const [idleGameSaved, setIdleGameSaved] = useState(false);

  function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === currentUsername) return;
    onRename(trimmed);
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 1400);
  }

  function saveIdleGameUrl() {
    onUpdateSettings({ idleGameUrl: idleGameUrl.trim() });
    setIdleGameSaved(true);
    setTimeout(() => setIdleGameSaved(false), 1400);
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'var(--scrim)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        className="animate-pop-in"
        style={{
          width: '100%', maxWidth: 420,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow)',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          maxHeight: 'calc(100vh - 40px)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 16px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 34, height: 34, borderRadius: 'var(--r-sm)',
              background: 'var(--accent-soft)', color: 'var(--accent)',
              display: 'grid', placeItems: 'center', flexShrink: 0,
            }}>
              <Icon name="settings" size={17} />
            </span>
            <div>
              <div className="font-display" style={{ fontWeight: 600, fontSize: 18, color: 'var(--text)' }}>
                Room settings
              </div>
              {isHost && (
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginTop: 1 }}>
                  Host
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: '50%',
              border: '1px solid var(--border)', background: 'var(--surface-2)',
              color: 'var(--text-dim)', display: 'grid', placeItems: 'center',
            }}
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        <div style={{ padding: '20px 20px 24px', display: 'flex', flexDirection: 'column', gap: 24, overflowY: 'auto', flex: 1 }}>
          {/* Your name */}
          <section>
            <p style={sectionHead}><Icon name="users" size={13} /> Your name</p>
            <label style={labelCap}>Display name</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={inputStyle}
                value={name}
                maxLength={32}
                onChange={(e) => { setName(e.target.value); setNameSaved(false); }}
                onKeyDown={(e) => e.key === 'Enter' && saveName()}
                placeholder="Your name"
              />
              <button
                onClick={saveName}
                disabled={!name.trim() || name.trim() === currentUsername}
                style={{
                  padding: '10px 16px', borderRadius: 10, border: 'none',
                  background: nameSaved ? 'var(--online)' : 'var(--accent)',
                  color: 'var(--accent-ink)', fontWeight: 800, fontSize: 13,
                  opacity: (!name.trim() || name.trim() === currentUsername) ? 0.4 : 1,
                  transition: 'background .2s',
                }}
              >
                {nameSaved ? 'Saved!' : 'Save'}
              </button>
            </div>
          </section>

          {/* Display settings — per-user, local only */}
          <section>
            <p style={sectionHead}><Icon name="play" size={13} /> Display</p>
            <label style={labelCap}>Player aspect ratio</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {ASPECT_RATIOS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => onSetAspectRatio(value)}
                  style={{
                    flex: 1,
                    padding: '9px 4px',
                    borderRadius: 'var(--r-sm)',
                    border: `1.5px solid ${aspectRatio === value ? 'var(--accent)' : 'var(--border)'}`,
                    background: aspectRatio === value ? 'var(--accent-soft)' : 'var(--surface-2)',
                    color: aspectRatio === value ? 'var(--accent)' : 'var(--text-dim)',
                    fontWeight: 800,
                    fontSize: 12,
                    whiteSpace: 'nowrap',
                    transition: 'border-color .15s, background .15s, color .15s',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-faint)', fontWeight: 600 }}>
              {aspectRatio === 'auto'
                ? 'The player resizes to match each video\'s native aspect ratio.'
                : `Forces a ${aspectRatio} frame. Other ratios will letterbox or pillarbox.`}
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 14, borderTop: '1px solid var(--border-soft)', marginTop: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Video stats overlay</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-dim)', fontWeight: 600, marginTop: 2 }}>
                  Show codec, resolution, buffer, and stream info on the player.
                </div>
              </div>
              <Toggle on={showStats} onToggle={() => onSetShowStats(!showStats)} />
            </div>

            {sidebarWidth !== undefined && onSetSidebarWidth && (
              <div style={{ paddingTop: 14, borderTop: '1px solid var(--border-soft)', marginTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Sidebar width</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="number"
                      min={220}
                      max={560}
                      value={sidebarWidth}
                      onChange={(e) => onSetSidebarWidth(parseInt(e.target.value, 10))}
                      style={{ ...inputStyle, width: 72, flex: 'none', padding: '6px 10px', textAlign: 'center' }}
                    />
                    <span style={{ fontSize: 12.5, color: 'var(--text-faint)', fontWeight: 600 }}>px</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={220}
                  max={560}
                  value={sidebarWidth}
                  onChange={(e) => onSetSidebarWidth(parseInt(e.target.value, 10))}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-faint)', fontWeight: 600, marginTop: 2 }}>
                  <span>220</span><span>560</span>
                </div>
              </div>
            )}
          </section>

          {/* Host-only room settings */}
          {isHost && (
            <section>
              <p style={sectionHead}><Icon name="lock" size={13} /> Room</p>
              <SettingRow
                label="Hidden room"
                description="Remove this room from the public browser — invite friends via PIN only."
                on={room.hidden}
                onToggle={() => onUpdateSettings({ hidden: !room.hidden })}
              />
              <SettingRow
                label="Viewers can manage queue"
                description="Let viewers add videos and rearrange the queue."
                on={room.viewerCanManageQueue}
                onToggle={() => onUpdateSettings({ viewerCanManageQueue: !room.viewerCanManageQueue })}
              />
              <SettingRow
                label="Viewers can control playback"
                description="Let viewers play, pause, and seek the current video."
                on={room.viewerCanControl}
                onToggle={() => onUpdateSettings({ viewerCanControl: !room.viewerCanControl })}
              />
              <div style={{ paddingTop: 16 }}>
                <label style={labelCap}>Idle screen embed URL</label>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-faint)', fontWeight: 600 }}>
                  Shown when no video is queued. Leave blank to show "No video selected".
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    style={inputStyle}
                    value={idleGameUrl}
                    placeholder="https://…"
                    onChange={(e) => { setIdleGameUrl(e.target.value); setIdleGameSaved(false); }}
                    onKeyDown={(e) => e.key === 'Enter' && saveIdleGameUrl()}
                  />
                  <button
                    onClick={saveIdleGameUrl}
                    style={{
                      padding: '10px 16px', borderRadius: 10, border: 'none',
                      background: idleGameSaved ? 'var(--online)' : 'var(--accent)',
                      color: 'var(--accent-ink)', fontWeight: 800, fontSize: 13,
                      transition: 'background .2s', whiteSpace: 'nowrap',
                    }}
                  >
                    {idleGameSaved ? 'Saved!' : 'Save'}
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
