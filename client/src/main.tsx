// Apply saved theme before first render to avoid flash of unstyled content
const savedTheme = localStorage.getItem('tg-theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { tryInitDiscord } from './lib/discord';

async function mount() {
  const discordContext = await tryInitDiscord();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App discordContext={discordContext} />
    </StrictMode>
  );
}

mount();
