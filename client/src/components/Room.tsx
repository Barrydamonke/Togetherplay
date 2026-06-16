import { useEffect, useState } from 'react';
import { Room as RoomType, Video, PlaybackState, ChatMessage, Member } from '../types';
import { getSocket } from '../lib/socket';
import { VideoPlayer } from './VideoPlayer';
import { Chat } from './Chat';
import { Sidebar } from './Sidebar';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { useToasts, ToastContainer } from './Toast';

interface Props {
  initialRoom: RoomType;
  isHost: boolean;
  memberId: string;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onLeave: () => void;
}

export function Room({ initialRoom, memberId, theme, onToggleTheme, onLeave }: Props) {
  const [room, setRoom] = useState<RoomType>(initialRoom);
  const { toasts, addToast } = useToasts();
  const socket = getSocket();

  // Derive host status from live room state so it updates when host changes.
  const isHost = room.hostId === memberId;

  useEffect(() => {
    socket.on('room:members_updated', ({ members, hostId }: { members: Member[]; hostId: string }) => {
      setRoom((prev) => ({ ...prev, members, hostId }));
    });

    socket.on('playback:update', ({ playback }: { playback: PlaybackState }) => {
      setRoom((prev) => ({ ...prev, playback }));
    });

    socket.on(
      'queue:update',
      ({ queue, currentVideoIndex }: { queue: Video[]; currentVideoIndex: number }) => {
        setRoom((prev) => ({ ...prev, queue, currentVideoIndex }));
      },
    );

    socket.on('chat:message', ({ message }: { message: ChatMessage }) => {
      setRoom((prev) => ({ ...prev, chat: [...prev.chat, message] }));
    });

    socket.on('room:host_changed', ({ newHostId, newHostUsername }: { newHostId: string; newHostUsername: string }) => {
      if (newHostId === memberId) {
        addToast('You are now the host');
      } else {
        addToast(`${newHostUsername} is now the host`);
      }
    });

    return () => {
      socket.off('room:members_updated');
      socket.off('playback:update');
      socket.off('queue:update');
      socket.off('chat:message');
      socket.off('room:host_changed');
    };
  }, [socket, memberId, addToast]);

  const currentVideo = room.currentVideoIndex >= 0 ? room.queue[room.currentVideoIndex] : null;

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Video side */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, minHeight: 0, background: '#000' }}>
          <VideoPlayer
            streamUrl={currentVideo?.streamUrl ?? null}
            isHls={currentVideo?.isHls ?? true}
            knownDuration={currentVideo?.duration}
            jellyfinId={currentVideo?.jellyfinId}
            playback={room.playback}
            isHost={isHost}
            onPlay={(ts) => socket.emit('playback:play', { timestamp: ts })}
            onPause={(ts) => socket.emit('playback:pause', { timestamp: ts })}
            onSeek={(ts) => socket.emit('playback:seek', { timestamp: ts })}
            onEnded={() => {
              const nextIndex = room.currentVideoIndex + 1;
              if (nextIndex < room.queue.length) {
                socket.emit('queue:set_current', { index: nextIndex });
              }
            }}
          />
        </div>

        {/* Info bar below player */}
        {currentVideo && (
          <div style={{
            padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14,
            borderTop: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0,
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="font-display" style={{ fontWeight: 600, fontSize: 17, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text)' }}>
                {currentVideo.title}
              </div>
            </div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              fontSize: 13, fontWeight: 700, color: 'var(--text-dim)',
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              padding: '8px 13px', borderRadius: 99, flexShrink: 0,
            }}>
              <Icon name="heart" size={15} style={{ color: 'var(--accent)' }} /> Loving this
            </span>
          </div>
        )}
      </div>

      {/* Right panel */}
      <aside style={{
        width: 332, flexShrink: 0, display: 'flex', flexDirection: 'column',
        borderLeft: '1px solid var(--border)', background: 'var(--surface)',
      }}>
        {/* Panel header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <Logo height={28} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={onToggleTheme}
              title="Toggle theme"
              style={{
                width: 32, height: 32, borderRadius: '50%',
                border: '1px solid var(--border)', background: 'var(--surface-2)',
                color: 'var(--text-dim)', display: 'grid', placeItems: 'center',
              }}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
            </button>

            <button
              onClick={onLeave}
              title="Leave room"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 13, fontWeight: 700, color: 'var(--text-dim)',
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                padding: '7px 12px', borderRadius: 99,
              }}
            >
              <Icon name="door" size={15} /> Leave
            </button>
          </div>
        </div>

        <Sidebar
          room={room}
          isHost={isHost}
          onSetCurrentVideo={(index) => socket.emit('queue:set_current', { index })}
          onRemoveFromQueue={(index) => socket.emit('queue:remove', { index })}
          onAddVideo={(video) => socket.emit('queue:add', { video })}
          onReorderQueue={(from, to) => socket.emit('queue:reorder', { from, to })}
        />

        <Chat
          messages={room.chat}
          currentMemberId={memberId}
          onSend={(text) => socket.emit('chat:message', { text })}
        />
      </aside>

      <ToastContainer toasts={toasts} />
    </div>
  );
}
