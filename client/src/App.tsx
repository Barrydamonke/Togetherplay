import { useState, useEffect } from 'react';
import { Room as RoomType } from './types';
import { Landing } from './components/Landing';
import { Room } from './components/Room';
import { disconnectSocket } from './lib/socket';

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

  function toggleTheme() {
    setTheme((p) => (p === 'dark' ? 'light' : 'dark'));
  }

  function handleJoined(joinedRoom: RoomType, joinedAsHost: boolean, id: string) {
    setRoom(joinedRoom);
    setIsHost(joinedAsHost);
    setMemberId(id);
  }

  function handleLeave() {
    disconnectSocket();
    setRoom(null);
    setIsHost(false);
    setMemberId('');
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
