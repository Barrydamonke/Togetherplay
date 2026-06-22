import { useEffect, useRef, useState } from 'react';
import { Room as RoomType, Video, PlaybackState, ChatMessage, Member, AspectRatio } from '../types';
import { getSocket } from '../lib/socket';
import { VideoPlayer } from './VideoPlayer';
import { Chat } from './Chat';
import { Sidebar, MEMBER_COLORS } from './Sidebar';
import { JellyfinBrowser } from './JellyfinBrowser';
import { RoomSettings } from './RoomSettings';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { useToasts, ToastContainer } from './Toast';
import { useIsMobile } from '../lib/useIsMobile';
import { useRateLimit } from '../lib/useRateLimit';
import { isFavourite, addFavourite, removeFavourite } from '../lib/favourites';

interface Props {
  initialRoom: RoomType;
  isHost: boolean;
  memberId: string;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onLeave?: () => void;
}

const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 560;
const DEFAULT_SIDEBAR_WIDTH = 332;

const miniBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--text-dim)', display: 'grid', placeItems: 'center',
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
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

  // Panel collapse states — all three sections flex against each other in the aside
  const [membersCollapsed, setMembersCollapsed] = useState(false);
  const [queueCollapsed, setQueueCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);

  // Favourites
  const [isFaved, setIsFaved] = useState(false);
  const [heartPopping, setHeartPopping] = useState(false);

  const currentJellyfinId = room.currentVideoIndex >= 0
    ? room.queue[room.currentVideoIndex]?.jellyfinId
    : undefined;

  useEffect(() => {
    setIsFaved(currentJellyfinId ? isFavourite(currentJellyfinId) : false);
  }, [currentJellyfinId]);

  // Queue drag state
  const [showBrowser, setShowBrowser] = useState(false);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);

  // Sidebar resize
  const [sidebarWidth, setSidebarWidth] = useState(
    () => parseInt(localStorage.getItem('tg-sidebar-width') ?? String(DEFAULT_SIDEBAR_WIDTH), 10),
  );
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  // Discord Activity iframe injects frame_id. Native fullscreen is blocked inside it,
  // so we repurpose the fullscreen button to toggle the sidebar instead.
  const isDiscordMode = new URLSearchParams(window.location.search).has('frame_id');

  function handleSetSidebarWidth(w: number) {
    const clamped = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, w));
    setSidebarWidth(clamped);
    localStorage.setItem('tg-sidebar-width', String(clamped));
  }

  function handleResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    setIsResizing(true);
    function onMove(ev: MouseEvent) {
      // Sidebar is flush against the right edge, so its width equals distance from cursor to viewport right.
      setSidebarWidth(Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, window.innerWidth - ev.clientX)));
    }
    function onUp(ev: MouseEvent) {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const final = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, window.innerWidth - ev.clientX));
      setSidebarWidth(final);
      localStorage.setItem('tg-sidebar-width', String(final));
      setIsResizing(false);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  const RATIO_NUMS: Record<Exclude<AspectRatio, 'auto'>, [number, number]> = {
    '16/9':   [16, 9],
    '4/3':    [4, 3],
    '2.39/1': [2.39, 1],
  };
  const showRatioWrapper = !isMobile && aspectRatio !== 'auto';
  const ratioNums = showRatioWrapper ? RATIO_NUMS[aspectRatio as Exclude<AspectRatio, 'auto'>] : null;

  const isHost = room.hostId === memberId;
  const canManageQueue = isHost || room.viewerCanManageQueue;

  useEffect(() => {
    function onMembersUpdated({ members, hostId }: { members: Member[]; hostId: string }) {
      setRoom((prev) => ({ ...prev, members, hostId }));
    }
    function onPlaybackUpdate({ playback }: { playback: PlaybackState }) {
      setRoom((prev) => ({ ...prev, playback }));
    }
    function onQueueUpdate({ queue, currentVideoIndex }: { queue: Video[]; currentVideoIndex: number }) {
      setRoom((prev) => ({ ...prev, queue, currentVideoIndex }));
    }
    function onChatMessage({ message }: { message: ChatMessage }) {
      setRoom((prev) => {
        const chat = [...prev.chat, message];
        if (chat.length > 200) chat.splice(0, chat.length - 200);
        return { ...prev, chat };
      });
    }
    function onHostChanged({ newHostId, newHostUsername }: { newHostId: string; newHostUsername: string }) {
      if (newHostId === memberId) {
        addToast('You are now the host');
      } else {
        addToast(`${newHostUsername} is now the host`);
      }
    }
    function onSettingsUpdated(settings: { hidden: boolean; viewerCanManageQueue: boolean; viewerCanControl: boolean; idleGameUrl?: string }) {
      setRoom((prev) => ({ ...prev, ...settings }));
    }

    socket.on('room:members_updated', onMembersUpdated);
    socket.on('playback:update', onPlaybackUpdate);
    socket.on('queue:update', onQueueUpdate);
    socket.on('chat:message', onChatMessage);
    socket.on('room:host_changed', onHostChanged);
    socket.on('room:settings_updated', onSettingsUpdated);

    return () => {
      socket.off('room:members_updated', onMembersUpdated);
      socket.off('playback:update', onPlaybackUpdate);
      socket.off('queue:update', onQueueUpdate);
      socket.off('chat:message', onChatMessage);
      socket.off('room:host_changed', onHostChanged);
      socket.off('room:settings_updated', onSettingsUpdated);
    };
  }, [socket, memberId, addToast]);

  // Sync room state from the server after a reconnect. App.tsx receives a fresh
  // room:joined payload and updates initialRoom — this effect propagates it here.
  // On first mount Object.is bails out immediately (same reference), so no extra render.
  useEffect(() => {
    setRoom(initialRoom);
  }, [initialRoom]);

  const [socketConnected, setSocketConnected] = useState(socket.connected);
  useEffect(() => {
    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket]);

  const currentVideo = room.currentVideoIndex >= 0 ? room.queue[room.currentVideoIndex] : null;

  function handleToggleFavourite() {
    if (!currentVideo?.jellyfinId) return;
    if (isFaved) {
      removeFavourite(currentVideo.jellyfinId);
      setIsFaved(false);
    } else {
      addFavourite({
        jellyfinId: currentVideo.jellyfinId,
        title: currentVideo.title,
        thumbnailUrl: currentVideo.thumbnailUrl,
        duration: currentVideo.duration,
      });
      setIsFaved(true);
      setHeartPopping(true);
    }
  }

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
                sidebarHidden={isDiscordMode ? sidebarHidden : undefined}
                onToggleSidebar={isDiscordMode ? () => setSidebarHidden((v) => !v) : undefined}
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
              sidebarHidden={isDiscordMode ? sidebarHidden : undefined}
              onToggleSidebar={isDiscordMode ? () => setSidebarHidden((v) => !v) : undefined}
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
        {currentVideo && !(isDiscordMode && sidebarHidden) && (
          <div style={{
            padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14,
            borderTop: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0,
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="font-display" style={{ fontWeight: 600, fontSize: 17, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text)' }}>
                {currentVideo.title}
              </div>
            </div>
            <button
              onClick={handleToggleFavourite}
              disabled={!currentVideo?.jellyfinId}
              title={isFaved ? 'Remove from favourites' : 'Add to favourites'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                fontSize: 13, fontWeight: 700,
                color: isFaved ? 'var(--accent)' : 'var(--text-dim)',
                background: isFaved ? 'var(--accent-soft)' : 'var(--surface-2)',
                border: `1px solid ${isFaved ? 'var(--accent)' : 'var(--border)'}`,
                padding: '8px 13px', borderRadius: 99, flexShrink: 0,
                transition: 'background .2s, color .2s, border-color .2s',
                opacity: !currentVideo?.jellyfinId ? 0.45 : 1,
              }}
            >
              <span
                className={heartPopping ? 'heart-pop' : undefined}
                onAnimationEnd={() => setHeartPopping(false)}
                style={{ display: 'grid', placeItems: 'center' }}
              >
                <Icon name="heart" size={15} style={{ color: 'var(--accent)' }} />
              </span>
              {isFaved ? 'Loved' : 'Loving this'}
            </button>
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
            position: 'relative',
            width: sidebarHidden ? 0 : sidebarWidth,
            flexShrink: 0, display: 'flex', flexDirection: 'column',
            borderLeft: sidebarHidden ? 'none' : '1px solid var(--border)',
            background: 'var(--surface)',
            overflow: 'hidden',
            transition: isResizing ? 'none' : 'width 0.2s ease',
          }
      }>
        {/* Resize drag handle — desktop only */}
        {!isMobile && !sidebarHidden && (
          <div
            onMouseDown={handleResizeMouseDown}
            style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: 5,
              cursor: 'col-resize', zIndex: 10,
            }}
          />
        )}

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
            {onLeave && (
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
            )}
          </div>
        </div>

        {/* PIN + Watching — fixed height, shrinks with collapse */}
        <Sidebar
          room={room}
          membersCollapsed={membersCollapsed}
          onToggleMembersCollapsed={() => setMembersCollapsed((v) => !v)}
        />

        {/* Queue — flex: 1 so it takes remaining space; collapses to header only */}
        <div style={isMobile
          ? { borderTop: '1px solid var(--border-soft)', display: 'flex', flexDirection: 'column' }
          : {
              borderTop: '1px solid var(--border-soft)',
              flex: queueCollapsed ? '0 0 auto' : 1,
              minHeight: 0,
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }
        }>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 16px', height: 34, flexShrink: 0,
          }}>
            <span
              onClick={() => setQueueCollapsed((v) => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-faint)', whiteSpace: 'nowrap', cursor: 'pointer' }}
            >
              <Icon name="list" size={13} /> Up next
              <Icon name={queueCollapsed ? 'chevron-down' : 'chevron-up'} size={13} style={{ color: 'var(--text-faint)' }} />
            </span>
            {canManageQueue && (
              <button
                onClick={() => setShowBrowser(true)}
                disabled={rateLimited}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 12.5, fontWeight: 800, color: 'var(--accent)',
                  background: 'var(--accent-soft)', border: 'none',
                  padding: '5px 11px', borderRadius: 99,
                  opacity: rateLimited ? 0.45 : 1,
                }}
              >
                <Icon name="plus" size={14} /> Add
              </button>
            )}
          </div>

          {!queueCollapsed && (
            <div style={isMobile
              ? { maxHeight: 260, overflowY: 'auto', overflowX: 'hidden', padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 4 }
              : { flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 4 }
            }>
              {room.queue.length === 0 && (
                <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 13.5, fontWeight: 600, padding: '20px 0' }}>
                  {canManageQueue ? 'Add something to watch.' : "Queue's empty."}
                </p>
              )}
              {room.queue.map((video, index) => {
                const isCurrent = index === room.currentVideoIndex;
                const isDragTarget = dragOver === index && dragIndexRef.current !== index;
                return (
                  <div
                    key={video.id}
                    draggable={canManageQueue && !isCurrent}
                    onDragStart={() => { dragIndexRef.current = index; }}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(index); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={() => {
                      const from = dragIndexRef.current;
                      if (from !== null && from !== index) socket.emit('queue:reorder', { from, to: index });
                      dragIndexRef.current = null;
                      setDragOver(null);
                    }}
                    onDragEnd={() => { dragIndexRef.current = null; setDragOver(null); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 11,
                      padding: 8, borderRadius: 'var(--r-md)',
                      background: isCurrent ? 'var(--accent-soft)' : isDragTarget ? 'var(--surface-2)' : 'transparent',
                      boxShadow: isCurrent ? 'inset 0 0 0 1.5px var(--accent)' : isDragTarget ? 'inset 0 0 0 1.5px var(--border)' : 'none',
                      cursor: canManageQueue && !isCurrent ? 'grab' : 'default',
                      transition: 'background .1s, box-shadow .1s',
                    }}
                  >
                    {canManageQueue && !isCurrent && (
                      <span style={{ color: 'var(--text-faint)', flexShrink: 0, cursor: 'grab', display: 'grid', placeItems: 'center' }}>
                        <Icon name="grip" size={16} />
                      </span>
                    )}
                    {video.thumbnailUrl ? (
                      <img
                        src={video.thumbnailUrl}
                        alt=""
                        style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 8, flexShrink: 0, background: 'var(--surface-3)' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div style={{
                        width: 36, height: 50, borderRadius: 8, flexShrink: 0,
                        background: `linear-gradient(150deg, ${MEMBER_COLORS[index % MEMBER_COLORS.length]}, #1a1a2e)`,
                      }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {video.title}
                      </div>
                      {isCurrent
                        ? <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)' }}>Now playing</div>
                        : video.duration
                          ? <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-faint)' }}>{formatDuration(video.duration)}</div>
                          : null}
                    </div>
                    {isHost && (
                      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                        {!isCurrent && (
                          <button
                            onClick={() => socket.emit('queue:set_current', { index })}
                            title="Play now"
                            style={miniBtn}
                          >
                            <Icon name="play" size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => socket.emit('queue:remove', { index })}
                          title="Remove"
                          style={miniBtn}
                        >
                          <Icon name="close" size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Chat — flex: 1, fills space left by Queue when collapsed */}
        <Chat
          messages={room.chat}
          currentMemberId={memberId}
          isMobile={isMobile}
          rateLimited={rateLimited}
          disconnected={!socketConnected}
          collapsed={chatCollapsed}
          onToggleCollapse={() => setChatCollapsed((v) => !v)}
          onSend={(text) => {
            if (checkRateLimit('chat')) socket.emit('chat:message', { text });
          }}
        />
      </aside>

      <ToastContainer toasts={toasts} />

      {showBrowser && (
        <JellyfinBrowser
          onAdd={(video) => {
            if (checkRateLimit('queueAdd')) socket.emit('queue:add', { video });
            setShowBrowser(false);
          }}
          onClose={() => setShowBrowser(false)}
        />
      )}

      {showSettings && (
        <RoomSettings
          room={room}
          isHost={isHost}
          currentUsername={room.members.find((m) => m.id === memberId)?.username ?? ''}
          aspectRatio={aspectRatio}
          onSetAspectRatio={handleSetAspectRatio}
          showStats={showStats}
          onSetShowStats={handleSetShowStats}
          sidebarWidth={sidebarWidth}
          onSetSidebarWidth={handleSetSidebarWidth}
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
