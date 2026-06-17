import { Server, Socket } from 'socket.io';
import { randomUUID } from 'crypto';
import { createRoom, getRoom, joinRoom, leaveRoom, getCurrentTimestamp, getOnlineStats, updateRoomSettings, renameMember } from './rooms';
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

    socket.emit('server:stats', getOnlineStats());

    socket.on('room:create', ({ username, hidden }: { username: string; hidden?: boolean }) => {
      const room = createRoom(socket.id, username, hidden ?? false);
      currentPin = room.pin;
      socket.join(room.pin);
      socket.emit('room:joined', { room, isHost: true });
      io.emit('server:stats', getOnlineStats());
    });

    socket.on('room:join', ({ pin, username }: { pin: string; username: string }) => {
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
      if (room.currentVideoIndex >= room.queue.length) {
        room.currentVideoIndex = Math.max(0, room.queue.length - 1);
      }
      if (room.queue.length === 0) room.currentVideoIndex = -1;
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
      if (video) emitSystemMessage(io, currentPin, `${video.title} has started playing`);
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
      ({ hidden, viewerCanManageQueue, viewerCanControl }: Partial<{ hidden: boolean; viewerCanManageQueue: boolean; viewerCanControl: boolean }>) => {
        if (!currentPin) return;
        const room = getRoom(currentPin);
        if (!room || room.hostId !== socket.id) return;
        updateRoomSettings(currentPin, { hidden, viewerCanManageQueue, viewerCanControl });
        io.to(currentPin).emit('room:settings_updated', { hidden: room.hidden, viewerCanManageQueue: room.viewerCanManageQueue, viewerCanControl: room.viewerCanControl });
      },
    );

    socket.on('chat:message', ({ text }: { text: string }) => {
      if (!currentPin) return;
      const room = getRoom(currentPin);
      if (!room) return;
      const member = room.members.find((m) => m.id === socket.id);
      if (!member) return;
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
