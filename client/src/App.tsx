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
  const [discordJoining, setDiscordJoining] = useState(discordContext !== null);
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('tg-theme') as 'dark' | 'light') || 'dark',
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('tg-theme', theme);
  }, [theme]);

  // Discord: skip Landing entirely, auto-join the room tied to this Activity instance.
  // instanceId is shared across all users in the same voice channel Activity session,
  // so the first person creates the room and everyone else joins it automatically.
  useEffect(() => {
    if (!discordContext) return;

    const socket = getSocket();

    const onJoined = ({ room: joinedRoom, isHost: joinedAsHost }: { room: RoomType; isHost: boolean }) => {
      socket.off('room:error', onError);
      setRoom(joinedRoom);
      setIsHost(joinedAsHost);
      setMemberId(socket.id ?? '');
      setDiscordJoining(false);
      const username = joinedRoom.members.find((m) => m.id === socket.id)?.username ?? '';
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ pin: joinedRoom.pin, username }));
    };

    const onError = ({ message }: { message: string }) => {
      socket.off('room:joined', onJoined);
      setDiscordJoining(false);
      console.error('[Discord] Failed to join room:', message);
    };

    socket.once('room:joined', onJoined);
    socket.once('room:error', onError);
    socket.emit('room:join_or_create', { pin: discordContext.instanceId, username: discordContext.username });

    return () => {
      socket.off('room:joined', onJoined);
      socket.off('room:error', onError);
    };
  }, [discordContext]);

  // Reconnect: re-join after a dropped connection.
  useEffect(() => {
    const socket = getSocket();

    const handleReconnect = () => {
      if (discordContext) {
        socket.once('room:joined', ({ room: joinedRoom, isHost: joinedAsHost }) => {
          setRoom(joinedRoom);
          setIsHost(joinedAsHost);
          setMemberId(socket.id ?? '');
        });
        socket.emit('room:join_or_create', { pin: discordContext.instanceId, username: discordContext.username });
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

  if (discordJoining) {
    return (
      <div style={{
        height: '100vh', display: 'grid', placeItems: 'center',
        color: 'var(--text-dim)', fontWeight: 600, fontSize: 15,
      }}>
        Joining room…
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
