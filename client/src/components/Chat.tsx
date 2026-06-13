import { useEffect, useRef, useState } from 'react';
import { ChatMessage } from '../types';

interface Props {
  messages: ChatMessage[];
  currentMemberId: string;
  onSend: (text: string) => void;
}

export function Chat({ messages, currentMemberId, onSend }: Props) {
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  }

  return (
    <div className="flex flex-col h-64 border-t border-gray-700">
      <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
        Chat
      </div>

      <div className="flex-1 overflow-y-auto px-3 space-y-1 min-h-0">
        {messages.map((msg) => (
          <div key={msg.id} className="text-sm">
            <span
              className={
                msg.memberId === currentMemberId
                  ? 'font-semibold text-indigo-400'
                  : 'font-semibold text-gray-300'
              }
            >
              {msg.username}
            </span>
            <span className="text-gray-400 ml-1">{msg.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 p-2">
        <input
          className="flex-1 px-3 py-1.5 text-sm bg-gray-700 text-white rounded-lg outline-none focus:ring-1 focus:ring-indigo-500"
          placeholder="Say something…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          maxLength={500}
        />
        <button
          onClick={send}
          className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
