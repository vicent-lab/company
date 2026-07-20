import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth, resolveFarmId } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const userId = req.user!.id;
  const { rows } = await query(
    `SELECT m.*, u.name as sender_name, u2.name as recipient_name
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     JOIN users u2 ON u2.id = m.recipient_id
     WHERE m.farm_id=$1 AND (m.sender_id=$2 OR m.recipient_id=$2)
     ORDER BY m.created_at DESC`,
    [farmId, userId]
  );
  res.json({ data: rows, count: rows.length });
}));

const schema = z.object({
  recipientId: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  priority: z.string().default('normal'),
});

router.post('/', asyncHandler(async (req, res) => {
  const b = schema.parse(req.body);
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `INSERT INTO messages (farm_id, sender_id, recipient_id, subject, body, priority)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [farmId, req.user!.id, b.recipientId, b.subject, b.body, b.priority]
  );
  res.status(201).json(rows[0]);
}));

router.patch('/:id/read', asyncHandler(async (req, res) => {
  const { rows } = await query('UPDATE messages SET read_at=now() WHERE id=$1 AND recipient_id=$2 RETURNING *', [req.params.id, req.user!.id]);
  if (!rows[0]) throw new HttpError(404, 'Message not found');
  res.json(rows[0]);
}));

export default router;
