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
}

export interface Room {
  pin: string;
  hostId: string;
  members: Member[];
  queue: Video[];
  currentVideoIndex: number;
  playback: PlaybackState;
  chat: ChatMessage[];
}
