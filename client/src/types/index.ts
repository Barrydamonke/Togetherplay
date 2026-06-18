export type AspectRatio = 'auto' | '16/9' | '4/3' | '2.39/1';

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
  members: Member[];
  queue: Video[];
  currentVideoIndex: number;
  playback: PlaybackState;
  chat: ChatMessage[];
}
