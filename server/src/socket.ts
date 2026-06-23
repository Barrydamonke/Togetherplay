import { Server, Socket } from 'socket.io';
import { randomUUID } from 'crypto';
import { createRoom, getRoom, joinRoom, joinOrCreateRoom, leaveRoom, getCurrentTimestamp, getOnlineStats, updateRoomSettings, renameMember } from './rooms';
import { Video, ChatMessage } from './types';

function emitSystemMessage(io: Server, pin: string, text: string): void {
  const message: ChatMessage = {
    id: randomUUID(),
    memberId: 'system',
    username: 'system',
    text,
    sentAt: Date.now(),
    type: 'system',
  };
  io.to(pin).emit('chat:message', { message });
}

export function setupSocket(io: Server): void {
  io.on('connection', (socket: Socket) => {
    let currentPin: string | null = null;

    // Server-side chat rate limit: max 10 messages per 5 seconds per connection.
    const chatTimestamps: number[] = [];
    const CHAT_RATE_LIMIT = 10;
    const CHAT_RATE_WINDOW = 5000;

    socket.emit('server:stats', getOnlineStats());

    socket.on('room:create', ({ username, hidden }: { username: string; hidden?: boolean }) => {
      const room = createRoom(socket.id, username, hidden ?? false);
      currentPin = room.pin;
      socket.join(room.pin);
      socket.emit('room:joined', { room, isHost: true });
      io.emit('server:stats', getOnlineStats());
    });

    socket.on('room:join', ({ pin, username }: { pin: string; username: string }) => {
      const existing = getRoom(pin);
      if (existing?.discordOnly) {
        socket.emit('room:error', { message: 'This room is a Discord session. Join via Discord.' });
        return;
      }
      const room = joinRoom(pin, socket.id, username);
      if (!room) {
        socket.emit('room:error', { message: 'Room not found. Check your PIN.' });
        return;
      }
      currentPin = pin;
      socket.join(pin);

      // Give the joining member a time-corrected timestamp so they sync immediately.
      const syncedRoom = {
        ...room,
        playback: {
          ...room.playback,
          timestamp: getCurrentTimestamp(room),
          lastSyncedAt: Date.now(),
        },
      };

      const isHost = room.hostId === socket.id;
      socket.emit('room:joined', { room: syncedRoom, isHost });
      socket.to(pin).emit('room:members_updated', { members: room.members, hostId: room.hostId });
      io.emit('server:stats', getOnlineStats());
    });

    socket.on('room:join_or_create', ({ pin: instanceId, username, avatar }: { pin: string; username: string; avatar?: string | null }) => {
      const room = joinOrCreateRoom(instanceId, socket.id, username, avatar);
      currentPin = room.pin;
      socket.join(room.pin);
      const syncedRoom = {
        ...room,
        playback: {
          ...room.playback,
          timestamp: getCurrentTimestamp(room),
          lastSyncedAt: Date.now(),
        },
      };
      socket.emit('room:joined', { room: syncedRoom, isHost: room.hostId === socket.id });
      socket.to(room.pin).emit('room:members_updated', { members: room.members, hostId: room.hostId });
      io.emit('server:stats', getOnlineStats());
    });

    socket.on('playback:play', ({ timestamp }: { timestamp: number }) => {
      if (!currentPin) return;
      const room = getRoom(currentPin);
      if (!room) return;
      if (room.hostId !== socket.id && !room.viewerCanControl) return;
      room.playback = { playing: true, timestamp, lastSyncedAt: Date.now() };
      io.to(currentPin).emit('playback:update', { playback: room.playback });
    });

    socket.on('playback:pause', ({ timestamp }: { timestamp: number }) => {
      if (!currentPin) return;
      const room = getRoom(currentPin);
      if (!room) return;
      if (room.hostId !== socket.id && !room.viewerCanControl) return;
      room.playback = { playing: false, timestamp, lastSyncedAt: Date.now() };
      io.to(currentPin).emit('playback:update', { playback: room.playback });
    });

    socket.on('playback:seek', ({ timestamp }: { timestamp: number }) => {
      if (!currentPin) return;
      const room = getRoom(currentPin);
      if (!room) return;
      if (room.hostId !== socket.id && !room.viewerCanControl) return;
      room.playback = { ...room.playback, timestamp, lastSyncedAt: Date.now() };
      io.to(currentPin).emit('playback:update', { playback: room.playback });
    });

    socket.on('queue:add', ({ video }: { video: Video }) => {
      if (!currentPin) return;
      const room = getRoom(currentPin);
      if (!room) return;
      if (room.hostId !== socket.id && !room.viewerCanManageQueue) return;
      const wasEmpty = room.currentVideoIndex === -1;
      room.queue.push(video);
      if (wasEmpty) {
        room.currentVideoIndex = 0;
        room.playback = { playing: true, timestamp: 0, lastSyncedAt: Date.now() };
        io.to(currentPin).emit('playback:update', { playback: room.playback });
        emitSystemMessage(io, currentPin, `${video.title} has started playing`);
      }
      io.to(currentPin).emit('queue:update', {
        queue: room.queue,
        currentVideoIndex: room.currentVideoIndex,
      });
    });

    socket.on('queue:remove', ({ index }: { index: number }) => {
      if (!currentPin) return;
      const room = getRoom(currentPin);
      if (!room || room.hostId !== socket.id) return;
      room.queue.splice(index, 1);
      if (room.queue.length === 0) {
        room.currentVideoIndex = -1;
      } else if (index < room.currentVideoIndex) {
        // A video before the current one was removed; shift the index down.
        room.currentVideoIndex -= 1;
      } else if (index === room.currentVideoIndex) {
        // The current video was removed; next video slides into the same slot,
        // but clamp if it was the last item.
        room.currentVideoIndex = Math.min(room.currentVideoIndex, room.queue.length - 1);
        // A new video is now current — reset playback so everyone starts from the beginning.
        room.playback = { playing: true, timestamp: 0, lastSyncedAt: Date.now() };
        const next = room.queue[room.currentVideoIndex];
        if (next) emitSystemMessage(io, currentPin, `${next.title} has started playing`);
        io.to(currentPin).emit('playback:update', { playback: room.playback });
      }
      io.to(currentPin).emit('queue:update', {
        queue: room.queue,
        currentVideoIndex: room.currentVideoIndex,
      });
    });

    socket.on('queue:set_current', ({ index }: { index: number }) => {
      if (!currentPin) return;
      const room = getRoom(currentPin);
      if (!room || room.hostId !== socket.id) return;
      room.currentVideoIndex = index;
      room.playback = { playing: true, timestamp: 0, lastSyncedAt: Date.now() };
      io.to(currentPin).emit('queue:update', {
        queue: room.queue,
        currentVideoIndex: room.currentVideoIndex,
      });
      io.to(currentPin).emit('playback:update', { playback: room.playback });
      const video = room.queue[index];
      if (video) {
        emitSystemMessage(io, currentPin, `${video.title} has started playing`);
        const dur = video.duration
          ? ` · ${Math.floor(video.duration / 60)}m ${Math.floor(video.duration % 60)}s`
          : '';
        const mode = video.isHls ? 'HLS' : 'Direct Stream';
        console.log(`▶ "${video.title}" started playing in room ${currentPin} [${video.source} · ${mode}${dur}]`);
      }
    });

    socket.on('queue:reorder', ({ from, to }: { from: number; to: number }) => {
      if (!currentPin) return;
      const room = getRoom(currentPin);
      if (!room) return;
      if (room.hostId !== socket.id && !room.viewerCanManageQueue) return;
      const [item] = room.queue.splice(from, 1);
      room.queue.splice(to, 0, item);
      io.to(currentPin).emit('queue:update', {
        queue: room.queue,
        currentVideoIndex: room.currentVideoIndex,
      });
    });

    socket.on('room:rename_self', ({ username }: { username: string }) => {
      if (!currentPin) return;
      const room = renameMember(currentPin, socket.id, username);
      if (!room) return;
      io.to(currentPin).emit('room:members_updated', { members: room.members, hostId: room.hostId });
    });

    socket.on(
      'room:update_settings',
      ({ hidden, viewerCanManageQueue, viewerCanControl, idleGameUrl }: Partial<{ hidden: boolean; viewerCanManageQueue: boolean; viewerCanControl: boolean; idleGameUrl: string }>) => {
        if (!currentPin) return;
        const room = getRoom(currentPin);
        if (!room || room.hostId !== socket.id) return;
        updateRoomSettings(currentPin, { hidden, viewerCanManageQueue, viewerCanControl, idleGameUrl });
        io.to(currentPin).emit('room:settings_updated', { hidden: room.hidden, viewerCanManageQueue: room.viewerCanManageQueue, viewerCanControl: room.viewerCanControl, idleGameUrl: room.idleGameUrl });
      },
    );

    socket.on('chat:message', ({ text }: { text: string }) => {
      if (!currentPin) return;
      const room = getRoom(currentPin);
      if (!room) return;
      const member = room.members.find((m) => m.id === socket.id);
      if (!member) return;
      const now = Date.now();
      while (chatTimestamps.length && chatTimestamps[0] < now - CHAT_RATE_WINDOW) chatTimestamps.shift();
      if (chatTimestamps.length >= CHAT_RATE_LIMIT) return;
      chatTimestamps.push(now);
      const message: ChatMessage = {
        id: randomUUID(),
        memberId: socket.id,
        username: member.username,
        text: text.slice(0, 500),
        sentAt: Date.now(),
        videoTimestamp: room.currentVideoIndex >= 0 ? getCurrentTimestamp(room) : undefined,
      };
      room.chat.push(message);
      if (room.chat.length > 200) room.chat.shift();
      io.to(currentPin).emit('chat:message', { message });
    });

    socket.on('disconnect', () => {
      if (!currentPin) return;
      const { room, hostChanged, newHostId, newHostUsername } = leaveRoom(currentPin, socket.id);
      if (room) {
        // Send members update first so isHost state settles before the toast fires.
        io.to(currentPin).emit('room:members_updated', { members: room.members, hostId: room.hostId });
        if (hostChanged && newHostId && newHostUsername) {
          io.to(currentPin).emit('room:host_changed', { newHostId, newHostUsername });
        }
      }
      io.emit('server:stats', getOnlineStats());
    });
  });
}
