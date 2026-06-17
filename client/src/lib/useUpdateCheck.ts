import { useState, useEffect, useCallback, useRef } from 'react';

const DEFAULT_REPO_URL = 'https://github.com/Barrydamonke/Togetherplay';
const LS_KEY = 'tg-update-check';
const INTERVAL_MS = 60 * 60 * 1000;

export interface UpdateState {
  status: 'checking' | 'up-to-date' | 'update-available' | 'error';
  lastChecked: number | null;
  latestVersion: string | null;
  releaseUrl: string | null;
}

function parseSemver(v: string): number[] {
  return v.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
}

function isNewer(latest: string, current: string): boolean {
  const a = parseSemver(latest);
  const b = parseSemver(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if ((a[i] ?? 0) > (b[i] ?? 0)) return true;
    if ((a[i] ?? 0) < (b[i] ?? 0)) return false;
  }
  return false;
}

function repoUrlToApiUrl(repoUrl: string): string {
  const url = repoUrl.trim() || DEFAULT_REPO_URL;
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.replace(/^\/|\/$/g, '').split('/');
    if (parts.length >= 2) {
      return `https://api.github.com/repos/${parts[0]}/${parts[1]}/releases/latest`;
    }
  } catch {
    // not a full URL — try owner/repo
    const parts = url.split('/');
    if (parts.length === 2) {
      return `https://api.github.com/repos/${parts[0]}/${parts[1]}/releases/latest`;
    }
  }
  // fallback to default
  const defaultParts = new URL(DEFAULT_REPO_URL).pathname.replace(/^\/|\/$/g, '');
  return `https://api.github.com/repos/${defaultParts}/releases/latest`;
}

function loadCache(): UpdateState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UpdateState;
  } catch {
    return null;
  }
}

function saveCache(state: UpdateState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    // storage full or unavailable — ignore
  }
}

export function useUpdateCheck(repoUrl?: string) {
  const [state, setState] = useState<UpdateState>(() => {
    return loadCache() ?? { status: 'checking', lastChecked: null, latestVersion: null, releaseUrl: null };
  });

  const checkingRef = useRef(false);
  const apiUrlRef = useRef(repoUrlToApiUrl(repoUrl ?? ''));

  const check = useCallback(async (overrideApiUrl?: string) => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setState((prev) => ({ ...prev, status: 'checking' }));
    const apiUrl = overrideApiUrl ?? apiUrlRef.current;

    try {
      const res = await fetch(apiUrl);

      if (res.status === 404) {
        const next: UpdateState = {
          status: 'up-to-date',
          lastChecked: Date.now(),
          latestVersion: null,
          releaseUrl: null,
        };
        setState(next);
        saveCache(next);
        return;
      }

      if (!res.ok) throw new Error(`GitHub responded with ${res.status}`);

      const data = await res.json() as { tag_name: string; html_url: string };
      const latestVersion = data.tag_name.replace(/^v/, '');
      const releaseUrl = data.html_url;
      const status = isNewer(latestVersion, __APP_VERSION__) ? 'update-available' : 'up-to-date';

      const next: UpdateState = { status, lastChecked: Date.now(), latestVersion, releaseUrl };
      setState(next);
      saveCache(next);
    } catch {
      setState((prev) => ({ ...prev, status: 'error' }));
    } finally {
      checkingRef.current = false;
    }
  }, []);

  // Initial check + hourly interval using the initial URL
  useEffect(() => {
    const cached = loadCache();
    const stale = !cached || !cached.lastChecked || Date.now() - cached.lastChecked > INTERVAL_MS;
    if (stale) check();
    const timer = setInterval(() => check(), INTERVAL_MS);
    return () => clearInterval(timer);
  }, [check]);

  // Re-check when the configured repo URL changes (e.g. after admin login loads config)
  useEffect(() => {
    const newApiUrl = repoUrlToApiUrl(repoUrl ?? '');
    if (newApiUrl !== apiUrlRef.current) {
      apiUrlRef.current = newApiUrl;
      check(newApiUrl);
    }
  }, [repoUrl, check]);

  return { ...state, recheck: () => check() };
}
