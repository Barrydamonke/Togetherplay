import { useState } from 'react';
import { getSocket } from '../lib/socket';
import { Room } from '../types';

interface Props {
  onJoined: (room: Room, isHost: boolean, memberId: string) => void;
}

export function Landing({ onJoined }: Props) {
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function submit() {
    const trimmed = username.trim();
    if (!trimmed) { setError('Enter a username.'); return; }
    if (mode === 'join' && pin.length !== 4) { setError('PIN must be 4 digits.'); return; }

    setLoading(true);
    setError('');

    const socket = getSocket();

    const cleanup = () => {
      socket.off('room:joined');
      socket.off('room:error');
    };

    socket.once('room:joined', ({ room, isHost }: { room: Room; isHost: boolean }) => {
      cleanup();
      setLoading(false);
      onJoined(room, isHost, socket.id ?? '');
    });

    socket.once('room:error', ({ message }: { message: string }) => {
      cleanup();
      setLoading(false);
      setError(message);
    });

    if (mode === 'create') {
      socket.emit('room:create', { username: trimmed });
    } else {
      socket.emit('room:join', { pin, username: trimmed });
    }
  }

  if (mode === 'choose') {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <div className="text-center space-y-6">
          <h1 className="text-4xl font-bold text-white">Togetherness</h1>
          <p className="text-gray-400">Watch together, wherever you are.</p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => setMode('create')}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors"
            >
              Create Room
            </button>
            <button
              onClick={() => setMode('join')}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
            >
              Join Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-gray-900">
      <div className="w-full max-w-sm space-y-4 p-8 bg-gray-800 rounded-xl">
        <h2 className="text-2xl font-bold text-white">
          {mode === 'create' ? 'Create a Room' : 'Join a Room'}
        </h2>

        <div className="space-y-3">
          <input
            className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Your name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            maxLength={32}
          />

          {mode === 'join' && (
            <input
              className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-center text-2xl tracking-widest"
              placeholder="0000"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              maxLength={4}
            />
          )}
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={() => setMode('choose')}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Back
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
          >
            {loading ? 'Connecting…' : mode === 'create' ? 'Create' : 'Join'}
          </button>
        </div>
      </div>
    </div>
  );
}
