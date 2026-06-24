import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface AppConfig {
  jellyfinUrl: string;
  jellyfinApiKey: string;
  jellyfinUserId: string;
  uploadServiceUrl: string;
  githubRepoUrl: string;
  landingMessage: string;
  suggestionWebhookUrl: string;
  ytdlpPath: string;
  ytdlpDownloadDir: string;
  ytdlpDefaultArgs: string;
  ytdlpApprovalRequired: boolean;
  ytdlpApprovalWebhookUrl: string;
}

const CONFIG_PATH = join(process.env.DATA_DIR ?? process.cwd(), 'config.json');

function load(): AppConfig {
  const defaults = {
    jellyfinUrl: process.env.JELLYFIN_URL ?? '',
    jellyfinApiKey: process.env.JELLYFIN_API_KEY ?? '',
    jellyfinUserId: process.env.JELLYFIN_USER_ID ?? '',
    uploadServiceUrl: process.env.UPLOAD_SERVICE_URL ?? '',
    githubRepoUrl: 'https://github.com/Barrydamonke/Togetherplay',
    landingMessage: '',
    suggestionWebhookUrl: '',
    ytdlpPath: '/usr/local/bin/yt-dlp',
    ytdlpDownloadDir: '/downloads',
    ytdlpDefaultArgs: "-f bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4] --merge-output-format mp4",
    ytdlpApprovalRequired: false,
    ytdlpApprovalWebhookUrl: '',
  };
  if (existsSync(CONFIG_PATH)) {
    try {
      const stored = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as Partial<AppConfig>;
      return {
        jellyfinUrl: stored.jellyfinUrl ?? defaults.jellyfinUrl,
        jellyfinApiKey: stored.jellyfinApiKey ?? defaults.jellyfinApiKey,
        jellyfinUserId: stored.jellyfinUserId ?? defaults.jellyfinUserId,
        uploadServiceUrl: stored.uploadServiceUrl ?? defaults.uploadServiceUrl,
        githubRepoUrl: stored.githubRepoUrl ?? defaults.githubRepoUrl,
        landingMessage: stored.landingMessage ?? defaults.landingMessage,
        suggestionWebhookUrl: stored.suggestionWebhookUrl ?? defaults.suggestionWebhookUrl,
        ytdlpPath: stored.ytdlpPath ?? defaults.ytdlpPath,
        ytdlpDownloadDir: stored.ytdlpDownloadDir ?? defaults.ytdlpDownloadDir,
        ytdlpDefaultArgs: stored.ytdlpDefaultArgs ?? defaults.ytdlpDefaultArgs,
        ytdlpApprovalRequired: stored.ytdlpApprovalRequired ?? defaults.ytdlpApprovalRequired,
        ytdlpApprovalWebhookUrl: stored.ytdlpApprovalWebhookUrl ?? defaults.ytdlpApprovalWebhookUrl,
      };
    } catch {}
  }
  return defaults;
}

let _config = load();

export function getConfig(): AppConfig {
  return _config;
}

export function saveConfig(next: AppConfig): void {
  _config = next;
  writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf-8');
}
