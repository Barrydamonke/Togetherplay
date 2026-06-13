import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface AppConfig {
  jellyfinUrl: string;
  jellyfinApiKey: string;
  jellyfinUserId: string;
  uploadServiceUrl: string;
}

const CONFIG_PATH = join(process.cwd(), 'config.json');

function load(): AppConfig {
  if (existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as AppConfig;
    } catch {}
  }
  return {
    jellyfinUrl: process.env.JELLYFIN_URL ?? '',
    jellyfinApiKey: process.env.JELLYFIN_API_KEY ?? '',
    jellyfinUserId: process.env.JELLYFIN_USER_ID ?? '',
    uploadServiceUrl: process.env.UPLOAD_SERVICE_URL ?? '',
  };
}

let _config = load();

export function getConfig(): AppConfig {
  return _config;
}

export function saveConfig(next: AppConfig): void {
  _config = next;
  writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf-8');
}
