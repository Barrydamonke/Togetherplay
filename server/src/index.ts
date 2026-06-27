import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { setupSocket } from './socket';
import jellyfinRouter from './routes/jellyfin';
import adminRouter from './routes/admin';
import roomsRouter from './routes/rooms';
import discordRouter from './routes/discord';
import suggestionsRouter from './routes/suggestions';
import youtubeRouter from './routes/youtube';
import { initConfig, getConfig } from './config';
import { initDownloadManager } from './youtube';

initConfig();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

app.use(cors());
app.use(express.json());

// Block all /api/* routes until setup is complete.
// Admin routes live at /admin/* and are always accessible.
app.use('/api', (_req, res, next) => {
  if (getConfig().setupComplete) return next();
  res.status(503).json({
    error: 'Setup required — visit /admin to complete first-time setup before using the app.',
  });
});

app.use('/api/jellyfin', jellyfinRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/discord', discordRouter);
app.use('/api/suggestions', suggestionsRouter);
app.use('/api/youtube', youtubeRouter);
app.use('/admin', adminRouter);

app.get('/api/landing-message', (_req, res) => {
  res.json({ message: getConfig().landingMessage });
});

app.get('/api/client-config', (_req, res) => {
  res.json({ discordClientId: getConfig().discordClientId });
});

const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

setupSocket(io);
initDownloadManager(io);

const PORT = process.env.PORT ?? 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
