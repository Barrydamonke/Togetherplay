import { Router } from 'express';
import { getAllRooms } from '../rooms';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ rooms: getAllRooms() });
});

export default router;
