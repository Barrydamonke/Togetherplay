import { Room, Member } from './types';

const rooms = new Map<string, Room>();

function generatePin(): string {
  let pin: string;
  do {
    pin = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms.has(pin));
  return pin;
}

export function createRoom(hostId: string, hostUsername: string): Room {
  const pin = generatePin();
  const room: Room = {
    pin,
    hostId,
    members: [{ id: hostId, username: hostUsername, isHost: true }],
    queue: [],
    currentVideoIndex: -1,
    playback: { playing: false, timestamp: 0, lastSyncedAt: Date.now() },
    chat: [],
  };
  rooms.set(pin, room);
  return room;
}

export function getRoom(pin: string): Room | undefined {
  return rooms.get(pin);
}

export function joinRoom(pin: string, memberId: string, username: string): Room | null {
  const room = rooms.get(pin);
  if (!room) return null;
  if (!room.members.find((m: Member) => m.id === memberId)) {
    room.members.push({ id: memberId, username, isHost: false });
  }
  return room;
}

export function leaveRoom(pin: string, memberId: string): Room | null {
  const room = rooms.get(pin);
  if (!room) return null;

  room.members = room.members.filter((m: Member) => m.id !== memberId);

  if (room.members.length === 0) {
    rooms.delete(pin);
    return null;
  }

  if (room.hostId === memberId) {
    room.hostId = room.members[0].id;
    room.members[0].isHost = true;
  }

  return room;
}

// Calculates where the video currently is, accounting for time elapsed since last sync.
export function getCurrentTimestamp(room: Room): number {
  if (!room.playback.playing) return room.playback.timestamp;
  return room.playback.timestamp + (Date.now() - room.playback.lastSyncedAt) / 1000;
}
