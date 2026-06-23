import { useState, useEffect, useRef } from 'react';
import { getSocket } from '../lib/socket';
import { Room } from '../types';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { AdminPanel } from './AdminPanel';
import { ReleaseNotes } from './ReleaseNotes';
import { useIsMobile } from '../lib/useIsMobile';
import { useToasts, ToastContainer } from './Toast';
import { useRateLimit } from '../lib/useRateLimit';

const APP_VERSION = '1.4.9';

interface Props {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onJoined: (room: Room, isHost: boolean, memberId: string) => void;
}

// Decorative poster configs for the floating background cards
const POSTERS = [
  { title: 'Autumn with a Gay Man', g: ['#e8a14b', '#b5552e'], x: '7%',  y: '16%', w: 132, rot: -9, delay: '0s'   },
  { title: 'My experience with Jeremy',   g: ['#5e6fb5', '#27305e'], x: '15%', y: '52%', w: 116, rot:  7, delay: '.6s'  },
  { title: 'Five nights at Jeremys',      g: ['#6fae8e', '#2f5e4c'], x: '80%', y: '13%', w: 124, rot:  8, delay: '.3s'  },
  { title: 'Gloinks: the movie',  g: ['#7fa6cf', '#3a5b80'], x: '84%', y: '54%', w: 138, rot: -7, delay: '.9s'  },
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

function LandingMessage() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch('/api/landing-message')
        .then((r) => r.json())
        .then((d: { message: string }) => { if (alive) setMessage(d.message ?? ''); })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  if (!message) return null;

  return (
    <footer style={{ position: 'relative', textAlign: 'center', padding: '0 20px 28px' }}>
      <div style={{
        display: 'inline-block', maxWidth: 640,
        padding: '14px 24px', borderRadius: 14,
        background: 'var(--surface)', border: '1px solid var(--border)',
        boxShadow: 'var(--shadow)',
        fontSize: 15, fontWeight: 600, color: 'var(--text-dim)',
        lineHeight: 1.6, whiteSpace: 'pre-wrap', textAlign: 'left',
      }}>
        {message}
      </div>
    </footer>
  );
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

function FloatingPosters({ taglineCount, maxExtras, isMobile }: { taglineCount: number; maxExtras: number; isMobile: boolean }) {
  const [items, setItems] = useState<Array<{ Id: string; Name: string }>>([]);
  const [extras, setExtras] = useState<SlidingPoster[]>([]);
  const deckRef = useRef<Array<{ Id: string; Name: string }>>([]);
  const maxExtrasRef = useRef(maxExtras);
  const extrasRef = useRef<SlidingPoster[]>([]);
  useEffect(() => { maxExtrasRef.current = maxExtras; }, [maxExtras]);
  useEffect(() => { extrasRef.current = extras; }, [extras]);

  // Build the sliding-extras deck, excluding the items already pinned to the 4 fixed slots.
  useEffect(() => {
    const fixedIds = new Set(items.slice(0, POSTERS.length).map((i) => i.Id));
    const pool = items.filter((i) => !fixedIds.has(i.Id));
    deckRef.current = shuffle(pool.length >= 4 ? pool : [...items]);
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

    // Rebuild deck when exhausted, still excluding fixed-slot IDs.
    if (deckRef.current.length === 0) {
      const fixedIds = new Set(items.slice(0, POSTERS.length).map((i) => i.Id));
      const pool = items.filter((i) => !fixedIds.has(i.Id));
      deckRef.current = shuffle(pool.length >= 4 ? pool : [...items]);
    }

    // Pick the first deck entry whose ID isn't already visible in extras.
    const visibleIds = new Set(extrasRef.current.map((e) => e.itemId));
    const pickIdx = deckRef.current.findIndex((i) => !visibleIds.has(i.Id));
    const item = pickIdx !== -1
      ? deckRef.current.splice(pickIdx, 1)[0]
      : deckRef.current.pop()!;

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

    setExtras((prev) => {
      if (prev.length >= maxExtrasRef.current) return prev;
      return [...prev.slice(-(maxExtrasRef.current - 1)), next];
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setExtras((prev) => prev.map((p) => (p.key === key ? { ...p, visible: true } : p)));
      });
    });
  }, [taglineCount]);

  // When maxExtras drops, drain the oldest poster every 400ms until we're within the limit.
  useEffect(() => {
    if (extras.length <= maxExtras) return;
    const timer = setTimeout(() => {
      setExtras((prev) => prev.slice(1));
    }, 400);
    return () => clearTimeout(timer);
  }, [extras.length, maxExtras]);

  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {/* Fixed background posters — hidden on mobile to avoid obscuring content */}
      {!isMobile && POSTERS.map((p, i) => {
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

function PinInput({ value, onChange, compact }: { value: string; onChange: (v: string) => void; compact?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  function setDigit(i: number, d: string) {
    const arr = value.split('');
    arr[i] = d;
    const next = arr.join('').slice(0, 4);
    onChange(next);
    if (d && i < 3) refs.current[i + 1]?.focus();
  }

  return (
    <div style={{ display: 'flex', gap: compact ? 7 : 10, justifyContent: 'center' }}>
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
            width: compact ? 48 : 58, height: compact ? 56 : 66, textAlign: 'center',
            fontFamily: 'var(--font-display)', fontSize: compact ? 24 : 28, fontWeight: 600,
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
  const [mode, setMode] = useState<'choose' | 'rooms' | 'create' | 'visibility' | 'join'>('choose');
  const [username, setUsername] = useState(() => localStorage.getItem('tg-username') ?? '');
  const [pin, setPin] = useState('');
  const [pinRequired, setPinRequired] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const [taglineCount, setTaglineCount] = useState(0);
  const [jellyfinStatus, setJellyfinStatus] = useState<'ok' | 'unreachable' | 'not_configured' | null>(null);
  const [posterUnlocked, setPosterUnlocked] = useState(false);
  const [availableRooms, setAvailableRooms] = useState<Array<{ pin: string; memberCount: number; memberNames: string[] }>>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const isMobile = useIsMobile();
  const { toasts, addToast } = useToasts();
  const { rateLimited, check: checkRateLimit } = useRateLimit(() =>
    addToast('chill out bro, go touch some grass before doing that again'),
  );

  useEffect(() => {
    console.log(`Togetherplay v${APP_VERSION}`);
  }, []);

  useEffect(() => {
    fetch('/api/jellyfin/health')
      .then((r) => r.json())
      .then((data: { ok: boolean; reason?: string }) => {
        if (data.ok) setJellyfinStatus('ok');
        else setJellyfinStatus(data.reason === 'not_configured' ? 'not_configured' : 'unreachable');
      })
      .catch(() => setJellyfinStatus('unreachable'));
  }, []);

  // Fetch and auto-refresh the room list while the rooms browser is open.
  useEffect(() => {
    if (mode !== 'rooms') return;
    let alive = true;
    const load = () => {
      setLoadingRooms(true);
      fetch('/api/rooms')
        .then((r) => r.json())
        .then((data: { rooms: Array<{ pin: string; memberCount: number; memberNames: string[] }> }) => {
          if (alive) { setAvailableRooms(data.rooms); setLoadingRooms(false); }
        })
        .catch(() => { if (alive) setLoadingRooms(false); });
    };
    load();
    const interval = setInterval(load, 5000);
    return () => { alive = false; clearInterval(interval); };
  }, [mode]);

  function selectRoom(room: { pin: string }) {
    // All listed rooms are public — PIN is known, user just needs to enter their name.
    setPin(room.pin);
    setPinRequired(false);
    setError('');
    setMode('join');
  }

  function goToVisibility() {
    const trimmed = username.trim();
    if (!trimmed) { setError('Tell us your name first 🙂'); return; }
    setError('');
    setMode('visibility');
  }

  function submitCreate(hidden: boolean) {
    if (!checkRateLimit('roomCreate')) return;
    const trimmed = username.trim();
    if (!trimmed) return;
    localStorage.setItem('tg-username', trimmed);
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
    socket.emit('room:create', { username: trimmed, hidden });
  }

  function submit() {
    const trimmed = username.trim();
    if (!trimmed) { setError('Tell us your name first 🙂'); return; }
    if (pinRequired && pin.length !== 4) { setError('That PIN needs all 4 digits.'); return; }

    localStorage.setItem('tg-username', trimmed);
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

    socket.emit('room:join', { pin, username: trimmed });
  }

  return (
    <div style={{ position: 'relative', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <FloatingPosters taglineCount={taglineCount} maxExtras={isMobile ? 0 : (posterUnlocked ? 100 : 12)} isMobile={isMobile} />

      <header style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '22px 28px' }}>
        {/* Wordmark */}
        <Logo height={52} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Admin */}
          <button onClick={() => setShowAdmin(true)} title="Admin panel" style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: isMobile ? '8px' : '8px 13px',
            borderRadius: 99, border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text-faint)', fontWeight: 700, fontSize: 13,
          }}>
            <Icon name="lock" size={14} />
            {!isMobile && 'Admin'}
          </button>

          {/* Theme toggle */}
          <button onClick={onToggleTheme} title="Toggle light / dark" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: isMobile ? '8px' : '8px 14px',
            borderRadius: 99, border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text-dim)', fontWeight: 700, fontSize: 13, boxShadow: 'var(--shadow)',
          }}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
            {!isMobile && (theme === 'dark' ? 'Light' : 'Dark')}
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
              textShadow: '0 2px 18px rgba(0,0,0,.55), 0 1px 4px rgba(0,0,0,.35)',
            }}>
              Movie night,<br />
              <span style={{ color: 'var(--accent)' }}>together</span> from anywhere.
            </h1>
            <p style={{ fontSize: 18, color: 'var(--text-dim)', lineHeight: 1.5, margin: '0 auto 30px', maxWidth: 420, fontWeight: 500, textShadow: '0 1px 10px rgba(0,0,0,.5)' }}>
              Spin up a room, share the PIN, and everything stays perfectly in sync — pause, laugh, and chat like you're on the same couch.
            </p>

            {jellyfinStatus && jellyfinStatus !== 'ok' && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '7px 15px', borderRadius: 99, marginBottom: 20,
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                color: '#d97706',
                fontWeight: 700, fontSize: 13,
              }}>
                <Icon name="warning" size={15} />
                {jellyfinStatus === 'not_configured'
                  ? 'Jellyfin not configured'
                  : 'Jellyfin server unreachable'}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
              <button onClick={() => setMode('create')} style={btnPrimary}>
                <Icon name="plus" size={18} /> Create a room
              </button>
              <button onClick={() => setMode('rooms')} style={btnSoft}>
                <Icon name="door" size={18} /> Join a room
              </button>
            </div>
            <WatchingNow />
          </div>
        ) : mode === 'rooms' ? (
          /* ── Room browser ── */
          <div className="animate-pop-in" style={{
            width: '100%', maxWidth: 440,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-xl)', padding: 30, boxShadow: 'var(--shadow)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
              <span style={{
                width: 42, height: 42, borderRadius: 'var(--r-md)',
                background: 'var(--accent-soft)', color: 'var(--accent)',
                display: 'grid', placeItems: 'center', flexShrink: 0,
              }}>
                <Icon name="door" size={22} />
              </span>
              <div>
                <h2 className="font-display" style={{ fontSize: 24, fontWeight: 600, margin: 0, color: 'var(--text)' }}>
                  Join a room
                </h2>
                <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-dim)', fontWeight: 600 }}>
                  Pick one below, or enter a PIN manually.
                </p>
              </div>
            </div>

            {loadingRooms && availableRooms.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-faint)', fontWeight: 600, fontSize: 14 }}>
                Looking for rooms…
              </div>
            ) : availableRooms.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <p style={{ color: 'var(--text-faint)', fontWeight: 600, fontSize: 14, margin: '0 0 14px' }}>
                  No public rooms right now.
                </p>
                <button onClick={() => setMode('create')} style={{ ...btnPrimary, fontSize: 14 }}>
                  <Icon name="plus" size={16} /> Create one
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22, maxHeight: 320, overflowY: 'auto' }}>
                {availableRooms.map((room) => (
                  <button
                    key={room.pin}
                    onClick={() => selectRoom(room)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '12px 14px', borderRadius: 'var(--r-md)',
                      border: '1.5px solid var(--border)', background: 'var(--surface-2)',
                      textAlign: 'left', cursor: 'pointer', width: '100%',
                    }}
                  >
                    {/* Member avatars */}
                    <div style={{ display: 'flex', flexShrink: 0 }}>
                      {room.memberCount === 0 ? (
                        <span style={{
                          width: 32, height: 32, borderRadius: '50%',
                          background: 'var(--surface-3)', border: '1.5px dashed var(--border)',
                          display: 'grid', placeItems: 'center', color: 'var(--text-faint)',
                        }}>
                          <Icon name="users" size={14} />
                        </span>
                      ) : (
                        room.memberNames.slice(0, 3).map((name, i) => (
                          <span key={i} title={name} style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: SOCIAL_COLORS[i % SOCIAL_COLORS.length],
                            color: '#fff', display: 'grid', placeItems: 'center',
                            fontWeight: 800, fontSize: 12,
                            border: '2px solid var(--surface-2)',
                            marginLeft: i ? -10 : 0,
                          }}>
                            {name[0].toUpperCase()}
                          </span>
                        ))
                      )}
                    </div>

                    {/* Room info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                        {room.memberCount === 0
                          ? 'Empty room'
                          : room.memberCount === 1
                            ? `${room.memberNames[0]} is watching`
                            : `${room.memberNames.slice(0, 2).join(', ')}${room.memberCount > 2 ? ` +${room.memberCount - 2}` : ''}`}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--online)', marginTop: 2 }}>
                        Join without PIN
                      </div>
                    </div>

                    <Icon name="chevron" size={16} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            )}

            {/* PIN entry — always visible so hidden rooms can be joined */}
            <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 18, marginTop: availableRooms.length > 0 ? 4 : 18 }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-faint)', margin: '0 0 10px', textAlign: 'center' }}>
                {availableRooms.length > 0 ? 'Or enter a PIN manually' : 'Have a PIN? Enter it here'}
              </p>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <PinInput value={pin} onChange={setPin} compact={isMobile} />
                <button
                  onClick={() => { setPinRequired(true); setMode('join'); }}
                  disabled={pin.length !== 4}
                  style={{ ...btnPrimary, fontSize: 13, padding: isMobile ? '10px 12px' : '10px 16px', opacity: pin.length !== 4 ? 0.4 : 1, flexShrink: 0 }}
                >
                  Join
                </button>
              </div>
            </div>

            <button onClick={() => { setMode('choose'); setPin(''); }} style={{ ...btnSoft, width: '100%', justifyContent: 'center', marginTop: 14, fontSize: 14 }}>
              Back
            </button>
          </div>

        ) : mode === 'visibility' ? (
          /* ── Visibility picker ── */
          <div className="animate-pop-in" style={{
            width: '100%', maxWidth: 440,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-xl)', padding: 30, boxShadow: 'var(--shadow)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
              <span style={{
                width: 42, height: 42, borderRadius: 'var(--r-md)',
                background: 'var(--accent-soft)', color: 'var(--accent)',
                display: 'grid', placeItems: 'center', flexShrink: 0,
              }}>
                <Icon name="plus" size={22} />
              </span>
              <div>
                <h2 className="font-display" style={{ fontSize: 24, fontWeight: 600, margin: 0, color: 'var(--text)' }}>
                  Room visibility
                </h2>
                <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-dim)', fontWeight: 600 }}>
                  Who can find this room?
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
              <button
                onClick={() => submitCreate(false)}
                disabled={loading || rateLimited}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 18px',
                  borderRadius: 'var(--r-md)', border: '1.5px solid var(--border)',
                  background: 'var(--surface-2)', textAlign: 'left', cursor: 'pointer', width: '100%',
                  opacity: loading || rateLimited ? 0.6 : 1,
                }}
              >
                <span style={{
                  width: 38, height: 38, borderRadius: 'var(--r-sm)', flexShrink: 0, marginTop: 1,
                  background: 'var(--accent-soft)', color: 'var(--accent)',
                  display: 'grid', placeItems: 'center',
                }}>
                  <Icon name="users" size={18} />
                </span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 3 }}>
                    Public
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-dim)', fontWeight: 600, lineHeight: 1.4 }}>
                    Listed in the room browser. Anyone on this server can join with just their name.
                  </div>
                </div>
              </button>

              <button
                onClick={() => submitCreate(true)}
                disabled={loading || rateLimited}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 18px',
                  borderRadius: 'var(--r-md)', border: '1.5px solid var(--border)',
                  background: 'var(--surface-2)', textAlign: 'left', cursor: 'pointer', width: '100%',
                  opacity: loading || rateLimited ? 0.6 : 1,
                }}
              >
                <span style={{
                  width: 38, height: 38, borderRadius: 'var(--r-sm)', flexShrink: 0, marginTop: 1,
                  background: 'rgba(128,128,128,.12)', color: 'var(--text-dim)',
                  display: 'grid', placeItems: 'center',
                }}>
                  <Icon name="lock" size={18} />
                </span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 3 }}>
                    Hidden
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-dim)', fontWeight: 600, lineHeight: 1.4 }}>
                    Not listed anywhere. Share your 4-digit PIN to invite friends.
                  </div>
                </div>
              </button>
            </div>

            {error && (
              <div style={{ fontSize: 13.5, color: 'var(--accent)', fontWeight: 700, background: 'var(--accent-soft)', padding: '9px 13px', borderRadius: 'var(--r-sm)', marginBottom: 14 }}>
                {error}
              </div>
            )}

            <button onClick={() => { setMode('create'); setError(''); }} style={{ ...btnSoft, width: '100%', justifyContent: 'center', fontSize: 14 }}>
              Back
            </button>
          </div>

        ) : (
          /* ── Create / Join form ── */
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
                  {mode === 'create' ? "Pick a name, then choose visibility." : pinRequired ? 'Enter the 4-digit PIN.' : 'No PIN needed — just enter your name.'}
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
                  onKeyDown={(e) => e.key === 'Enter' && (mode === 'create' ? goToVisibility() : submit())}
                />
              </label>

              {mode === 'join' && pinRequired && (
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
                <button onClick={() => { setMode(mode === 'create' ? 'choose' : 'rooms'); setError(''); }} style={{ ...btnSoft, padding: '13px 18px' }}>
                  Back
                </button>
                <button
                  onClick={mode === 'create' ? goToVisibility : submit}
                  disabled={loading}
                  style={{ ...btnPrimary, flex: 1, justifyContent: 'center', opacity: loading ? 0.6 : 1 }}
                >
                  {loading ? 'Connecting…' : mode === 'create' ? 'Next' : 'Join room'}
                  {!loading && <Icon name="chevron" size={17} />}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <LandingMessage />

      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
      {showReleaseNotes && (
        <ReleaseNotes
          onClose={() => setShowReleaseNotes(false)}
          onOpenAdmin={() => { setShowReleaseNotes(false); setShowAdmin(true); }}
        />
      )}

      <button
        onClick={() => setShowReleaseNotes(true)}
        title="Release notes"
        style={{
          position: 'fixed', bottom: 14, left: 18,
          fontSize: 12, fontWeight: 800, color: 'var(--text-faint)',
          letterSpacing: '.04em', userSelect: 'none',
          background: 'var(--surface)', border: '1px solid var(--border)',
          padding: '5px 11px', borderRadius: 99,
          cursor: 'pointer', boxShadow: 'var(--shadow)',
        }}
      >
        v{APP_VERSION}
      </button>

      <button
        onClick={() => setPosterUnlocked((v) => !v)}
        title={posterUnlocked ? 'Limit to 12 posters' : 'Allow up to 100 posters'}
        style={{
          position: 'fixed', bottom: 10, right: 16,
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '5px 10px 5px 12px', borderRadius: 99,
          border: '1px solid var(--border)', background: 'var(--surface)',
          color: 'var(--text-faint)', fontWeight: 700, fontSize: 12,
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        Extra posters
        <span style={{
          position: 'relative', width: 32, height: 18, borderRadius: 99,
          background: posterUnlocked ? 'var(--accent)' : 'rgba(128,128,128,.3)',
          transition: 'background .2s',
          display: 'inline-block', flexShrink: 0,
        }}>
          <span style={{
            position: 'absolute', top: 3, left: posterUnlocked ? 17 : 3,
            width: 12, height: 12, borderRadius: '50%', background: '#fff',
            transition: 'left .2s',
            boxShadow: '0 1px 3px rgba(0,0,0,.3)',
          }} />
        </span>
      </button>

      <ToastContainer toasts={toasts} />
    </div>
  );
}
