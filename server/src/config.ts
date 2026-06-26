import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

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
  adminPassword: string;
  discordClientSecret: string;
  setupComplete: boolean;
}

const CONFIG_PATH = join(process.env.DATA_DIR ?? process.cwd(), 'config.json');

const WORDS_A = ['amber','bold','bright','calm','clear','crisp','dark','deep','fast','fierce','fresh','grand','green','iron','jade','keen','light','misty','noble','pale','quick','rapid','sharp','silver','slim','soft','stark','stern','swift','warm','wild','blue','cold','fair','gold'];
const WORDS_B = ['arrow','blade','bolt','brook','cliff','cloud','crane','dawn','eagle','falcon','flint','forge','frost','grove','hawk','lance','mist','peak','pine','raven','ridge','river','rock','smoke','spark','stone','tide','torch','trail','vale'];
const WORDS_C = ['creek','fern','flame','gate','glow','haze','helm','hill','lark','leaf','moon','path','pool','reef','rose','sail','seed','song','star','surf','vine','ward','well','wind','wood','toast','crest','dusk','glen','lake'];

function pick<T>(arr: T[]): T {
  return arr[randomBytes(1)[0] % arr.length];
}

function generatePassword(): string {
  return `${pick(WORDS_A)}-${pick(WORDS_B)}-${pick(WORDS_C)}`;
}

const envFallbacksLogged = new Set<string>();

function envFallback(configVal: string, envKey: string, label: string): string {
  if (configVal) return configVal;
  const envVal = process.env[envKey];
  if (envVal) {
    if (!envFallbacksLogged.has(envKey)) {
      envFallbacksLogged.add(envKey);
      console.warn(
        `[config] '${label}' is not set in the admin panel — using the ${envKey} environment variable as a fallback.` +
        ` Set it in the admin panel to suppress this warning.`,
      );
    }
    return envVal;
  }
  return '';
}

function buildConfig(stored: Partial<AppConfig>): AppConfig {
  return {
    adminPassword: stored.adminPassword ?? '',
    setupComplete: stored.setupComplete ?? false,
    jellyfinUrl:      envFallback(stored.jellyfinUrl      ?? '', 'JELLYFIN_URL',        'Jellyfin URL'),
    jellyfinApiKey:   envFallback(stored.jellyfinApiKey   ?? '', 'JELLYFIN_API_KEY',    'Jellyfin API Key'),
    jellyfinUserId:   envFallback(stored.jellyfinUserId   ?? '', 'JELLYFIN_USER_ID',    'Jellyfin User ID'),
    uploadServiceUrl: envFallback(stored.uploadServiceUrl ?? '', 'UPLOAD_SERVICE_URL',  'Upload Service URL'),
    discordClientSecret: envFallback(stored.discordClientSecret ?? '', 'DISCORD_CLIENT_SECRET', 'Discord Client Secret'),
    githubRepoUrl:    stored.githubRepoUrl    ?? 'https://github.com/Barrydamonke/Togetherplay',
    landingMessage:   stored.landingMessage   ?? '',
    suggestionWebhookUrl: stored.suggestionWebhookUrl ?? '',
    ytdlpPath:        stored.ytdlpPath        ?? '/usr/bin/yt-dlp',
    ytdlpDownloadDir: stored.ytdlpDownloadDir ?? '/downloads',
    ytdlpDefaultArgs: stored.ytdlpDefaultArgs ?? '-f bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4] --merge-output-format mp4',
    ytdlpApprovalRequired:  stored.ytdlpApprovalRequired  ?? false,
    ytdlpApprovalWebhookUrl: stored.ytdlpApprovalWebhookUrl ?? '',
  };
}

let _config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (_config === null) {
    let stored: Partial<AppConfig> = {};
    if (existsSync(CONFIG_PATH)) {
      try { stored = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')); } catch {}
    }
    _config = buildConfig(stored);
  }
  return _config;
}

export function saveConfig(next: AppConfig): void {
  _config = next;
  writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf-8');
}

export function resolveAdminPassword(): string {
  const cfg = getConfig();
  if (cfg.adminPassword) return cfg.adminPassword;
  const envVal = process.env.ADMIN_PASSWORD;
  if (envVal) {
    if (!envFallbacksLogged.has('ADMIN_PASSWORD')) {
      envFallbacksLogged.add('ADMIN_PASSWORD');
      console.warn(
        '[config] Admin password is not set in the admin panel — using the ADMIN_PASSWORD environment variable as a fallback.' +
        ' Set it in the admin panel to suppress this warning.',
      );
    }
    return envVal;
  }
  return '';
}

export function initConfig(): void {
  let stored: Partial<AppConfig> = {};
  if (existsSync(CONFIG_PATH)) {
    try {
      stored = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as Partial<AppConfig>;
    } catch {
      console.error('[config] Failed to parse config.json — starting with defaults');
    }
  }

  const isFirstBoot = !stored.adminPassword && !process.env.ADMIN_PASSWORD;
  if (isFirstBoot) {
    const password = generatePassword();
    stored = { ...stored, adminPassword: password };
    try {
      writeFileSync(CONFIG_PATH, JSON.stringify(buildConfig(stored), null, 2), 'utf-8');
    } catch (err) {
      console.error('[config] Could not persist generated password:', err);
    }
  }

  _config = buildConfig(stored);

  // Always log the active admin password on startup so it's visible in container logs.
  const activePassword = _config.adminPassword || process.env.ADMIN_PASSWORD || '';
  const sep = '='.repeat(56);
  console.log(`\n${sep}`);
  if (isFirstBoot) {
    console.log('  TOGETHERPLAY — FIRST BOOT');
    console.log('  The site is locked until you save settings once.');
  } else {
    console.log('  TOGETHERPLAY — STARTING');
  }
  console.log(sep);
  if (activePassword) {
    console.log(`  Admin password: ${activePassword}`);
  } else {
    console.log('  Admin password: (none — set ADMIN_PASSWORD env var or use the admin panel)');
  }
  console.log(`  Admin panel: /admin`);
  console.log(`${sep}\n`);
}
