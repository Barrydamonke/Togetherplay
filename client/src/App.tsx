import { useState } from 'react';
import { Room as RoomType } from './types';
import { Landing } from './components/Landing';
import { Room } from './components/Room';
import { disconnectSocket } from './lib/socket';

export default function App() {
  const [room, setRoom] = useState<RoomType | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [memberId, setMemberId] = useState('');

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
    return <Landing onJoined={handleJoined} />;
  }

  return (
    <Room
      initialRoom={room}
      isHost={isHost}
      memberId={memberId}
      onLeave={handleLeave}
    />
  );
}
