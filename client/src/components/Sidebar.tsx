import { useState } from 'react';
import { Room, Video } from '../types';
import { JellyfinBrowser } from './JellyfinBrowser';

interface Props {
  room: Room;
  isHost: boolean;
  onSetCurrentVideo: (index: number) => void;
  onRemoveFromQueue: (index: number) => void;
  onAddVideo: (video: Video) => void;
}

export function Sidebar({ room, isHost, onSetCurrentVideo, onRemoveFromQueue, onAddVideo }: Props) {
  const [showBrowser, setShowBrowser] = useState(false);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Room info */}
      <div className="px-4 py-3 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Room PIN</span>
          <span className="text-lg font-bold text-white tracking-widest">{room.pin}</span>
        </div>
      </div>

      {/* Members */}
      <div className="px-4 py-2 border-b border-gray-700">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
          Members ({room.members.length})
        </p>
        <div className="space-y-0.5">
          {room.members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
              <span className="text-gray-200 truncate">{m.username}</span>
              {m.isHost && (
                <span className="ml-auto text-xs text-indigo-400 font-medium">host</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Queue */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="flex items-center justify-between px-4 py-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Queue</p>
          {isHost && (
            <button
              onClick={() => setShowBrowser(true)}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              + Add
            </button>
          )}
        </div>

        {room.queue.length === 0 && (
          <p className="text-gray-600 text-sm text-center py-4 px-4">
            {isHost ? 'Add something to watch.' : 'Queue is empty.'}
          </p>
        )}

        <div className="space-y-1 px-2 pb-2">
          {room.queue.map((video, index) => {
            const isCurrent = index === room.currentVideoIndex;
            return (
              <div
                key={video.id}
                className={`flex items-center gap-2 p-2 rounded-lg group ${
                  isCurrent ? 'bg-indigo-900/40 ring-1 ring-indigo-500' : 'hover:bg-gray-700'
                }`}
              >
                {video.thumbnailUrl && (
                  <img
                    src={video.thumbnailUrl}
                    alt=""
                    className="w-8 h-10 object-cover rounded flex-shrink-0 bg-gray-700"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{video.title}</p>
                  {isCurrent && (
                    <p className="text-xs text-indigo-400">Now playing</p>
                  )}
                </div>
                {isHost && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!isCurrent && (
                      <button
                        onClick={() => onSetCurrentVideo(index)}
                        className="text-xs text-gray-400 hover:text-white px-1.5 py-0.5 rounded bg-gray-600"
                      >
                        Play
                      </button>
                    )}
                    <button
                      onClick={() => onRemoveFromQueue(index)}
                      className="text-xs text-gray-400 hover:text-red-400 px-1.5 py-0.5 rounded bg-gray-600"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {showBrowser && (
        <JellyfinBrowser
          onAdd={(video) => {
            onAddVideo(video);
            setShowBrowser(false);
          }}
          onClose={() => setShowBrowser(false)}
        />
      )}
    </div>
  );
}
