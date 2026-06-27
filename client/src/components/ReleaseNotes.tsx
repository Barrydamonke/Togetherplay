import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useUpdateCheck } from '../lib/useUpdateCheck';

interface Props {
  onClose: () => void;
  onOpenAdmin: () => void;
}

interface VersionEntry {
  version: string;
  notes: string | null;
  loading: boolean;
  error: boolean;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part,
  );
}

function renderMarkdown(raw: string): React.ReactNode {
  const lines = raw.split('\n');
  const out: React.ReactNode[] = [];
  let listBuf: string[] = [];
  let k = 0;

  function flushList() {
    if (!listBuf.length) return;
    out.push(
      <ul key={k++} style={{ margin: '2px 0 12px', paddingLeft: 18 }}>
        {listBuf.map((item, i) => (
          <li key={i} style={{ color: 'var(--text-dim)', fontSize: 14, lineHeight: 1.7 }}>
            {renderInline(item)}
          </li>
        ))}
      </ul>,
    );
    listBuf = [];
  }

  for (const line of lines) {
    if (line.startsWith('# ')) {
      flushList();
      // Top-level title — skip, we show version as the accordion header
    } else if (line.startsWith('## ')) {
      flushList();
      out.push(
        <p key={k++} style={{
          fontWeight: 800, fontSize: 11.5, letterSpacing: '.07em',
          textTransform: 'uppercase', color: 'var(--text-faint)',
          margin: '18px 0 5px',
        }}>
          {line.slice(3)}
        </p>,
      );
    } else if (line.startsWith('### ')) {
      flushList();
      out.push(
        <p key={k++} style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', margin: '10px 0 4px' }}>
          {line.slice(4)}
        </p>,
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      listBuf.push(line.slice(2));
    } else if (line.trim() === '') {
      flushList();
    } else {
      flushList();
      out.push(
        <p key={k++} style={{ color: 'var(--text-dim)', fontSize: 14, lineHeight: 1.6, margin: '0 0 8px' }}>
          {renderInline(line)}
        </p>,
      );
    }
  }
  flushList();
  return <>{out}</>;
}

export function ReleaseNotes({ onClose, onOpenAdmin }: Props) {
  const [entries, setEntries] = useState<VersionEntry[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const updateCheck = useUpdateCheck();

  useEffect(() => {
    fetch('/release-notes/index.json')
      .then((r) => r.json())
      .then((data: { versions: string[] }) => {
        const list: VersionEntry[] = data.versions.map((v) => ({
          version: v, notes: null, loading: false, error: false,
        }));
        setEntries(list);
        // Auto-open and load the latest version.
        if (list.length > 0) {
          const latest = list[0].version;
          setOpen(new Set([latest]));
          loadNotes(latest, list);
        }
      })
      .catch(() => {});
  }, []);

  function loadNotes(version: string, base?: VersionEntry[]) {
    setEntries((prev) => (base ?? prev).map((e) =>
      e.version === version ? { ...e, loading: true } : e,
    ));
    fetch(`/release-notes/v${version}.md`)
      .then((r) => { if (!r.ok) throw new Error(); return r.text(); })
      .then((text) => setEntries((prev) => prev.map((e) =>
        e.version === version ? { ...e, notes: text, loading: false } : e,
      )))
      .catch(() => setEntries((prev) => prev.map((e) =>
        e.version === version ? { ...e, error: true, loading: false } : e,
      )));
  }

  function toggle(version: string) {
    const entry = entries.find((e) => e.version === version);
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(version) ? next.delete(version) : next.add(version);
      return next;
    });
    if (entry && entry.notes === null && !entry.loading && !entry.error) {
      loadNotes(version);
    }
  }

  const scrimDown = useRef(false);

  return (
    <div
      onMouseDown={(e) => { scrimDown.current = e.target === e.currentTarget; }}
      onMouseUp={(e) => { if (scrimDown.current && e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 540, maxHeight: '80vh',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 className="font-display" style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--text)' }}>
                Release notes
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)', fontWeight: 600 }}>
                What's changed in each version
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 32, height: 32, borderRadius: '50%', display: 'grid', placeItems: 'center',
                border: '1px solid var(--border)', background: 'var(--surface-2)',
                color: 'var(--text-dim)', flexShrink: 0,
              }}
            >
              <Icon name="close" size={15} />
            </button>
          </div>

          {updateCheck.status === 'update-available' && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginTop: 12, padding: '9px 13px', borderRadius: 10,
              background: 'var(--accent-soft)', border: '1.5px solid var(--accent)',
              gap: 10,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
                Version {updateCheck.latestVersion} is available
              </span>
              <button
                onClick={onOpenAdmin}
                style={{
                  fontSize: 13, fontWeight: 800, color: 'var(--accent-ink)',
                  background: 'var(--accent)', border: 'none',
                  padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
                  flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
                }}
              >
                Update <Icon name="chevron" size={13} />
              </button>
            </div>
          )}
        </div>

        {/* Version list */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {entries.length === 0 && (
            <p style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-faint)', fontWeight: 600, fontSize: 14 }}>
              Loading…
            </p>
          )}
          {entries.map((entry, i) => {
            const isOpen = open.has(entry.version);
            return (
              <div key={entry.version} style={{ borderBottom: i < entries.length - 1 ? '1px solid var(--border-soft)' : 'none' }}>
                {/* Accordion trigger */}
                <button
                  onClick={() => toggle(entry.version)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 22px', background: 'none', border: 'none',
                    textAlign: 'left', cursor: 'pointer',
                  }}
                >
                  <span className="font-display" style={{ fontWeight: 600, fontSize: 17, color: 'var(--text)' }}>
                    v{entry.version}
                  </span>
                  <Icon
                    name="chevron"
                    size={17}
                    style={{
                      color: 'var(--text-faint)', flexShrink: 0,
                      transform: isOpen ? 'rotate(90deg)' : 'none',
                      transition: 'transform .2s',
                    }}
                  />
                </button>

                {/* Accordion body */}
                {isOpen && (
                  <div style={{ padding: '0 22px 20px' }}>
                    {entry.loading && (
                      <p style={{ color: 'var(--text-faint)', fontSize: 14, fontWeight: 600 }}>Loading…</p>
                    )}
                    {entry.error && (
                      <p style={{ color: 'var(--text-faint)', fontSize: 14, fontWeight: 600 }}>Could not load notes for this version.</p>
                    )}
                    {entry.notes && renderMarkdown(entry.notes)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
