import { useState, useCallback } from 'react';

interface ToastItem {
  id: number;
  message: string;
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  return { toasts, addToast };
}

export function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  if (toasts.length === 0) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', flexDirection: 'column', gap: 8,
      zIndex: 9999, pointerEvents: 'none',
    }}>
      {toasts.map((t) => (
        <div key={t.id} style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 99,
          padding: '10px 20px',
          fontWeight: 700,
          fontSize: 14,
          color: 'var(--text)',
          boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
          backdropFilter: 'blur(12px)',
          whiteSpace: 'nowrap',
          textAlign: 'center',
          animation: 'slideUp 0.25s ease',
        }}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
