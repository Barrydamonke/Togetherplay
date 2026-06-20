export type AspectRatio = 'auto' | '16/9' | '4/3' | '2.39/1';

export interface JellyfinMediaInfo {
  container: string | null;
  isDirectStream: boolean;
  isVideoTranscoded: boolean;
  isAudioTranscoded: boolean;
  video: {
    codec: string | null;
    profile: string | null;
    width: number | null;
    height: number | null;
    fps: number | null;
    bitrate: number | null;
    bitDepth: number | null;
    colorSpace: string | null;
    colorTransfer: string | null;
    pixelFormat: string | null;
  } | null;
  audio: {
    codec: string | null;
    profile: string | null;
    channels: number | null;
    channelLayout: string | null;
    sampleRate: number | null;
    bitrate: number | null;
  } | null;
}

export interface Member {
  id: string;
  username: string;
  isHost: boolean;
}

export interface Video {
  id: string;
  title: string;
  source: 'jellyfin' | 'upload';
  streamUrl: string;
  isHls?: boolean;
  thumbnailUrl?: string;
  duration?: number;
  jellyfinId?: string;
}

export interface PlaybackState {
  playing: boolean;
  timestamp: number;
  lastSyncedAt: number;
}

export interface ChatMessage {
  id: string;
  memberId: string;
  username: string;
  text: string;
  sentAt: number;
  videoTimestamp?: number;
  type?: 'system';
}

export interface Room {
  pin: string;
  hostId: string;
  hidden: boolean;
  viewerCanManageQueue: boolean;
  viewerCanControl: boolean;
  idleGameUrl?: string;
  members: Member[];
  queue: Video[];
  currentVideoIndex: number;
  playback: PlaybackState;
  chat: ChatMessage[];
}
