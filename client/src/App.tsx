import { useState, useEffect } from 'react';
import { Room as RoomType } from './types';
import { Landing } from './components/Landing';
import { Room } from './components/Room';
import { getSocket, disconnectSocket } from './lib/socket';

const SESSION_KEY = 'tg-session';

export default function App() {
  const [room, setRoom] = useState<RoomType | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [memberId, setMemberId] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('tg-theme') as 'dark' | 'light') || 'dark',
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('tg-theme', theme);
  }, [theme]);

  // Attempt to auto-rejoin after a socket reconnect (dropped connection, mobile network switch, etc.)
  useEffect(() => {
    const socket = getSocket();

    const handleReconnect = () => {
      const stored = sessionStorage.getItem(SESSION_KEY);
      if (!stored) return;
      const { pin, username } = JSON.parse(stored) as { pin: string; username: string };

      socket.once('room:joined', ({ room: joinedRoom, isHost: joinedAsHost }) => {
        setRoom(joinedRoom);
        setIsHost(joinedAsHost);
        setMemberId(socket.id ?? '');
      });

      socket.once('room:error', () => {
        // Room expired during the grace period — clear stale session.
        sessionStorage.removeItem(SESSION_KEY);
      });

      socket.emit('room:join', { pin, username });
    };

    socket.on('reconnect', handleReconnect);
    return () => { socket.off('reconnect', handleReconnect); };
  }, []);

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
      onLeave={handleLeave}
    />
  );
}
