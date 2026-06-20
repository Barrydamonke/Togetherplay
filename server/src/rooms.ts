import { Room, Member } from './types';

const rooms = new Map<string, Room>();
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

function generatePin(): string {
  let pin: string;
  do {
    pin = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms.has(pin));
  return pin;
}

export function createRoom(hostId: string, hostUsername: string, hidden = false): Room {
  const pin = generatePin();
  const room: Room = {
    pin,
    hostId,
    hidden,
    viewerCanManageQueue: false,
    viewerCanControl: false,
    members: [{ id: hostId, username: hostUsername, isHost: true }],
    queue: [],
    currentVideoIndex: -1,
    playback: { playing: false, timestamp: 0, lastSyncedAt: Date.now() },
    chat: [],
  };
  rooms.set(pin, room);
  return room;
}

export function updateRoomSettings(
  pin: string,
  settings: Partial<Pick<Room, 'hidden' | 'viewerCanManageQueue' | 'viewerCanControl' | 'idleGameUrl'>>,
): Room | null {
  const room = rooms.get(pin);
  if (!room) return null;
  Object.assign(room, settings);
  return room;
}

export function renameMember(pin: string, memberId: string, username: string): Room | null {
  const room = rooms.get(pin);
  if (!room) return null;
  const member = room.members.find((m) => m.id === memberId);
  if (!member) return null;
  member.username = username.trim().slice(0, 32) || member.username;
  return room;
}

export function getRoom(pin: string): Room | undefined {
  return rooms.get(pin);
}

export function joinRoom(pin: string, memberId: string, username: string): Room | null {
  const room = rooms.get(pin);
  if (!room) return null;

  // Cancel any pending cleanup timer — someone rejoined in time.
  const timer = cleanupTimers.get(pin);
  if (timer) {
    clearTimeout(timer);
    cleanupTimers.delete(pin);
  }

  if (!room.members.find((m: Member) => m.id === memberId)) {
    // If the room is empty (grace period), the first person back becomes host.
    const isFirstMember = room.members.length === 0;
    room.members.push({ id: memberId, username, isHost: isFirstMember });
    if (isFirstMember) room.hostId = memberId;
  }

  return room;
}

export interface LeaveResult {
  room: Room | null;
  hostChanged: boolean;
  newHostId?: string;
  newHostUsername?: string;
}

export function leaveRoom(pin: string, memberId: string): LeaveResult {
  const room = rooms.get(pin);
  if (!room) return { room: null, hostChanged: false };

  const wasHost = room.hostId === memberId;
  room.members = room.members.filter((m: Member) => m.id !== memberId);

  if (room.members.length === 0) {
    // Start a 60-second grace period before deleting the room.
    const timer = setTimeout(() => {
      rooms.delete(pin);
      cleanupTimers.delete(pin);
    }, 60_000);
    cleanupTimers.set(pin, timer);
    return { room: null, hostChanged: false };
  }

  if (wasHost) {
    room.hostId = room.members[0].id;
    room.members[0].isHost = true;
    return { room, hostChanged: true, newHostId: room.hostId, newHostUsername: room.members[0].username };
  }

  return { room, hostChanged: false };
}

export interface RoomSummary {
  pin: string;
  memberCount: number;
  memberNames: string[];
}

export function getAllRooms(): RoomSummary[] {
  return Array.from(rooms.values())
    .filter((room) => !room.hidden)
    .map((room) => ({
      pin: room.pin,
      memberCount: room.members.length,
      memberNames: room.members.map((m) => m.username),
    }));
}

export function getOnlineStats(): { membersOnline: number; memberNames: string[] } {
  const names: string[] = [];
  for (const room of rooms.values()) {
    for (const member of room.members) names.push(member.username);
  }
  return { membersOnline: names.length, memberNames: names };
}

export function getCurrentTimestamp(room: Room): number {
  if (!room.playback.playing) return room.playback.timestamp;
  return room.playback.timestamp + (Date.now() - room.playback.lastSyncedAt) / 1000;
}
