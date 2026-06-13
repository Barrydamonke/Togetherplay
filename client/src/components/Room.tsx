import { useEffect, useState } from 'react';
import { Room as RoomType, Video, PlaybackState, ChatMessage, Member } from '../types';
import { getSocket } from '../lib/socket';
import { VideoPlayer } from './VideoPlayer';
import { Chat } from './Chat';
import { Sidebar } from './Sidebar';

interface Props {
  initialRoom: RoomType;
  isHost: boolean;
  memberId: string;
  onLeave: () => void;
}

export function Room({ initialRoom, isHost, memberId, onLeave }: Props) {
  const [room, setRoom] = useState<RoomType>(initialRoom);
  const socket = getSocket();

  useEffect(() => {
    socket.on('room:members_updated', ({ members }: { members: Member[] }) => {
      setRoom((prev) => ({ ...prev, members }));
    });

    socket.on('playback:update', ({ playback }: { playback: PlaybackState }) => {
      setRoom((prev) => ({ ...prev, playback }));
    });

    socket.on(
      'queue:update',
      ({ queue, currentVideoIndex }: { queue: Video[]; currentVideoIndex: number }) => {
        setRoom((prev) => ({ ...prev, queue, currentVideoIndex }));
      }
    );

    socket.on('chat:message', ({ message }: { message: ChatMessage }) => {
      setRoom((prev) => ({ ...prev, chat: [...prev.chat, message] }));
    });

    return () => {
      socket.off('room:members_updated');
      socket.off('playback:update');
      socket.off('queue:update');
      socket.off('chat:message');
    };
  }, [socket]);

  const currentVideo = room.currentVideoIndex >= 0 ? room.queue[room.currentVideoIndex] : null;

  return (
    <div className="flex h-screen bg-gray-900 overflow-hidden">
      {/* Video area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 bg-black">
          <VideoPlayer
            streamUrl={currentVideo?.streamUrl ?? null}
            isHls={currentVideo?.isHls ?? true}
            knownDuration={currentVideo?.duration}
            playback={room.playback}
            isHost={isHost}
            onPlay={(ts) => socket.emit('playback:play', { timestamp: ts })}
            onPause={(ts) => socket.emit('playback:pause', { timestamp: ts })}
            onSeek={(ts) => socket.emit('playback:seek', { timestamp: ts })}
          />
        </div>
        {currentVideo && (
          <div className="px-4 py-2 bg-gray-900 border-t border-gray-800">
            <p className="text-sm text-white font-medium truncate">{currentVideo.title}</p>
          </div>
        )}
      </div>

      {/* Right panel */}
      <div className="w-72 flex flex-col border-l border-gray-700 bg-gray-900">
        {/* Leave button */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
          <span className="text-sm font-semibold text-white">Togetherness</span>
          <button
            onClick={onLeave}
            className="text-xs text-gray-500 hover:text-red-400 transition-colors"
          >
            Leave
          </button>
        </div>

        <Sidebar
          room={room}
          isHost={isHost}
          onSetCurrentVideo={(index) => socket.emit('queue:set_current', { index })}
          onRemoveFromQueue={(index) => socket.emit('queue:remove', { index })}
          onAddVideo={(video) => socket.emit('queue:add', { video })}
        />

        <Chat
          messages={room.chat}
          currentMemberId={memberId}
          onSend={(text) => socket.emit('chat:message', { text })}
        />
      </div>
    </div>
  );
}
