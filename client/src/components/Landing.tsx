import { useState, useEffect, useRef } from 'react';
import { getSocket } from '../lib/socket';
import { Room } from '../types';
import { Icon } from './Icon';
import { AdminPanel } from './AdminPanel';

interface Props {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onJoined: (room: Room, isHost: boolean, memberId: string) => void;
}

// Decorative poster configs for the floating background cards
const POSTERS = [
  { title: 'Autumn in Maple Hollow', g: ['#e8a14b', '#b5552e'], x: '7%',  y: '16%', w: 132, rot: -9, delay: '0s'   },
  { title: 'Midnight Diner Tales',   g: ['#5e6fb5', '#27305e'], x: '15%', y: '52%', w: 116, rot:  7, delay: '.6s'  },
  { title: 'The Last Bookshop',      g: ['#6fae8e', '#2f5e4c'], x: '80%', y: '13%', w: 124, rot:  8, delay: '.3s'  },
  { title: 'Snowfall on Cedar St.',  g: ['#7fa6cf', '#3a5b80'], x: '84%', y: '54%', w: 138, rot: -7, delay: '.9s'  },
];

const FALLBACK_TAGLINES = [
  'No accounts · no downloads · just press play',
  'Pause for snacks — everyone waits for you',
  'Laugh at the same joke, at the same second',
];

const SOCIAL_COLORS = ['#6fae8e', '#5e6fb5', '#d98b9e'];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let k = a.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [a[k], a[j]] = [a[j], a[k]];
  }
  return a;
}

const ENTRY_TRANSFORMS: Record<string, string> = {
  left:   'translateX(-115vw)',
  right:  'translateX(115vw)',
  top:    'translateY(-115vh)',
  bottom: 'translateY(115vh)',
};

interface SlidingPoster {
  key: string;
  itemId: string;
  name: string;
  x: string;
  y: string;
  w: number;
  rot: number;
  dir: string;
  visible: boolean;
}

function PosterCard({ itemId, name, bg }: { itemId?: string; name: string; bg: string }) {
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 16, overflow: 'hidden', position: 'relative', background: bg }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 80% at 80% 0%, rgba(255,255,255,.22), transparent 55%)' }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '8%' }}>
        <div className="font-display" style={{ fontWeight: 600, color: '#fff', lineHeight: 1.05, fontSize: 'clamp(9px,18%,15px)', textShadow: '0 1px 6px rgba(0,0,0,.4)' }}>
          {name}
        </div>
      </div>
      {itemId && (
        <img
          src={`/api/jellyfin/thumbnail/${itemId}`}
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      )}
    </div>
  );
}

function FloatingPosters({ taglineCount }: { taglineCount: number }) {
  const [items, setItems] = useState<Array<{ Id: string; Name: string }>>([]);
  const [extras, setExtras] = useState<SlidingPoster[]>([]);
  const deckRef = useRef<Array<{ Id: string; Name: string }>>([]);

  useEffect(() => {
    deckRef.current = shuffle([...items]);
  }, [items]);

  useEffect(() => {
    fetch('/api/jellyfin/random-posters')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { Items: Array<{ Id: string; Name: string }> }) => {
        if (Array.isArray(data.Items)) setItems(data.Items);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (taglineCount === 0 || items.length === 0) return;
    if (deckRef.current.length === 0) deckRef.current = shuffle([...items]);
    const item = deckRef.current.pop()!;
    const dirs = ['left', 'right', 'top', 'bottom'];
    const dir = dirs[Math.floor(Math.random() * dirs.length)];
    const key = `slide-${taglineCount}`;

    const next: SlidingPoster = {
      key,
      itemId: item.Id,
      name: item.Name,
      x: `${4 + Math.random() * 84}%`,
      y: `${4 + Math.random() * 72}%`,
      w: 108 + Math.floor(Math.random() * 44),
      rot: (Math.random() - 0.5) * 20,
      dir,
      visible: false,
    };

    setExtras((prev) => [...prev.slice(-11), next]);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setExtras((prev) => prev.map((p) => (p.key === key ? { ...p, visible: true } : p)));
      });
    });
  }, [taglineCount]);

  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {/* Fixed background posters */}
      {POSTERS.map((p, i) => {
        const item = items[i];
        return (
          <div
            key={i}
            className="animate-float-up"
            style={{
              position: 'absolute', left: p.x, top: p.y, width: p.w,
              aspectRatio: '2/3', transform: `rotate(${p.rot}deg)`,
              opacity: 0.9, filter: 'drop-shadow(0 24px 40px rgba(0,0,0,.32))',
              animationDelay: p.delay,
            }}
          >
            <PosterCard itemId={item?.Id} name={item?.Name ?? p.title} bg={`linear-gradient(150deg, ${p.g[0]}, ${p.g[1]})`} />
          </div>
        );
      })}

      {/* Sliding-in posters triggered by tagline cycles */}
      {extras.map((p) => (
        <div
          key={p.key}
          style={{
            position: 'absolute', left: p.x, top: p.y, width: p.w,
            aspectRatio: '2/3',
            opacity: p.visible ? 0.82 : 0,
            transform: `rotate(${p.rot}deg)${p.visible ? '' : ` ${ENTRY_TRANSFORMS[p.dir]}`}`,
            transition: 'transform 1.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 1s ease',
            filter: 'drop-shadow(0 24px 40px rgba(0,0,0,.32))',
          }}
        >
          <PosterCard itemId={p.itemId} name={p.name} bg="linear-gradient(150deg, #4a4540, #2a211c)" />
        </div>
      ))}
    </div>
  );
}

function RotatingBadge({ onCycle }: { onCycle?: () => void }) {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [messages, setMessages] = useState<string[]>(FALLBACK_TAGLINES);
  const [idx, setIdx] = useState(0);
  const [show, setShow] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/taglines.json')
      .then((r) => r.json())
      .then((d: { taglines: string[] }) => {
        if (alive && Array.isArray(d.taglines) && d.taglines.length) {
          setMessages(shuffle(d.taglines));
          setIdx(0);
        }
      })
      .catch(() => { if (alive) setMessages((m) => shuffle(m)); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (reduced || messages.length < 2) return;
    const id = setInterval(() => {
      setShow(false);
      setTimeout(() => {
        setIdx((v) => (v + 1) % messages.length);
        setShow(true);
        onCycle?.();
      }, 320);
    }, 3600);
    return () => clearInterval(id);
  }, [reduced, messages, onCycle]);

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      padding: '6px 14px', borderRadius: 99,
      background: 'var(--accent-soft)', color: 'var(--accent)',
      fontWeight: 800, fontSize: 12.5, letterSpacing: '.02em',
      marginBottom: 22, minHeight: 27,
    }}>
      <Icon name="sparkle" size={14} style={{ flexShrink: 0 }} />
      <span style={{
        opacity: show ? 1 : 0,
        transform: show ? 'none' : 'translateY(-4px)',
        transition: 'opacity .3s ease, transform .3s ease',
        whiteSpace: 'nowrap',
      }}>
        {messages[idx]}
      </span>
    </div>
  );
}

function WatchingNow() {
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    const socket = getSocket();
    const handler = ({ memberNames }: { membersOnline: number; memberNames: string[] }) =>
      setNames(memberNames);
    socket.on('server:stats', handler);
    return () => { socket.off('server:stats', handler); };
  }, []);

  if (names.length === 0) return null;

  const shown = names.slice(0, 3);
  const label = names.length === 1 ? '1 person' : `${names.length} friends`;

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 10,
      padding: '7px 14px 7px 8px', borderRadius: 99,
      background: 'var(--surface)', border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex' }}>
        {shown.map((name, i) => (
          <span key={i} title={name} style={{
            width: 26, height: 26, borderRadius: '50%',
            background: SOCIAL_COLORS[i % SOCIAL_COLORS.length], color: '#fff',
            display: 'grid', placeItems: 'center',
            fontWeight: 800, fontSize: 11,
            border: '2px solid var(--surface)',
            marginLeft: i ? -9 : 0,
          }}>{name[0].toUpperCase()}</span>
        ))}
      </div>
      <span style={{ fontSize: 13, color: 'var(--text-dim)', fontWeight: 600, whiteSpace: 'nowrap' }}>
        <strong style={{ color: 'var(--text)' }}>{label}</strong> watching right now
      </span>
    </div>
  );
}

function PinInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  function setDigit(i: number, d: string) {
    const arr = value.split('');
    arr[i] = d;
    const next = arr.join('').slice(0, 4);
    onChange(next);
    if (d && i < 3) refs.current[i + 1]?.focus();
  }

  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
      {[0, 1, 2, 3].map((i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          value={value[i] || ''}
          inputMode="numeric"
          maxLength={1}
          onChange={(e) => setDigit(i, e.target.value.replace(/\D/g, '').slice(-1))}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus();
          }}
          style={{
            width: 58, height: 66, textAlign: 'center',
            fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600,
            borderRadius: 'var(--r-md)',
            border: `1.5px solid ${value[i] ? 'var(--accent)' : 'var(--border)'}`,
            background: 'var(--surface-2)', color: 'var(--text)', outline: 'none',
          }}
        />
      ))}
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  padding: '13px 22px', borderRadius: 'var(--r-md)', border: 'none',
  background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 800, fontSize: 15,
  boxShadow: '0 10px 24px -10px var(--accent)', whiteSpace: 'nowrap',
  display: 'inline-flex', alignItems: 'center', gap: 8,
};
const btnSoft: React.CSSProperties = {
  padding: '13px 22px', borderRadius: 'var(--r-md)',
  border: '1.5px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text)', fontWeight: 800, fontSize: 15,
  whiteSpace: 'nowrap',
  display: 'inline-flex', alignItems: 'center', gap: 8,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '13px 15px', borderRadius: 'var(--r-md)',
  border: '1.5px solid var(--border)', background: 'var(--surface-2)',
  color: 'var(--text)', fontSize: 15, fontWeight: 600, outline: 'none',
};

export function Landing({ theme, onToggleTheme, onJoined }: Props) {
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [taglineCount, setTaglineCount] = useState(0);

  function submit() {
    const trimmed = username.trim();
    if (!trimmed) { setError('Tell us your name first 🙂'); return; }
    if (mode === 'join' && pin.length !== 4) { setError('That PIN needs all 4 digits.'); return; }

    setLoading(true);
    setError('');

    const socket = getSocket();
    const cleanup = () => { socket.off('room:joined'); socket.off('room:error'); };

    socket.once('room:joined', ({ room, isHost }: { room: Room; isHost: boolean }) => {
      cleanup();
      setLoading(false);
      onJoined(room, isHost, socket.id ?? '');
    });

    socket.once('room:error', ({ message }: { message: string }) => {
      cleanup();
      setLoading(false);
      setError(message);
    });

    if (mode === 'create') {
      socket.emit('room:create', { username: trimmed });
    } else {
      socket.emit('room:join', { pin, username: trimmed });
    }
  }

  return (
    <div style={{ position: 'relative', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <FloatingPosters taglineCount={taglineCount} />

      <header style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '22px 28px' }}>
        {/* Wordmark */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
          <span style={{
            width: 28, height: 28, borderRadius: '32% 32% 38% 38%',
            background: 'linear-gradient(150deg, var(--accent), color-mix(in oklab, var(--accent) 60%, #7d3552))',
            display: 'grid', placeItems: 'center', color: 'var(--accent-ink)', flexShrink: 0,
            boxShadow: '0 6px 16px -6px var(--accent)',
          }}>
            <Icon name="play" size={14} />
          </span>
          <span className="font-display" style={{ fontWeight: 600, fontSize: 20, letterSpacing: '-.01em', color: 'var(--text)' }}>
            Togetherness
          </span>
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Admin */}
          <button onClick={() => setShowAdmin(true)} title="Admin panel" style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 13px',
            borderRadius: 99, border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text-faint)', fontWeight: 700, fontSize: 13,
          }}>
            <Icon name="lock" size={14} /> Admin
          </button>

          {/* Theme toggle */}
          <button onClick={onToggleTheme} title="Toggle light / dark" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px',
            borderRadius: 99, border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text-dim)', fontWeight: 700, fontSize: 13, boxShadow: 'var(--shadow)',
          }}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>

      <main style={{ position: 'relative', flex: 1, display: 'grid', placeItems: 'center', padding: '12px 20px 56px' }}>
        {mode === 'choose' ? (
          <div className="animate-float-up" style={{ textAlign: 'center', maxWidth: 540 }}>
            <RotatingBadge onCycle={() => setTaglineCount((c) => c + 1)} />
            <h1 className="font-display" style={{
              fontSize: 'clamp(40px, 6vw, 62px)', fontWeight: 600,
              lineHeight: 1.02, letterSpacing: '-.02em', margin: '0 0 16px',
              color: 'var(--text)',
            }}>
              Movie night,<br />
              <span style={{ color: 'var(--accent)' }}>together</span> from anywhere.
            </h1>
            <p style={{ fontSize: 18, color: 'var(--text-dim)', lineHeight: 1.5, margin: '0 auto 30px', maxWidth: 420, fontWeight: 500 }}>
              Spin up a room, share the PIN, and everything stays perfectly in sync — pause, laugh, and chat like you're on the same couch.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
              <button onClick={() => setMode('create')} style={btnPrimary}>
                <Icon name="plus" size={18} /> Create a room
              </button>
              <button onClick={() => setMode('join')} style={btnSoft}>
                <Icon name="door" size={18} /> Join with a PIN
              </button>
            </div>
            <WatchingNow />
          </div>
        ) : (
          <div className="animate-pop-in" style={{
            width: '100%', maxWidth: 420,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-xl)', padding: 30, boxShadow: 'var(--shadow)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <span style={{
                width: 42, height: 42, borderRadius: 'var(--r-md)',
                background: 'var(--accent-soft)', color: 'var(--accent)',
                display: 'grid', placeItems: 'center', flexShrink: 0,
              }}>
                <Icon name={mode === 'create' ? 'plus' : 'door'} size={22} />
              </span>
              <div>
                <h2 className="font-display" style={{ fontSize: 24, fontWeight: 600, margin: 0, color: 'var(--text)' }}>
                  {mode === 'create' ? 'Create a room' : 'Join a room'}
                </h2>
                <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-dim)', fontWeight: 600 }}>
                  {mode === 'create' ? "You'll be the host." : 'Ask the host for the 4-digit PIN.'}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 22 }}>
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 7 }}>
                  Your name
                </span>
                <input
                  style={inputStyle}
                  placeholder="e.g. Sam"
                  value={username}
                  maxLength={32}
                  autoFocus
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                />
              </label>

              {mode === 'join' && (
                <label style={{ display: 'block' }}>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 7 }}>
                    Room PIN
                  </span>
                  <PinInput value={pin} onChange={setPin} />
                </label>
              )}

              {error && (
                <div style={{ fontSize: 13.5, color: 'var(--accent)', fontWeight: 700, background: 'var(--accent-soft)', padding: '9px 13px', borderRadius: 'var(--r-sm)' }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
                <button onClick={() => { setMode('choose'); setError(''); }} style={{ ...btnSoft, padding: '13px 18px' }}>
                  Back
                </button>
                <button
                  onClick={submit}
                  disabled={loading}
                  style={{ ...btnPrimary, flex: 1, justifyContent: 'center', opacity: loading ? 0.6 : 1 }}
                >
                  {loading ? 'Connecting…' : mode === 'create' ? 'Create room' : 'Join room'}
                  {!loading && <Icon name="chevron" size={17} />}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer style={{ position: 'relative', textAlign: 'center', padding: '0 20px 22px', color: 'var(--text-faint)', fontSize: 13, fontWeight: 600 }}>
        Plays anything from your own server · everyone stays in sync to the millisecond
      </footer>

      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
    </div>
  );
}
