import { useRef, useState } from 'react';
import { Icon } from './Icon';

interface Props {
  roomPin: string;
  onClose: () => void;
}

type SuggestionType = 'media' | 'feature' | 'bug';

const TYPES: { id: SuggestionType; label: string; description: string; icon: string; color: string }[] = [
  { id: 'media',   label: 'Suggest media',   description: 'A film, show, or video you want to watch',  icon: 'play',      color: '#5865F2' },
  { id: 'feature', label: 'Suggest a feature', description: 'An idea to make the app better',           icon: 'lightbulb', color: '#3BA55C' },
  { id: 'bug',     label: 'Report a bug',    description: "Something that's broken or not working",     icon: 'flag',      color: '#ED4245' },
];

export function SuggestionsModal({ roomPin, onClose }: Props) {
  const [type, setType] = useState<SuggestionType | null>(null);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSend() {
    if (!type || !message.trim()) return;
    setErrorMsg('');
    setStatus('sending');
    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, message: message.trim(), roomPin }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Server error ${res.status}`);
      }
      setStatus('sent');
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStatus('error');
    }
  }

  const selected = TYPES.find(t => t.id === type);
  const canSend = type !== null && message.trim().length > 0 && (status === 'idle' || status === 'error');
  const scrimDown = useRef(false);

  return (
    <div
      onMouseDown={(e) => { scrimDown.current = e.target === e.currentTarget; }}
      onMouseUp={(e) => { if (scrimDown.current && e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'grid', placeItems: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-xl)', padding: 28,
          boxShadow: 'var(--shadow)',
          display: 'flex', flexDirection: 'column', gap: 22,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img
              src="/suggestionbox.png"
              alt=""
              style={{ display: 'block', width: 80, height: 80, objectFit: 'contain', flexShrink: 0 }}
            />
            <div>
              <h2 className="font-display" style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
                Suggestions
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-dim)', fontWeight: 600 }}>
                Got an idea or spotted something broken?
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', padding: 4 }}
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {status === 'sent' ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Thanks for the suggestion!</p>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-dim)', fontWeight: 600 }}>We'll take a look.</p>
            <button
              onClick={onClose}
              style={{
                marginTop: 20, padding: '10px 28px', borderRadius: 99, border: 'none',
                background: 'var(--accent)', color: 'var(--accent-ink)',
                fontWeight: 800, fontSize: 14, cursor: 'pointer',
              }}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Type picker */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
                What kind of suggestion?
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {TYPES.map(t => {
                  const isSelected = type === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => { setType(t.id); if (status === 'error') setStatus('idle'); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        padding: '12px 16px', borderRadius: 'var(--r-md)',
                        border: `1.5px solid ${isSelected ? t.color : 'var(--border)'}`,
                        background: isSelected ? `${t.color}18` : 'var(--surface-2)',
                        cursor: 'pointer', textAlign: 'left', transition: 'border-color .15s, background .15s',
                      }}
                    >
                      <span style={{
                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                        background: isSelected ? `${t.color}30` : 'var(--surface)',
                        border: `1px solid ${isSelected ? t.color : 'var(--border)'}`,
                        display: 'grid', placeItems: 'center',
                        color: isSelected ? t.color : 'var(--text-dim)',
                        transition: 'background .15s, color .15s',
                      }}>
                        <Icon name={t.icon} size={16} stroke={2} />
                      </span>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: isSelected ? t.color : 'var(--text)' }}>
                          {t.label}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600, marginTop: 2 }}>
                          {t.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Message */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
                {selected ? `Tell us about your ${selected.id === 'bug' ? 'bug' : 'idea'}` : 'Tell us more'}
              </span>
              <textarea
                value={message}
                onChange={e => { setMessage(e.target.value); if (status === 'error') setStatus('idle'); }}
                placeholder={
                  type === 'media' ? 'What do you want to watch?' :
                  type === 'feature' ? 'What would you like to see added or changed?' :
                  type === 'bug' ? 'What happened? What were you doing when it broke?' :
                  'Describe your suggestion…'
                }
                maxLength={1000}
                rows={4}
                style={{
                  width: '100%', padding: '11px 13px', borderRadius: 'var(--r-md)',
                  border: '1.5px solid var(--border)', background: 'var(--surface-2)',
                  color: 'var(--text)', fontSize: 14, fontWeight: 600, outline: 'none',
                  fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5,
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 600, textAlign: 'right' }}>
                {message.length} / 1000
              </span>
            </div>

            {/* Error */}
            {status === 'error' && (
              <div style={{
                padding: '9px 13px', borderRadius: 'var(--r-sm)',
                background: 'var(--accent-soft)', border: '1px solid var(--accent)',
                fontSize: 13, fontWeight: 700, color: 'var(--accent)',
              }}>
                {errorMsg || 'Something went wrong. Try again.'}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={onClose}
                style={{
                  padding: '10px 20px', borderRadius: 99,
                  border: '1.5px solid var(--border)', background: 'none',
                  color: 'var(--text-dim)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={!canSend}
                style={{
                  padding: '10px 24px', borderRadius: 99, border: 'none',
                  background: 'var(--accent)', color: 'var(--accent-ink)',
                  fontWeight: 800, fontSize: 14,
                  opacity: canSend ? 1 : 0.45,
                  cursor: canSend ? 'pointer' : 'default',
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                }}
              >
                <Icon name="send" size={14} />
                {status === 'sending' ? 'Sending…' : 'Send'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
