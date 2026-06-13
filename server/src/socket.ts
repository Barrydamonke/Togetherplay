import { Server, Socket } from 'socket.io';
import { randomUUID } from 'crypto';
import { createRoom, getRoom, joinRoom, leaveRoom, getCurrentTimestamp } from './rooms';
import { Video, ChatMessage } from './types';

export function setupSocket(io: Server): void {
  io.on('connection', (socket: Socket) => {
    let currentPin: string | null = null;

    socket.on('room:create', ({ username }: { username: string }) => {
      const room = createRoom(socket.id, username);
      currentPin = room.pin;
      socket.join(room.pin);
      socket.emit('room:joined', { room, isHost: true });
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

      socket.emit('room:joined', { room: syncedRoom, isHost: false });
      socket.to(pin).emit('room:members_updated', { members: room.members });
    });

    socket.on('playback:play', ({ timestamp }: { timestamp: number }) => {
      if (!currentPin) return;
      const room = getRoom(currentPin);
      if (!room || room.hostId !== socket.id) return;
      room.playback = { playing: true, timestamp, lastSyncedAt: Date.now() };
      io.to(currentPin).emit('playback:update', { playback: room.playback });
    });

    socket.on('playback:pause', ({ timestamp }: { timestamp: number }) => {
      if (!currentPin) return;
      const room = getRoom(currentPin);
      if (!room || room.hostId !== socket.id) return;
      room.playback = { playing: false, timestamp, lastSyncedAt: Date.now() };
      io.to(currentPin).emit('playback:update', { playback: room.playback });
    });

    socket.on('playback:seek', ({ timestamp }: { timestamp: number }) => {
      if (!currentPin) return;
      const room = getRoom(currentPin);
      if (!room || room.hostId !== socket.id) return;
      room.playback = { ...room.playback, timestamp, lastSyncedAt: Date.now() };
      io.to(currentPin).emit('playback:update', { playback: room.playback });
    });

    socket.on('queue:add', ({ video }: { video: Video }) => {
      if (!currentPin) return;
      const room = getRoom(currentPin);
      if (!room || room.hostId !== socket.id) return;
      room.queue.push(video);
      if (room.currentVideoIndex === -1) room.currentVideoIndex = 0;
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
      room.playback = { playing: false, timestamp: 0, lastSyncedAt: Date.now() };
      io.to(currentPin).emit('queue:update', {
        queue: room.queue,
        currentVideoIndex: room.currentVideoIndex,
      });
      io.to(currentPin).emit('playback:update', { playback: room.playback });
    });

    socket.on('queue:reorder', ({ from, to }: { from: number; to: number }) => {
      if (!currentPin) return;
      const room = getRoom(currentPin);
      if (!room || room.hostId !== socket.id) return;
      const [item] = room.queue.splice(from, 1);
      room.queue.splice(to, 0, item);
      io.to(currentPin).emit('queue:update', {
        queue: room.queue,
        currentVideoIndex: room.currentVideoIndex,
      });
    });

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
      };
      room.chat.push(message);
      if (room.chat.length > 200) room.chat.shift();
      io.to(currentPin).emit('chat:message', { message });
    });

    socket.on('disconnect', () => {
      if (!currentPin) return;
      const room = leaveRoom(currentPin, socket.id);
      if (room) {
        io.to(currentPin).emit('room:members_updated', { members: room.members });
      }
    });
  });
}
