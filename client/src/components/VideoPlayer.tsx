import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { PlaybackState } from '../types';

interface Props {
  streamUrl: string | null;
  isHls?: boolean;
  knownDuration?: number; // seconds from Jellyfin metadata, used before loadedmetadata fires
  playback: PlaybackState;
  isHost: boolean;
  onPlay: (timestamp: number) => void;
  onPause: (timestamp: number) => void;
  onSeek: (timestamp: number) => void;
}

const SYNC_TOLERANCE_SECONDS = 2;

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function VideoPlayer({ streamUrl, isHls = true, knownDuration, playback, isHost, onPlay, onPause, onSeek }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const syncingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [streamError, setStreamError] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(knownDuration ?? 0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

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
    hlsRef.current?.destroy();
    hlsRef.current = null;
    video.src = '';

    if (isHls) {
      if (Hls.isSupported()) {
        const hls = new Hls();
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            setStreamError(`HLS error (${data.details}): ${data.type}`);
            console.error('HLS fatal error', data);
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
        const target = playback.playing
          ? playback.timestamp + (Date.now() - playback.lastSyncedAt) / 1000
          : playback.timestamp;

        if (Math.abs(video.currentTime - target) > SYNC_TOLERANCE_SECONDS) {
          video.currentTime = target;
        }

        if (playback.playing && video.paused) {
          try {
            await video.play();
          } catch (err) {
            console.error('video.play() rejected:', err);
            setStreamError(`Playback blocked: ${(err as Error).message}. Try clicking the play button.`);
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

  // Mirror native video state into React for the custom controls UI.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const readDuration = () => {
      if (isFinite(video.duration) && video.duration > 0) setDuration(video.duration);
    };
    const onTimeUpdate = () => { setCurrentTime(video.currentTime); readDuration(); };
    const onSeeked = () => setCurrentTime(video.currentTime);
    const onLoadedMetadata = () => readDuration();
    const onDurationChange = () => readDuration();
    const onCanPlay = () => readDuration();
    const onVolumeChange = () => { setVolume(video.volume); setMuted(video.muted); };
    const onPlayEvt = () => setIsPlaying(true);
    const onPauseEvt = () => setIsPlaying(false);

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('volumechange', onVolumeChange);
    video.addEventListener('play', onPlayEvt);
    video.addEventListener('pause', onPauseEvt);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('volumechange', onVolumeChange);
      video.removeEventListener('play', onPlayEvt);
      video.removeEventListener('pause', onPauseEvt);
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

  // Controls

  const handlePlayPause = () => {
    if (!isHost) return;
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) onPlay(video.currentTime);
    else onPause(video.currentTime);
  };

  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isHost || !duration) return;
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
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen();
    else document.exitFullscreen();
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const showControls = controlsVisible || !isPlaying;

  if (!streamUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black text-gray-500">
        No video selected
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black"
      onMouseMove={resetHideTimer}
      onMouseEnter={resetHideTimer}
      onMouseLeave={() => isPlaying && setControlsVisible(false)}
    >
      <video
        ref={videoRef}
        className="w-full h-full"
        onClick={handlePlayPause}
        onError={(e) => {
          const code = (e.target as HTMLVideoElement).error?.code;
          setStreamError(`Video error (code ${code}). Check the browser console for details.`);
        }}
      />

      {/* Controls overlay */}
      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-4 pt-10 pb-3 transition-opacity duration-200 select-none ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Seek bar */}
        <div
          className={`w-full h-1 bg-white/25 rounded-full mb-3 relative group/seek ${
            isHost ? 'cursor-pointer hover:h-1.5 transition-all' : 'cursor-default'
          }`}
          onClick={handleSeekClick}
        >
          <div
            className="h-full bg-indigo-500 rounded-full pointer-events-none"
            style={{ width: `${progress}%` }}
          />
          {isHost && (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover/seek:opacity-100 -translate-x-1/2 transition-opacity pointer-events-none"
              style={{ left: `${progress}%` }}
            />
          )}
        </div>

        {/* Button row */}
        <div className="flex items-center gap-3">
          {/* Play / Pause */}
          <button
            onClick={handlePlayPause}
            disabled={!isHost}
            title={isHost ? undefined : 'Only the host can control playback'}
            className="text-white disabled:opacity-30 disabled:cursor-not-allowed hover:text-indigo-300 transition-colors flex-shrink-0"
          >
            {isPlaying ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Timestamp */}
          <span className="text-white/80 text-xs tabular-nums flex-shrink-0">
            {formatTime(currentTime)}{duration > 0 ? ` / ${formatTime(duration)}` : ''}
          </span>

          <div className="flex-1" />

          {/* Mute + volume */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleMute}
              className="text-white hover:text-indigo-300 transition-colors flex-shrink-0"
            >
              {muted || volume === 0 ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                </svg>
              ) : volume < 0.5 ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
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
              className="w-20 accent-indigo-500 cursor-pointer"
            />
          </div>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="text-white hover:text-indigo-300 transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
            </svg>
          </button>
        </div>
      </div>

      {streamError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 pointer-events-none">
          <div className="text-center space-y-2">
            <p className="text-red-400 font-medium">Playback error</p>
            <p className="text-gray-300 text-sm">{streamError}</p>
            <p className="text-gray-500 text-xs">Check the server terminal and browser console for details.</p>
          </div>
        </div>
      )}
    </div>
  );
}
