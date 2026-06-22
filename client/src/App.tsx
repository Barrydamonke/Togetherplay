import { useState, useEffect } from 'react';
import { Room as RoomType } from './types';
import { Landing } from './components/Landing';
import { Room } from './components/Room';
import { getSocket, disconnectSocket } from './lib/socket';
import { DiscordContext } from './lib/discord';

const SESSION_KEY = 'tg-session';

interface Props {
  discordContext: DiscordContext | null;
}

export default function App({ discordContext }: Props) {
  const [room, setRoom] = useState<RoomType | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [memberId, setMemberId] = useState('');
  const [discordUsername, setDiscordUsername] = useState(discordContext?.username ?? '');
  const [discordJoining, setDiscordJoining] = useState(false);
  const [discordError, setDiscordError] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('tg-theme') as 'dark' | 'light') || 'dark',
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('tg-theme', theme);
  }, [theme]);

  // Reconnect: re-join after a dropped connection.
  useEffect(() => {
    const socket = getSocket();

    const handleReconnect = () => {
      // Drop any pending listeners from a previous reconnect attempt that never completed.
      socket.off('room:joined');
      socket.off('room:error');

      if (discordContext) {
        const stored = sessionStorage.getItem(SESSION_KEY);
        const username = stored
          ? (JSON.parse(stored) as { pin: string; username: string }).username
          : discordContext.username;
        socket.once('room:joined', ({ room: joinedRoom, isHost: joinedAsHost }) => {
          setRoom(joinedRoom);
          setIsHost(joinedAsHost);
          setMemberId(socket.id ?? '');
        });
        socket.emit('room:join_or_create', { pin: discordContext.instanceId, username, avatar: discordContext.avatar });
        return;
      }

      const stored = sessionStorage.getItem(SESSION_KEY);
      if (!stored) return;
      const { pin, username } = JSON.parse(stored) as { pin: string; username: string };

      socket.once('room:joined', ({ room: joinedRoom, isHost: joinedAsHost }) => {
        setRoom(joinedRoom);
        setIsHost(joinedAsHost);
        setMemberId(socket.id ?? '');
      });

      socket.once('room:error', () => {
        sessionStorage.removeItem(SESSION_KEY);
      });

      socket.emit('room:join', { pin, username });
    };

    socket.on('reconnect', handleReconnect);
    return () => { socket.off('reconnect', handleReconnect); };
  }, [discordContext]);

  function handleDiscordJoin() {
    if (!discordContext) return;
    const trimmed = discordUsername.trim();
    if (!trimmed) { setDiscordError('Enter a name to continue.'); return; }
    setDiscordJoining(true);
    setDiscordError('');
    const socket = getSocket();
    socket.once('room:joined', ({ room: joinedRoom, isHost: joinedAsHost }: { room: RoomType; isHost: boolean }) => {
      setRoom(joinedRoom);
      setIsHost(joinedAsHost);
      setMemberId(socket.id ?? '');
      setDiscordJoining(false);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ pin: joinedRoom.pin, username: trimmed }));
    });
    socket.once('room:error', ({ message }: { message: string }) => {
      setDiscordJoining(false);
      setDiscordError(message);
    });
    socket.emit('room:join_or_create', { pin: discordContext.instanceId, username: trimmed, avatar: discordContext.avatar });
  }

  function handleJoined(joinedRoom: RoomType, joinedAsHost: boolean, id: string) {
    setRoom(joinedRoom);
    setIsHost(joinedAsHost);
    setMemberId(id);
    const username = joinedRoom.members.find((m) => m.id === id)?.username ?? '';
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ pin: joinedRoom.pin, username }));
  }

  function handleLeave() {
    sessionStorage.removeItem(SESSION_KEY);
    disconnectSocket();
    setRoom(null);
    setIsHost(false);
    setMemberId('');
  }

  function toggleTheme() {
    setTheme((p) => (p === 'dark' ? 'light' : 'dark'));
  }

  if (discordContext && !room) {
    return (
      <div style={{ height: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
        <div style={{
          width: '100%', maxWidth: 380,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-xl)', padding: 30, boxShadow: 'var(--shadow)',
        }}>
          <h2 className="font-display" style={{ fontSize: 22, fontWeight: 600, margin: '0 0 6px', color: 'var(--text)' }}>
            What should we call you?
          </h2>
          <p style={{ margin: '0 0 20px', fontSize: 13.5, color: 'var(--text-dim)', fontWeight: 600 }}>
            You can change it from your Discord username if you like.
          </p>
          <input
            style={{
              width: '100%', padding: '13px 15px', borderRadius: 'var(--r-md)',
              border: '1.5px solid var(--border)', background: 'var(--surface-2)',
              color: 'var(--text)', fontSize: 15, fontWeight: 600, outline: 'none',
              boxSizing: 'border-box',
            }}
            value={discordUsername}
            maxLength={32}
            autoFocus
            onChange={(e) => setDiscordUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleDiscordJoin()}
          />
          {discordError && (
            <div style={{
              fontSize: 13.5, color: 'var(--accent)', fontWeight: 700,
              background: 'var(--accent-soft)', padding: '9px 13px',
              borderRadius: 'var(--r-sm)', marginTop: 12,
            }}>
              {discordError}
            </div>
          )}
          <button
            onClick={handleDiscordJoin}
            disabled={discordJoining}
            style={{
              marginTop: 16, width: '100%', padding: '13px 22px',
              borderRadius: 'var(--r-md)', border: 'none',
              background: 'var(--accent)', color: 'var(--accent-ink)',
              fontWeight: 800, fontSize: 15,
              boxShadow: '0 10px 24px -10px var(--accent)',
              opacity: discordJoining ? 0.6 : 1,
              cursor: discordJoining ? 'default' : 'pointer',
            }}
          >
            {discordJoining ? 'Joining…' : 'Join session'}
          </button>
        </div>
      </div>
    );
  }

  if (!room) {
    return <Landing theme={theme} onToggleTheme={toggleTheme} onJoined={handleJoined} />;
  }

  return (
    <Room
      initialRoom={room}
      isHost={isHost}
      memberId={memberId}
      theme={theme}
      onToggleTheme={toggleTheme}
      onLeave={discordContext ? undefined : handleLeave}
    />
  );
}
