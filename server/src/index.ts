import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { setupSocket } from './socket';
import jellyfinRouter from './routes/jellyfin';
import adminRouter from './routes/admin';
import roomsRouter from './routes/rooms';
import { getConfig } from './config';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

app.use(cors());
app.use(express.json());

app.use('/api/jellyfin', jellyfinRouter);
app.use('/api/rooms', roomsRouter);
app.use('/admin', adminRouter);

app.get('/api/landing-message', (_req, res) => {
  res.json({ message: getConfig().landingMessage });
});

const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

setupSocket(io);

const PORT = process.env.PORT ?? 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
