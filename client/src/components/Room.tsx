import { useEffect, useState } from 'react';
import { Room as RoomType, Video, PlaybackState, ChatMessage, Member, AspectRatio } from '../types';
import { getSocket } from '../lib/socket';
import { VideoPlayer } from './VideoPlayer';
import { Chat } from './Chat';
import { Sidebar } from './Sidebar';
import { RoomSettings } from './RoomSettings';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { useToasts, ToastContainer } from './Toast';
import { useIsMobile } from '../lib/useIsMobile';
import { useRateLimit } from '../lib/useRateLimit';

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
  const [showSettings, setShowSettings] = useState(false);
  const { toasts, addToast } = useToasts();
  const { rateLimited, check: checkRateLimit } = useRateLimit(() =>
    addToast('chill out bro, go touch some grass before doing that again'),
  );
  const socket = getSocket();
  const isMobile = useIsMobile();

  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(
    () => (localStorage.getItem('tg-aspect-ratio') as AspectRatio) ?? 'auto',
  );

  function handleSetAspectRatio(ratio: AspectRatio) {
    setAspectRatio(ratio);
    localStorage.setItem('tg-aspect-ratio', ratio);
  }

  const [showStats, setShowStats] = useState(
    () => localStorage.getItem('tg-show-stats') === 'true',
  );

  function handleSetShowStats(v: boolean) {
    setShowStats(v);
    localStorage.setItem('tg-show-stats', String(v));
  }

  const RATIO_NUMS: Record<Exclude<AspectRatio, 'auto'>, [number, number]> = {
    '16/9':   [16, 9],
    '4/3':    [4, 3],
    '2.39/1': [2.39, 1],
  };
  const showRatioWrapper = !isMobile && aspectRatio !== 'auto';
  const ratioNums = showRatioWrapper ? RATIO_NUMS[aspectRatio as Exclude<AspectRatio, 'auto'>] : null;

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

    socket.on(
      'room:settings_updated',
      (settings: { hidden: boolean; viewerCanManageQueue: boolean; viewerCanControl: boolean; idleGameUrl?: string }) => {
        setRoom((prev) => ({ ...prev, ...settings }));
      },
    );

    return () => {
      socket.off('room:members_updated');
      socket.off('playback:update');
      socket.off('queue:update');
      socket.off('chat:message');
      socket.off('room:host_changed');
      socket.off('room:settings_updated');
    };
  }, [socket, memberId, addToast]);

  const currentVideo = room.currentVideoIndex >= 0 ? room.queue[room.currentVideoIndex] : null;

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', height: '100%', overflow: 'hidden' }}>
      {/* Video side */}
      <div style={isMobile
        ? { width: '100%', flexShrink: 0, display: 'flex', flexDirection: 'column' }
        : { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }
      }>
        <div
          style={isMobile
            ? { width: '100%', background: '#000' }
            : showRatioWrapper
              ? { flex: 1, minHeight: 0, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }
              : { flex: 1, minHeight: 0, background: '#000' }
          }
          className={showRatioWrapper ? 'video-ratio-outer' : undefined}
        >
          {showRatioWrapper && ratioNums ? (
            <div style={{
              width: `min(100cqw, calc(100cqh * ${ratioNums[0]} / ${ratioNums[1]}))`,
              height: `min(100cqh, calc(100cqw * ${ratioNums[1]} / ${ratioNums[0]}))`,
            }}>
              <VideoPlayer
                streamUrl={currentVideo?.streamUrl ?? null}
                isHls={currentVideo?.isHls ?? true}
                knownDuration={currentVideo?.duration}
                jellyfinId={currentVideo?.jellyfinId}
                videoTitle={currentVideo?.title}
                playback={room.playback}
                isHost={isHost}
                canControl={isHost || room.viewerCanControl}
                showStats={showStats}
                idleGameUrl={room.idleGameUrl}
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
          ) : (
            <VideoPlayer
              streamUrl={currentVideo?.streamUrl ?? null}
              isHls={currentVideo?.isHls ?? true}
              knownDuration={currentVideo?.duration}
              jellyfinId={currentVideo?.jellyfinId}
              videoTitle={currentVideo?.title}
              playback={room.playback}
              isHost={isHost}
              canControl={isHost || room.viewerCanControl}
              showStats={showStats}
              idleGameUrl={room.idleGameUrl}
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
          )}
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

      {/* Right / bottom panel */}
      <aside style={isMobile
        ? {
            width: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
            borderTop: '1px solid var(--border)', background: 'var(--surface)',
            overflowY: 'auto', overflowX: 'hidden',
          }
        : {
            width: 332, flexShrink: 0, display: 'flex', flexDirection: 'column',
            borderLeft: '1px solid var(--border)', background: 'var(--surface)',
          }
      }>
        {/* Panel header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <Logo height={28} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setShowSettings(true)}
              title="Room settings"
              style={{
                width: 32, height: 32, borderRadius: '50%',
                border: '1px solid var(--border)', background: 'var(--surface-2)',
                color: 'var(--text-dim)', display: 'grid', placeItems: 'center',
              }}
            >
              <Icon name="settings" size={15} />
            </button>

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
          isMobile={isMobile}
          rateLimited={rateLimited}
          onSetCurrentVideo={(index) => socket.emit('queue:set_current', { index })}
          onRemoveFromQueue={(index) => socket.emit('queue:remove', { index })}
          onAddVideo={(video) => {
            if (checkRateLimit('queueAdd')) socket.emit('queue:add', { video });
          }}
          onReorderQueue={(from, to) => socket.emit('queue:reorder', { from, to })}
        />

        <Chat
          messages={room.chat}
          currentMemberId={memberId}
          isMobile={isMobile}
          rateLimited={rateLimited}
          onSend={(text) => {
            if (checkRateLimit('chat')) socket.emit('chat:message', { text });
          }}
        />
      </aside>

      <ToastContainer toasts={toasts} />

      {showSettings && (
        <RoomSettings
          room={room}
          isHost={isHost}
          currentUsername={room.members.find((m) => m.id === memberId)?.username ?? ''}
          aspectRatio={aspectRatio}
          onSetAspectRatio={handleSetAspectRatio}
          showStats={showStats}
          onSetShowStats={handleSetShowStats}
          onRename={(name) => {
            socket.emit('room:rename_self', { username: name });
          }}
          onUpdateSettings={(settings) => {
            socket.emit('room:update_settings', settings);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
