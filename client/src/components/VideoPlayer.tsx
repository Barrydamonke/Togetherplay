import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { PlaybackState, JellyfinMediaInfo } from '../types';
import { useIsMobile } from '../lib/useIsMobile';

function fmtBitrate(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${Math.round(bps / 1_000)} kbps`;
  return `${bps} bps`;
}

interface SubtitleTrack {
  index: number;
  language: string;
  displayTitle: string;
  isDefault: boolean;
  isForced: boolean;
}

interface Cue {
  start: number;
  end: number;
  text: string;
}

function parseVttTime(t: string): number {
  const parts = t.trim().split(':');
  if (parts.length === 3) return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
}

function parseVtt(raw: string): Cue[] {
  return raw.split(/\n\n+/).flatMap((block) => {
    const lines = block.trim().split('\n');
    const ti = lines.findIndex((l) => l.includes('-->'));
    if (ti === -1) return [];
    const [startStr, endPart] = lines[ti].split('-->');
    const start = parseVttTime(startStr);
    // trim() before split handles the leading space left by the '-->' split
    const end = parseVttTime(endPart.trim().split(/\s+/)[0]);
    const text = lines.slice(ti + 1).join('\n').replace(/<[^>]+>/g, '').trim();
    return text && isFinite(start) && isFinite(end) ? [{ start, end, text }] : [];
  });
}

interface Props {
  streamUrl: string | null;
  isHls?: boolean;
  knownDuration?: number; // seconds from Jellyfin metadata, used before loadedmetadata fires
  jellyfinId?: string;
  playback: PlaybackState;
  isHost: boolean;
  canControl: boolean;
  onPlay: (timestamp: number) => void;
  onPause: (timestamp: number) => void;
  onSeek: (timestamp: number) => void;
  onEnded?: () => void;
  showStats?: boolean;
  videoTitle?: string;
  idleGameUrl?: string;
  // Discord Activity: native fullscreen is blocked inside the iframe, so the
  // fullscreen button is repurposed to toggle the sidebar instead.
  sidebarHidden?: boolean;
  onToggleSidebar?: () => void;
}

const SYNC_TOLERANCE_PLAYING = 2;   // drift allowed while playing
const SYNC_TOLERANCE_PAUSED  = 0.3; // snap tightly on a pause event
const PERIODIC_SYNC_THRESHOLD = 10; // seconds before a background correction kicks in

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function VideoPlayer({ streamUrl, isHls = true, knownDuration, jellyfinId, playback, isHost, canControl, onPlay, onPause, onSeek, onEnded, showStats = false, videoTitle, idleGameUrl, sidebarHidden, onToggleSidebar }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const syncingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [streamError, setStreamError] = useState('');
  const [needsGesture, setNeedsGesture] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(knownDuration ?? 0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);

  const [mediaInfo, setMediaInfo] = useState<JellyfinMediaInfo | null>(null);
  const [liveStats, setLiveStats] = useState({ bufferAhead: 0, bandwidth: 0, droppedFrames: 0 });

  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState<number | null>(null);
  const [subtitleCues, setSubtitleCues] = useState<Cue[]>([]);
  const [activeCue, setActiveCue] = useState('');
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const subtitleCuesRef = useRef<Cue[]>([]);
  const [syncDrift, setSyncDrift] = useState(0); // seconds: negative = behind host, positive = ahead

  const isMobile = useIsMobile();
  const nativeHeight = isMobile && !isFullscreen;

  // Refs so event listeners (set up with [streamUrl] dep) always see current values.
  const playbackRef = useRef(playback);
  const isHostRef = useRef(isHost);
  const onEndedRef = useRef(onEnded);
  useEffect(() => { playbackRef.current = playback; }, [playback]);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);
  useEffect(() => { subtitleCuesRef.current = subtitleCues; }, [subtitleCues]);

  // Fetch available subtitle tracks when the Jellyfin item changes.
  useEffect(() => {
    setSubtitleTracks([]);
    setSelectedTrackIndex(null);
    setSubtitleCues([]);
    setActiveCue('');
    if (!jellyfinId) return;
    fetch(`/api/jellyfin/subtitle-tracks/${jellyfinId}`)
      .then((r) => r.json())
      .then((data: { tracks: SubtitleTrack[] }) => setSubtitleTracks(data.tracks))
      .catch(() => {});
  }, [jellyfinId]);

  // Fetch and parse VTT when the user selects a track.
  useEffect(() => {
    setSubtitleCues([]);
    setActiveCue('');
    if (selectedTrackIndex === null || !jellyfinId) return;
    fetch(`/api/jellyfin/subtitles/${jellyfinId}/${selectedTrackIndex}`)
      .then((r) => r.text())
      .then((text) => setSubtitleCues(parseVtt(text)))
      .catch(() => {});
  }, [selectedTrackIndex, jellyfinId]);

  // Fetch Jellyfin codec/format metadata for the stats overlay and startup log.
  useEffect(() => {
    setMediaInfo(null);
    if (!jellyfinId) return;
    fetch(`/api/jellyfin/media-info/${jellyfinId}`)
      .then((r) => r.json())
      .then((data: JellyfinMediaInfo) => {
        setMediaInfo(data);
        const v = data.video;
        const a = data.audio;
        const vCodec = v?.codec
          ? (data.isVideoTranscoded ? `${v.codec.toUpperCase()} → H.264` : v.codec.toUpperCase())
          : '?';
        const vLine = [
          vCodec,
          v?.width && v?.height ? `${v.width}×${v.height}` : null,
          v?.fps != null ? `${v.fps}fps` : null,
          v?.bitrate != null ? fmtBitrate(v.bitrate) : null,
          v?.profile ?? null,
          v?.bitDepth != null ? `${v.bitDepth}-bit` : null,
          v?.pixelFormat ?? null,
        ].filter(Boolean).join(' | ');
        const aCodec = a?.codec
          ? (data.isAudioTranscoded
            ? `${a.codec.toUpperCase()} → AAC`
            : [a.codec.toUpperCase(), a.profile].filter(Boolean).join(' '))
          : '?';
        const aLine = [
          aCodec,
          a?.channelLayout ?? null,
          a?.channels != null ? `${a.channels}ch` : null,
          a?.sampleRate != null ? `${(a.sampleRate / 1000).toFixed(1)}kHz` : null,
          a?.bitrate != null ? fmtBitrate(a.bitrate) : null,
        ].filter(Boolean).join(' | ');
        const flags = [
          data.isVideoTranscoded ? 'video transcoded' : null,
          data.isAudioTranscoded ? 'audio transcoded' : null,
        ].filter(Boolean).join(', ');
        const modeLine = `${(data.container ?? '?').toUpperCase()} | ${data.isDirectStream ? 'Direct Stream' : `HLS${flags ? ` (${flags})` : ''}`}`;
        console.log(
          `▶ Now playing${videoTitle ? `: "${videoTitle}"` : ''}\n` +
          `  Video:  ${vLine}\n` +
          `  Audio:  ${aLine}\n` +
          `  Stream: ${modeLine}`,
        );
      })
      .catch(() => {});
  }, [jellyfinId, videoTitle]);

  // Poll live stats (buffer, bandwidth, dropped frames) at 1-second intervals.
  useEffect(() => {
    if (!showStats) return;
    const id = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;

      let bufferAhead = 0;
      const buf = video.buffered;
      for (let i = 0; i < buf.length; i++) {
        if (buf.start(i) <= video.currentTime + 0.5 && buf.end(i) > video.currentTime) {
          bufferAhead = buf.end(i) - video.currentTime;
          break;
        }
      }

      const bandwidth = hlsRef.current?.bandwidthEstimate ?? 0;
      const droppedFrames = (video as any).getVideoPlaybackQuality?.()?.droppedVideoFrames ?? 0;
      setLiveStats({ bufferAhead, bandwidth, droppedFrames });
    }, 1000);
    return () => clearInterval(id);
  }, [showStats]);

  // Seed duration from Jellyfin metadata whenever the video changes.
  // This fires immediately so the seek bar is usable before loadedmetadata resolves.
  useEffect(() => {
    if (knownDuration && knownDuration > 0) setDuration(knownDuration);
  }, [knownDuration]);

  // Load / reload source whenever the URL or stream type changes.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    setStreamError('');
    setNeedsGesture(false);
    setIsBuffering(true);
    setLiveStats({ bufferAhead: 0, bandwidth: 0, droppedFrames: 0 });
    hlsRef.current?.destroy();
    hlsRef.current = null;
    video.src = '';

    if (isHls) {
      if (Hls.isSupported()) {
        const hls = new Hls();
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            const status = (data as any).response?.code ? ` — HTTP ${(data as any).response.code}` : '';
            console.error('HLS fatal error', data);
            setStreamError(`HLS error (${data.details}): ${data.type}${status}`);
          } else {
            const code = (data as any).response?.code;
            const url = (data as any).response?.url ?? (data as any).url ?? '';
            console.warn(`HLS non-fatal: ${data.details}`, code ?? '', url);
          }
        });
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = streamUrl;
      } else {
        setStreamError('Your browser does not support HLS streaming.');
      }
    } else {
      video.src = streamUrl;
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [streamUrl, isHls]);

  // Sync local player to the room's playback state.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const sync = async () => {
      syncingRef.current = true;
      try {
        const rawTarget = playback.playing
          ? playback.timestamp + (Date.now() - playback.lastSyncedAt) / 1000
          : playback.timestamp;
        const target = isFinite(video.duration) && video.duration > 0
          ? Math.max(0, Math.min(rawTarget, video.duration))
          : Math.max(0, rawTarget);

        const tolerance = playback.playing ? SYNC_TOLERANCE_PLAYING : SYNC_TOLERANCE_PAUSED;
        if (Math.abs(video.currentTime - target) > tolerance) {
          video.currentTime = target;
        }

        if (playback.playing && video.paused) {
          if (video.readyState < 2) {
            // Video is still loading the new source; onCanPlay will retry play().
          } else {
            try {
              await video.play();
            } catch (err) {
              const name = (err as Error).name;
              if (name === 'AbortError') {
                // A new load interrupted play() — onCanPlay retries, so ignore it.
              } else if (name === 'NotAllowedError') {
                // iOS/iPadOS Safari blocks autoplay until a real user gesture.
                // Show a tap-to-start prompt rather than an error overlay.
                setNeedsGesture(true);
                setControlsVisible(true);
              } else {
                console.error('video.play() rejected:', err);
                setStreamError(`Playback blocked: ${(err as Error).message}. Try clicking the play button.`);
              }
            }
          }
        } else if (!playback.playing && !video.paused) {
          video.pause();
        }
      } finally {
        syncingRef.current = false;
      }
    };

    sync();
  }, [playback]);

  // Background drift correction for viewers: if local playback drifts more than
  // PERIODIC_SYNC_THRESHOLD seconds from the host's expected position, snap back.
  useEffect(() => {
    const id = setInterval(() => {
      if (isHostRef.current) return;
      const video = videoRef.current;
      if (!video || !playbackRef.current.playing) return;
      const rawExpected =
        playbackRef.current.timestamp +
        (Date.now() - playbackRef.current.lastSyncedAt) / 1000;
      const expected = isFinite(video.duration) && video.duration > 0
        ? Math.max(0, Math.min(rawExpected, video.duration))
        : Math.max(0, rawExpected);
      if (Math.abs(video.currentTime - expected) > PERIODIC_SYNC_THRESHOLD) {
        video.currentTime = expected;
      }
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // Update drift display every second for the sync indicator pill.
  useEffect(() => {
    const id = setInterval(() => {
      const video = videoRef.current;
      if (!video || isHostRef.current || !playbackRef.current.playing) {
        setSyncDrift(0);
        return;
      }
      const expected =
        playbackRef.current.timestamp +
        (Date.now() - playbackRef.current.lastSyncedAt) / 1000;
      setSyncDrift(video.currentTime - expected);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Mirror native video state into React for the custom controls UI.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const readDuration = () => {
      if (isFinite(video.duration) && video.duration > 0) setDuration(video.duration);
    };
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      readDuration();
      const t = video.currentTime;
      const cue = subtitleCuesRef.current.find((c) => t >= c.start && t <= c.end);
      setActiveCue(cue?.text ?? '');
    };
    const onSeeked = () => setCurrentTime(video.currentTime);
    const onLoadedMetadata = () => readDuration();
    const onDurationChange = () => readDuration();
    const onCanPlay = () => {
      readDuration();
      setIsBuffering(false);
      // Retry play if the sync effect fired before the stream was ready.
      if (playbackRef.current.playing && video.paused) {
        video.play().catch(() => {});
      }
    };
    const onWaiting = () => setIsBuffering(true);
    const onVolumeChange = () => { setVolume(video.volume); setMuted(video.muted); };
    const onPlayEvt = () => { setIsPlaying(true); setIsBuffering(false); setNeedsGesture(false); };
    const onPauseEvt = () => setIsPlaying(false);
    const onEndedEvt = () => {
      if (isHostRef.current) onEndedRef.current?.();
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('volumechange', onVolumeChange);
    video.addEventListener('play', onPlayEvt);
    video.addEventListener('pause', onPauseEvt);
    video.addEventListener('ended', onEndedEvt);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('volumechange', onVolumeChange);
      video.removeEventListener('play', onPlayEvt);
      video.removeEventListener('pause', onPauseEvt);
      video.removeEventListener('ended', onEndedEvt);
    };
  }, [streamUrl]);

  // Auto-hide controls after 3s of no mouse movement (only while playing).
  const resetHideTimer = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setControlsVisible(false);
    }, 3000);
  }, []);

  useEffect(() => () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(
      !!(document.fullscreenElement || (document as any).webkitFullscreenElement),
    );
    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      document.removeEventListener('webkitfullscreenchange', handler);
    };
  }, []);

  // Controls

  const handleUnblockAutoplay = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      await video.play();
      setNeedsGesture(false);
    } catch {
      // Still blocked — leave prompt visible
    }
  };

  const handlePlayPause = () => {
    if (!canControl) return;
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      // Act immediately in the user-gesture context so the browser allows play().
      video.play().catch(() => {});
      onPlay(video.currentTime);
    } else {
      const ts = video.currentTime;
      video.pause();
      onPause(ts);
    }
  };

  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canControl || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = ratio * duration;
    // Seek the local video immediately so the bar snaps responsively.
    if (videoRef.current) videoRef.current.currentTime = newTime;
    onSeek(newTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    setMuted(v === 0);
    if (videoRef.current) {
      videoRef.current.volume = v;
      videoRef.current.muted = v === 0;
    }
  };

  const toggleMute = () => {
    if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    const video = videoRef.current;
    if (!el || !video) return;
    const inFs = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
    if (!inFs) {
      if (el.requestFullscreen) el.requestFullscreen();
      else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen();
      else if ((video as any).webkitEnterFullscreen) (video as any).webkitEnterFullscreen();
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
    }
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const showControls = controlsVisible || !isPlaying;

  if (!streamUrl) {
    return (
      <div style={{
        width: '100%',
        height: nativeHeight ? 'auto' : '100%',
        aspectRatio: nativeHeight ? '16/9' : undefined,
        background: '#000',
        display: idleGameUrl ? undefined : 'flex',
        alignItems: idleGameUrl ? undefined : 'center',
        justifyContent: idleGameUrl ? undefined : 'center',
        color: 'var(--text-faint)',
        fontSize: 15,
        fontWeight: 600,
      }}>
        {idleGameUrl
          ? <iframe
              src={idleGameUrl}
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              allow="autoplay"
            />
          : 'No video selected'}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height: nativeHeight ? 'auto' : '100%', background: '#000' }}
      onMouseMove={resetHideTimer}
      onMouseEnter={resetHideTimer}
      onMouseLeave={() => isPlaying && setControlsVisible(false)}
      onTouchStart={resetHideTimer}
    >
      <video
        ref={videoRef}
        playsInline
        style={{ width: '100%', height: nativeHeight ? 'auto' : '100%', display: 'block' }}
        onClick={handlePlayPause}
        onError={(e) => {
          const code = (e.target as HTMLVideoElement).error?.code;
          setStreamError(`Video error (code ${code}). Check the browser console for details.`);
        }}
      />

      {/* Controls overlay */}
      <div
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          padding: '48px 18px 16px',
          background: 'linear-gradient(transparent, rgba(8,5,3,.82))',
          opacity: showControls ? 1 : 0,
          pointerEvents: showControls ? undefined : 'none',
          transition: 'opacity .2s',
          userSelect: 'none',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}
      >
        {/* Seek bar */}
        <div
          onClick={handleSeekClick}
          style={{
            width: '100%', height: 8, borderRadius: 99,
            background: 'rgba(255,255,255,.24)', position: 'relative',
            cursor: canControl ? 'pointer' : 'default',
          }}
        >
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 99,
            width: `${progress}%`, background: 'var(--accent)',
          }} />
          {canControl && (
            <div style={{
              position: 'absolute', top: '50%', left: `${progress}%`,
              width: 14, height: 14, borderRadius: '50%', background: '#fff',
              transform: 'translate(-50%, -50%)',
              boxShadow: '0 2px 6px rgba(0,0,0,.4)',
            }} />
          )}
        </div>

        {/* Button row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#fff' }}>
          {/* Play / Pause */}
          <button
            onClick={handlePlayPause}
            disabled={!canControl}
            title={canControl ? undefined : 'Only the host can control playback'}
            style={{ background: 'none', border: 'none', color: '#fff', padding: 4, opacity: canControl ? 1 : 0.3, display: 'grid', placeItems: 'center', flexShrink: 0 }}
          >
            {isPlaying ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="5" width="4" height="14" rx="1.5" /><rect x="14" y="5" width="4" height="14" rx="1.5" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6 4 20 12 6 20 6 4" />
              </svg>
            )}
          </button>

          {/* Timestamp */}
          <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'rgba(255,255,255,.9)', flexShrink: 0 }}>
            {formatTime(currentTime)}
            {duration > 0 && <span style={{ color: 'rgba(255,255,255,.5)' }}> / {formatTime(duration)}</span>}
          </span>

          <div style={{ flex: 1 }} />

          {/* Host indicator */}
          {isHost && (
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,.7)', display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Host controls
            </span>
          )}

          {/* Subtitle track selector */}
          {subtitleTracks.length > 0 && (
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button
                onClick={() => setShowSubtitleMenu((s) => !s)}
                title="Subtitles"
                style={{
                  background: selectedTrackIndex !== null ? 'var(--accent)' : 'rgba(255,255,255,.15)',
                  border: 'none', color: '#fff',
                  padding: '4px 8px', borderRadius: 6,
                  fontWeight: 800, fontSize: 11, letterSpacing: '.06em',
                  cursor: 'pointer', lineHeight: 1,
                }}
              >
                CC
              </button>
              {showSubtitleMenu && (
                <div style={{
                  position: 'absolute', bottom: 'calc(100% + 8px)', right: 0,
                  background: 'rgba(12,9,7,0.96)', border: '1px solid rgba(255,255,255,.12)',
                  borderRadius: 10, padding: '5px 0', minWidth: 160,
                  backdropFilter: 'blur(12px)',
                  boxShadow: '0 8px 24px rgba(0,0,0,.5)',
                  maxHeight: 226, overflowY: 'auto',
                }}>
                  {[{ index: null as number | null, displayTitle: 'Off' }, ...subtitleTracks].map((t) => (
                    <button
                      key={t.index ?? 'off'}
                      onClick={() => { setSelectedTrackIndex(t.index); setShowSubtitleMenu(false); }}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '8px 14px', background: 'none', border: 'none',
                        color: selectedTrackIndex === t.index ? 'var(--accent)' : 'rgba(255,255,255,.85)',
                        fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      {t.displayTitle}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Mute + volume */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button onClick={toggleMute} style={{ background: 'none', border: 'none', color: '#fff', padding: 4, display: 'grid', placeItems: 'center' }}>
              {muted || volume === 0 ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5 6 9H2v6h4l5 4V5Z" fill="currentColor" stroke="none" />
                  <line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : volume < 0.5 ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.02"
              value={muted ? 0 : volume}
              onChange={handleVolumeChange}
              className="video-volume-slider"
              style={{ width: 80, cursor: 'pointer', accentColor: 'var(--accent)' }}
            />
          </div>

          {/* Fullscreen / sidebar toggle */}
          {onToggleSidebar ? (
            // Discord mode: native fullscreen is blocked; repurpose to toggle the sidebar
            <button
              onClick={onToggleSidebar}
              title={sidebarHidden ? 'Show sidebar' : 'Hide sidebar'}
              style={{ background: 'none', border: 'none', color: '#fff', padding: 4, display: 'grid', placeItems: 'center', flexShrink: 0 }}
            >
              {sidebarHidden ? (
                // Sidebar hidden → show compress icon (restore sidebar)
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/>
                  <path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>
                </svg>
              ) : (
                // Sidebar visible → show expand icon (hide sidebar for more video)
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
                  <path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
                </svg>
              )}
            </button>
          ) : (
            <button onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} style={{ background: 'none', border: 'none', color: '#fff', padding: 4, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              {isFullscreen ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/>
                  <path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
                  <path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Subtitle overlay */}
      {activeCue && (
        <div style={{
          position: 'absolute', bottom: showControls ? 88 : 28,
          left: 0, right: 0,
          display: 'flex', justifyContent: 'center',
          padding: '0 8%', pointerEvents: 'none',
          transition: 'bottom .2s',
        }}>
          <div style={{
            background: 'rgba(0,0,0,0.78)',
            color: '#fff', padding: '5px 14px',
            borderRadius: 6, fontSize: 17, fontWeight: 600,
            lineHeight: 1.45, textAlign: 'center', whiteSpace: 'pre-line',
            textShadow: '0 1px 4px rgba(0,0,0,.6)',
          }}>
            {activeCue}
          </div>
        </div>
      )}

      {/* Buffering spinner */}
      {isBuffering && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <svg width="52" height="52" viewBox="0 0 52 52" fill="none" style={{ animation: 'spin 0.75s linear infinite' }}>
            <circle cx="26" cy="26" r="22" stroke="rgba(255,255,255,0.18)" strokeWidth="4" />
            <path d="M48 26a22 22 0 0 0-22-22" stroke="white" strokeWidth="4" strokeLinecap="round" />
          </svg>
        </div>
      )}

      {/* Sync pill */}
      {(() => {
        const absDrift = Math.abs(syncDrift);
        const outOfSync = !isHost && isPlaying && absDrift >= SYNC_TOLERANCE_PLAYING;
        const dotColor = !isPlaying
          ? 'rgba(255,255,255,0.3)'
          : outOfSync ? '#f5a623' : 'var(--online)';
        const label = !isPlaying
          ? 'Paused'
          : outOfSync
            ? `${absDrift.toFixed(1)}s ${syncDrift < 0 ? 'behind' : 'ahead'}`
            : 'In sync';
        return (
          <div
            onClick={outOfSync ? () => {
              const video = videoRef.current;
              const pb = playbackRef.current;
              if (!video) return;
              const expected = pb.timestamp + (Date.now() - pb.lastSyncedAt) / 1000;
              const clamped = isFinite(video.duration) && video.duration > 0
                ? Math.max(0, Math.min(expected, video.duration))
                : Math.max(0, expected);
              video.currentTime = clamped;
            } : undefined}
            style={{
              position: 'absolute', top: 16, left: 16,
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '7px 13px', borderRadius: 99,
              background: 'rgba(10,7,5,.5)', backdropFilter: 'blur(8px)',
              color: '#fff', fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap',
              opacity: showControls || outOfSync ? 1 : 0, transition: 'opacity .2s',
              pointerEvents: outOfSync ? 'auto' : 'none',
              cursor: outOfSync ? 'pointer' : 'default',
            }}
          >
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: dotColor,
              animation: outOfSync ? undefined : 'blink 2s infinite',
              transition: 'background .4s',
            }} />
            {label}
            {outOfSync && (
              <span style={{ fontSize: 11, opacity: 0.75, marginLeft: 2 }}>· tap to sync</span>
            )}
          </div>
        );
      })()}

      {showStats && (
        <div style={{
          position: 'absolute', top: 12, right: 12,
          background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)',
          borderRadius: 8, padding: '10px 14px', minWidth: 210, maxWidth: 280,
          pointerEvents: 'none', zIndex: 5,
          fontFamily: 'monospace', fontSize: 11.5,
          lineHeight: 1.8,
        }}>
          {/* helpers */}
          {(() => {
            const hd = (label: string, value: string | null | undefined) => value ? (
              <div key={label} style={{ display: 'flex', gap: 10 }}>
                <span style={{ minWidth: 68, color: 'rgba(255,255,255,0.45)', fontWeight: 700, letterSpacing: '.04em', flexShrink: 0 }}>{label}</span>
                <span style={{ color: '#fff' }}>{value}</span>
              </div>
            ) : null;
            const sec = (title: string) => (
              <div style={{ color: 'var(--accent)', fontWeight: 800, fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', marginTop: 8, marginBottom: 1 }}>{title}</div>
            );
            const v = mediaInfo?.video;
            const a = mediaInfo?.audio;
            return (
              <>
                {v && (<>
                  {sec('Video')}
                  {hd('CODEC', mediaInfo?.isVideoTranscoded
                    ? `${(v.codec ?? '').toUpperCase()} → H.264`
                    : (v.codec ?? '').toUpperCase())}
                  {hd('RES', v.width && v.height ? `${v.width} × ${v.height}` : null)}
                  {hd('FPS', v.fps !== null ? String(v.fps) : null)}
                  {hd('BITRATE', v.bitrate !== null ? fmtBitrate(v.bitrate) : null)}
                  {hd('PROFILE', v.profile)}
                  {hd('DEPTH', v.bitDepth !== null ? `${v.bitDepth}-bit` : null)}
                  {hd('FORMAT', [v.pixelFormat, v.colorSpace].filter(Boolean).join(' · ') || null)}
                </>)}
                {a && (<>
                  {sec('Audio')}
                  {hd('CODEC', mediaInfo?.isAudioTranscoded
                    ? `${(a.codec ?? '').toUpperCase()} → AAC`
                    : [a.codec?.toUpperCase(), a.profile].filter(Boolean).join(' '))}
                  {hd('LAYOUT', [a.channelLayout, a.channels !== null ? `${a.channels} ch` : null].filter(Boolean).join(' · ') || null)}
                  {hd('RATE', a.sampleRate !== null ? `${(a.sampleRate / 1000).toFixed(1)} kHz` : null)}
                  {hd('BITRATE', a.bitrate !== null ? fmtBitrate(a.bitrate) : null)}
                </>)}
                {sec('Stream')}
                {hd('CONTAINER', mediaInfo?.container?.toUpperCase() ?? null)}
                {hd('MODE', mediaInfo ? (mediaInfo.isDirectStream ? 'Direct' : 'HLS') : (isHls ? 'HLS' : 'Direct'))}
                {hd('BUFFER', `${liveStats.bufferAhead.toFixed(1)} s`)}
                {liveStats.bandwidth > 0 && hd('BANDWIDTH', fmtBitrate(liveStats.bandwidth))}
                {hd('DROPPED', `${liveStats.droppedFrames} frames`)}
              </>
            );
          })()}
        </div>
      )}

      {needsGesture && (
        <div
          onClick={handleUnblockAutoplay}
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)', cursor: 'pointer',
          }}
        >
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)',
            display: 'grid', placeItems: 'center', marginBottom: 14,
          }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="white">
              <polygon points="6 4 20 12 6 20 6 4" />
            </svg>
          </div>
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0, textShadow: '0 1px 4px rgba(0,0,0,.5)' }}>
            Tap to start
          </p>
        </div>
      )}

      {streamError && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.8)', padding: 24, pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#f87171', fontWeight: 700, marginBottom: 6 }}>Playback error</p>
            <p style={{ color: 'rgba(255,255,255,.7)', fontSize: 14, marginBottom: 4 }}>{streamError}</p>
            <p style={{ color: 'rgba(255,255,255,.35)', fontSize: 12 }}>Check the server terminal and browser console for details.</p>
          </div>
        </div>
      )}
    </div>
  );
}
