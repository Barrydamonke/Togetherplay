import { useState, useEffect, CSSProperties } from 'react';
import { Icon } from './Icon';
import { useUpdateCheck } from '../lib/useUpdateCheck';

interface Props {
  onClose: () => void;
}

interface Config {
  jellyfinUrl: string;
  jellyfinApiKey: string;
  jellyfinUserId: string;
  uploadServiceUrl: string;
  githubRepoUrl: string;
  landingMessage: string;
  suggestionWebhookUrl: string;
}

const inputStyle: CSSProperties = {
  width: '100%', padding: '11px 13px', borderRadius: 10,
  border: '1.5px solid var(--border)', background: 'var(--surface-2)',
  color: 'var(--text)', fontSize: 14, fontWeight: 600, outline: 'none',
  fontFamily: 'inherit',
};

const labelStyle: CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 800,
  letterSpacing: '.05em', textTransform: 'uppercase',
  color: 'var(--text-faint)', marginBottom: 6,
};

const sectionHeadStyle: CSSProperties = {
  fontSize: 11, fontWeight: 800, letterSpacing: '.06em',
  textTransform: 'uppercase', color: 'var(--text-faint)',
  display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
};

function Field({
  label, value, onChange, placeholder, type = 'text', mono = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
}) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';

  return (
    <label style={{ display: 'block' }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ position: 'relative' }}>
        <input
          type={isPassword && !show ? 'password' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          style={{
            ...inputStyle,
            fontFamily: mono || isPassword ? 'monospace' : 'inherit',
            paddingRight: isPassword ? 44 : 13,
          }}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            title={show ? 'Hide' : 'Show'}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', padding: 4,
              color: 'var(--text-faint)', cursor: 'pointer', display: 'grid', placeItems: 'center',
            }}
          >
            {show ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        )}
      </div>
    </label>
  );
}

function SectionHead({ label }: { label: string }) {
  return (
    <div style={sectionHeadStyle}>
      <span>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );
}

export function AdminPanel({ onClose }: Props) {
  const [phase, setPhase] = useState<'login' | 'settings'>('login');
  const [password, setPassword] = useState('');
  const [authedPassword, setAuthedPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [config, setConfig] = useState<Config>({
    jellyfinUrl: '', jellyfinApiKey: '', jellyfinUserId: '', uploadServiceUrl: '',
    githubRepoUrl: '', landingMessage: '', suggestionWebhookUrl: '',
  });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const updateCheck = useUpdateCheck(config.githubRepoUrl);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  async function handleLogin() {
    if (!password) return;
    setLoginLoading(true);
    setLoginError('');
    try {
      const authRes = await fetch('/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!authRes.ok) {
        const data = await authRes.json() as { error: string };
        setLoginError(data.error ?? 'Wrong password.');
        return;
      }
      const cfgRes = await fetch('/admin/config', {
        headers: { 'x-admin-password': password },
      });
      const cfg = await cfgRes.json() as Config;
      setConfig(cfg);
      setAuthedPassword(password);
      setPhase('settings');
    } catch {
      setLoginError('Network error — is the server running?');
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleSave() {
    setSaveStatus('saving');
    try {
      const res = await fetch('/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': authedPassword },
        body: JSON.stringify(config),
      });
      setSaveStatus(res.ok ? 'saved' : 'error');
      if (res.ok) setTimeout(() => setSaveStatus('idle'), 2500);
    } catch {
      setSaveStatus('error');
    }
  }

  function patch(key: keyof Config) {
    return (v: string) => setConfig((c) => ({ ...c, [key]: v }));
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'var(--scrim)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      {phase === 'login' ? (
        <div className="animate-pop-in" style={{
          width: '100%', maxWidth: 380,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-xl)', padding: 30, boxShadow: 'var(--shadow)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 26 }}>
            <span style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'var(--accent-soft)', color: 'var(--accent)',
              display: 'grid', placeItems: 'center', flexShrink: 0,
            }}>
              <Icon name="lock" size={20} />
            </span>
            <div>
              <h2 className="font-display" style={{ fontSize: 22, fontWeight: 600, margin: 0, color: 'var(--text)' }}>
                Admin Login
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-dim)', fontWeight: 600 }}>
                Enter the admin password to continue.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input
              type="password"
              placeholder="Password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              style={inputStyle}
            />

            {loginError && (
              <div style={{
                fontSize: 13, color: 'var(--accent)', fontWeight: 700,
                background: 'var(--accent-soft)', padding: '9px 13px', borderRadius: 8,
              }}>
                {loginError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
              <button
                onClick={onClose}
                style={{
                  padding: '11px 18px', borderRadius: 10,
                  border: '1.5px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--text)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleLogin}
                disabled={loginLoading || !password}
                style={{
                  flex: 1, padding: '11px 18px', borderRadius: 10, border: 'none',
                  background: 'var(--accent)', color: 'var(--accent-ink)',
                  fontWeight: 800, fontSize: 14, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  opacity: loginLoading || !password ? 0.55 : 1,
                  boxShadow: '0 8px 20px -8px var(--accent)',
                }}
              >
                {loginLoading ? 'Checking…' : (
                  <><span>Login</span><Icon name="chevron" size={16} /></>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="animate-pop-in" style={{
          width: '100%', maxWidth: 520,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-xl)', padding: 30, boxShadow: 'var(--shadow)',
          maxHeight: '90vh', overflowY: 'auto',
        }}>
          {/* Panel header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <span style={{
                width: 44, height: 44, borderRadius: 12,
                background: 'var(--accent-soft)', color: 'var(--accent)',
                display: 'grid', placeItems: 'center', flexShrink: 0,
              }}>
                <Icon name="settings" size={20} />
              </span>
              <div>
                <h2 className="font-display" style={{ fontSize: 22, fontWeight: 600, margin: 0, color: 'var(--text)' }}>
                  Admin Panel
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-dim)', fontWeight: 600 }}>
                  Server configuration
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              title="Close"
              style={{
                width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center',
                border: '1px solid var(--border)', background: 'var(--surface-2)',
                color: 'var(--text-dim)', cursor: 'pointer',
              }}
            >
              <Icon name="close" size={15} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {/* Update status */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', borderRadius: 10,
              background: updateCheck.status === 'update-available' ? 'var(--accent-soft)' : 'var(--surface-2)',
              border: `1.5px solid ${updateCheck.status === 'update-available' ? 'var(--accent)' : 'var(--border)'}`,
              gap: 10,
            }}>
              {updateCheck.status === 'update-available' && (
                <>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
                    Version {updateCheck.latestVersion} is available
                  </span>
                  <a
                    href={updateCheck.releaseUrl ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 13, fontWeight: 800, color: 'var(--accent)',
                      textDecoration: 'none', flexShrink: 0,
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    View release ↗
                  </a>
                </>
              )}
              {updateCheck.status === 'up-to-date' && (
                <>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)' }}>
                    Up to date{updateCheck.lastChecked
                      ? ` as of ${new Date(updateCheck.lastChecked).toLocaleString()}`
                      : ''}
                  </span>
                  <button
                    onClick={updateCheck.recheck}
                    style={{
                      fontSize: 12, fontWeight: 700, color: 'var(--text-dim)',
                      background: 'none', border: '1px solid var(--border)',
                      padding: '4px 10px', borderRadius: 6, cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    Check now
                  </button>
                </>
              )}
              {updateCheck.status === 'checking' && (
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-faint)' }}>
                  Checking for updates…
                </span>
              )}
              {updateCheck.status === 'error' && (
                <>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)' }}>
                    Couldn't check for updates
                  </span>
                  <button
                    onClick={updateCheck.recheck}
                    style={{
                      fontSize: 12, fontWeight: 700, color: 'var(--text-dim)',
                      background: 'none', border: '1px solid var(--border)',
                      padding: '4px 10px', borderRadius: 6, cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    Try again
                  </button>
                </>
              )}
            </div>

            {/* Jellyfin section */}
            <section>
              <SectionHead label="Jellyfin" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field
                  label="Server URL"
                  value={config.jellyfinUrl}
                  onChange={patch('jellyfinUrl')}
                  placeholder="https://media.example.com"
                />
                <Field
                  label="API Key"
                  value={config.jellyfinApiKey}
                  onChange={patch('jellyfinApiKey')}
                  placeholder="your_api_key"
                  type="password"
                  mono
                />
                <Field
                  label="User ID"
                  value={config.jellyfinUserId}
                  onChange={patch('jellyfinUserId')}
                  placeholder="your_user_id"
                  mono
                />
              </div>
            </section>

            {/* Upload service section */}
            <section>
              <SectionHead label="Upload Service" />
              <Field
                label="Service URL"
                value={config.uploadServiceUrl}
                onChange={patch('uploadServiceUrl')}
                placeholder="https://uploads.example.com"
              />
            </section>

            {/* Updates section */}
            <section>
              <SectionHead label="Updates" />
              <Field
                label="GitHub Repository URL"
                value={config.githubRepoUrl}
                onChange={patch('githubRepoUrl')}
                placeholder="https://github.com/Barrydamonke/Togetherplay"
              />
            </section>

            {/* Suggestions section */}
            <section>
              <SectionHead label="Suggestions" />
              <Field
                label="Discord Webhook URL"
                value={config.suggestionWebhookUrl}
                onChange={patch('suggestionWebhookUrl')}
                placeholder="https://discord.com/api/webhooks/…"
              />
            </section>

            {/* Landing page section */}
            <section>
              <SectionHead label="Landing Page" />
              <label style={{ display: 'block' }}>
                <span style={labelStyle}>Message</span>
                <textarea
                  value={config.landingMessage}
                  onChange={(e) => patch('landingMessage')(e.target.value)}
                  placeholder="Message shown at the bottom of the landing page… (leave blank to hide)"
                  rows={3}
                  spellCheck={false}
                  style={{
                    ...inputStyle,
                    resize: 'vertical',
                    lineHeight: 1.6,
                    minHeight: 80,
                  }}
                />
              </label>
            </section>

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={saveStatus === 'saving'}
              style={{
                width: '100%', padding: '13px 18px', borderRadius: 10, border: 'none',
                background: saveStatus === 'saved'
                  ? 'var(--online)'
                  : saveStatus === 'error'
                  ? '#c0392b'
                  : 'var(--accent)',
                color: saveStatus === 'saved' || saveStatus === 'error' ? '#fff' : 'var(--accent-ink)',
                fontWeight: 800, fontSize: 15, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: saveStatus === 'saving' ? 0.65 : 1,
                transition: 'background 0.2s',
                boxShadow: saveStatus === 'idle' || saveStatus === 'saving' ? '0 8px 20px -8px var(--accent)' : 'none',
              }}
            >
              {saveStatus === 'saving' && 'Saving…'}
              {saveStatus === 'saved' && <><Icon name="check" size={17} /> Saved</>}
              {saveStatus === 'error' && 'Error — try again'}
              {saveStatus === 'idle' && 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
