import { useState, useRef, useCallback } from 'react';

const LIMITS = {
  chat:       { maxActions: 5, windowMs: 3000 },
  roomCreate: { maxActions: 2, windowMs: 5000 },
  queueAdd:   { maxActions: 3, windowMs: 3000 },
} as const;

type Action = keyof typeof LIMITS;

export function useRateLimit(onTriggered: () => void) {
  const [rateLimited, setRateLimited] = useState(false);
  const timestamps = useRef<Partial<Record<Action, number[]>>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTriggeredRef = useRef(onTriggered);
  onTriggeredRef.current = onTriggered;

  const check = useCallback((action: Action): boolean => {
    if (rateLimited) return false;

    const { maxActions, windowMs } = LIMITS[action];
    const now = Date.now();
    const history = timestamps.current[action] ?? [];
    const recent = history.filter((t) => now - t < windowMs);
    recent.push(now);
    timestamps.current[action] = recent;

    if (recent.length > maxActions) {
      setRateLimited(true);
      onTriggeredRef.current();
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setRateLimited(false);
        timestamps.current = {};
      }, 5000);
      return false;
    }

    return true;
  }, [rateLimited]);

  return { rateLimited, check };
}
