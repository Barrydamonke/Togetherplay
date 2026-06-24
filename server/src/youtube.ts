import { randomUUID, randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { Server } from 'socket.io';
import { getConfig } from './config';

export interface YTDownload {
  id: string;
  url: string;
  title: string;
  thumbnailUrl: string;
  duration: number;
  estimatedSizeMb: number;
  status: 'pending_approval' | 'downloading' | 'ready' | 'error' | 'denied';
  filename: string;
  downloadedAt?: number;
  lastPlayedAt?: number;
  approvalToken?: string;
  requestedBy: string;
  error?: string;
}

export interface YTMetadata {
  title: string;
  thumbnailUrl: string;
  duration: number;
  estimatedSizeMb: number;
}

const downloads = new Map<string, YTDownload>();
const PERSIST_PATH = join(process.env.DATA_DIR ?? process.cwd(), 'youtube-downloads.json');
const TTL_MS = 24 * 60 * 60 * 1000;

let _io: Server | null = null;

function persist() {
  try {
    writeFileSync(PERSIST_PATH, JSON.stringify(Array.from(downloads.values()), null, 2), 'utf-8');
  } catch (err) {
    console.error('[yt-dlp] Failed to persist downloads:', err);
  }
}

function loadPersisted() {
  if (!existsSync(PERSIST_PATH)) return;
  try {
    const arr = JSON.parse(readFileSync(PERSIST_PATH, 'utf-8')) as YTDownload[];
    for (const d of arr) {
      // Reset any interrupted downloads back to error state on restart
      if (d.status === 'downloading') d.status = 'error';
      downloads.set(d.id, d);
    }
  } catch {}
}

export function initDownloadManager(io: Server) {
  _io = io;
  loadPersisted();
  setInterval(cleanupExpired, 30 * 60 * 1000);
}

function emitStatusUpdate(id: string, status: YTDownload['status'], error?: string) {
  _io?.emit('youtube:status_update', { id, status, error });
}

export function getAllDownloads(): YTDownload[] {
  return Array.from(downloads.values()).map(d => {
    // Never expose approval token to clients
    const { approvalToken: _t, ...safe } = d;
    return safe as YTDownload;
  });
}

export function getDownload(id: string): YTDownload | undefined {
  return downloads.get(id);
}

export function updateLastPlayed(id: string) {
  const d = downloads.get(id);
  if (d) {
    d.lastPlayedAt = Date.now();
    persist();
  }
}

// Simple shell-style argument parser — strips surrounding quotes, splits on whitespace
function parseArgs(argsStr: string): string[] {
  const result: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  for (const ch of argsStr.trim()) {
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === ' ' && !inSingle && !inDouble) {
      if (current) { result.push(current); current = ''; }
    } else {
      current += ch;
    }
  }
  if (current) result.push(current);
  return result;
}

export async function fetchMetadata(url: string): Promise<YTMetadata> {
  const { ytdlpPath } = getConfig();
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => { if (!settled) { settled = true; fn(); } };

    const proc = spawn(ytdlpPath, ['--dump-json', '--no-download', url]);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on('error', (err) => {
      done(() => reject(new Error(
        err.message.includes('ENOENT')
          ? `yt-dlp not found at "${ytdlpPath}". Check the binary path in Admin settings.`
          : `Failed to spawn yt-dlp: ${err.message}`
      )));
    });
    proc.on('close', (code) => {
      if (code !== 0) {
        done(() => reject(new Error(stderr.slice(-500) || 'yt-dlp failed with no output')));
        return;
      }
      done(() => {
        try {
          const info = JSON.parse(stdout) as Record<string, unknown>;
          let estimatedSizeMb = 0;
          const formats = (info.requested_formats ?? info.formats ?? []) as Record<string, unknown>[];
          const videoFmt = formats.find(f => typeof f.height === 'number' && f.height <= 720 && f.vcodec && f.vcodec !== 'none');
          const audioFmt = formats.find(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'));
          const videoSize = (videoFmt?.filesize ?? videoFmt?.filesize_approx ?? 0) as number;
          const audioSize = (audioFmt?.filesize ?? audioFmt?.filesize_approx ?? 0) as number;
          if (videoSize || audioSize) {
            estimatedSizeMb = Math.round((videoSize + audioSize) / 1024 / 1024);
          } else if (typeof info.filesize_approx === 'number') {
            estimatedSizeMb = Math.round(info.filesize_approx / 1024 / 1024);
          } else if (typeof info.duration === 'number') {
            estimatedSizeMb = Math.round((info.duration as number) / 60 * 1.5);
          }
          resolve({
            title: String(info.title ?? 'Unknown'),
            thumbnailUrl: String(info.thumbnail ?? ''),
            duration: Math.round((info.duration as number) ?? 0),
            estimatedSizeMb,
          });
        } catch {
          reject(new Error('Failed to parse yt-dlp output'));
        }
      });
    });
  });
}

export function createDownload(
  url: string,
  title: string,
  thumbnailUrl: string,
  duration: number,
  estimatedSizeMb: number,
  requestedBy: string,
): YTDownload {
  const id = randomUUID();
  const { ytdlpApprovalRequired } = getConfig();
  const download: YTDownload = {
    id,
    url,
    title,
    thumbnailUrl,
    duration,
    estimatedSizeMb,
    status: ytdlpApprovalRequired ? 'pending_approval' : 'downloading',
    filename: '',
    requestedBy,
    approvalToken: ytdlpApprovalRequired ? randomBytes(32).toString('hex') : undefined,
  };
  downloads.set(id, download);
  persist();
  if (!ytdlpApprovalRequired) startDownload(id);
  return download;
}

export function startDownload(id: string) {
  const download = downloads.get(id);
  if (!download) return;

  const { ytdlpPath, ytdlpDownloadDir, ytdlpDefaultArgs } = getConfig();

  if (!existsSync(ytdlpDownloadDir)) {
    try { mkdirSync(ytdlpDownloadDir, { recursive: true }); } catch {}
  }

  const outputTemplate = join(ytdlpDownloadDir, `${id}.%(ext)s`);
  const args = parseArgs(ytdlpDefaultArgs);
  args.push('--output', outputTemplate, download.url);

  download.status = 'downloading';
  download.approvalToken = undefined;
  persist();
  emitStatusUpdate(id, 'downloading');

  const proc = spawn(ytdlpPath, args, { stdio: 'pipe' });
  let stderr = '';
  let spawnErrored = false;
  proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
  proc.on('error', (err) => {
    spawnErrored = true;
    const dl = downloads.get(id);
    if (!dl) return;
    dl.status = 'error';
    dl.error = err.message.includes('ENOENT')
      ? `yt-dlp not found at "${ytdlpPath}". Check the binary path in Admin settings.`
      : `Failed to spawn yt-dlp: ${err.message}`;
    persist();
    emitStatusUpdate(id, 'error', dl.error);
    console.error(`[yt-dlp] Spawn error (${id}): ${dl.error}`);
  });

  proc.on('close', (code) => {
    if (spawnErrored) return;
    const dl = downloads.get(id);
    if (!dl) return;

    if (code !== 0) {
      dl.status = 'error';
      dl.error = stderr.slice(-500) || `Process exited with code ${code}`;
      persist();
      emitStatusUpdate(id, 'error', dl.error);
      console.error(`[yt-dlp] Download failed (${id}): ${dl.error}`);
      return;
    }

    try {
      const files = readdirSync(ytdlpDownloadDir).filter(f => f.startsWith(`${id}.`));
      if (files.length > 0) {
        dl.filename = files[0];
        dl.status = 'ready';
        dl.downloadedAt = Date.now();
        persist();
        emitStatusUpdate(id, 'ready');
        console.log(`[yt-dlp] Ready: ${dl.filename}`);
      } else {
        dl.status = 'error';
        dl.error = 'Output file not found after download';
        persist();
        emitStatusUpdate(id, 'error', dl.error);
      }
    } catch (err) {
      dl.status = 'error';
      dl.error = String(err);
      persist();
      emitStatusUpdate(id, 'error', dl.error);
    }
  });
}

export function approveDownload(id: string, token: string): boolean {
  const d = downloads.get(id);
  if (!d || d.status !== 'pending_approval' || d.approvalToken !== token) return false;
  startDownload(id);
  return true;
}

export function denyDownload(id: string, token: string): boolean {
  const d = downloads.get(id);
  if (!d || d.status !== 'pending_approval' || d.approvalToken !== token) return false;
  d.status = 'denied';
  d.approvalToken = undefined;
  persist();
  emitStatusUpdate(id, 'denied');
  return true;
}

export function deleteDownload(id: string): boolean {
  const d = downloads.get(id);
  if (!d) return false;
  if (d.filename) {
    const { ytdlpDownloadDir } = getConfig();
    const filePath = join(ytdlpDownloadDir, d.filename);
    try { if (existsSync(filePath)) unlinkSync(filePath); } catch {}
  }
  downloads.delete(id);
  persist();
  return true;
}

export async function sendApprovalWebhook(download: YTDownload, serverUrl: string) {
  const { ytdlpApprovalWebhookUrl } = getConfig();
  if (!ytdlpApprovalWebhookUrl || !download.approvalToken) return;

  const approveUrl = `${serverUrl}/api/youtube/approve/${download.id}?token=${download.approvalToken}`;
  const denyUrl = `${serverUrl}/api/youtube/deny/${download.id}?token=${download.approvalToken}`;
  const durationStr = download.duration
    ? `${Math.floor(download.duration / 60)}m ${download.duration % 60}s`
    : 'Unknown';

  try {
    await fetch(ytdlpApprovalWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: 'YouTube Download Request',
          color: 0xFF0000,
          thumbnail: download.thumbnailUrl ? { url: download.thumbnailUrl } : undefined,
          fields: [
            { name: 'Video', value: download.title.slice(0, 256) },
            { name: 'Duration', value: durationStr, inline: true },
            { name: 'Est. Size', value: `~${download.estimatedSizeMb} MB`, inline: true },
            { name: 'Requested by', value: download.requestedBy, inline: true },
            { name: '✅ Approve', value: approveUrl },
            { name: '❌ Deny', value: denyUrl },
          ],
          footer: { text: 'Togetherplay · yt-dlp' },
          timestamp: new Date().toISOString(),
        }],
      }),
    });
  } catch (err) {
    console.error('[yt-dlp] Could not send approval webhook:', err);
  }
}

function cleanupExpired() {
  const now = Date.now();
  for (const [id, d] of downloads) {
    if (d.status !== 'ready') continue;
    const reference = d.lastPlayedAt ?? d.downloadedAt;
    if (reference && now - reference >= TTL_MS) {
      console.log(`[yt-dlp] Expiring ${id} "${d.title}"`);
      deleteDownload(id);
    }
  }
}
