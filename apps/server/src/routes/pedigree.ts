import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth, resolveFarmId, audit } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

function cowGenderColor(gender: string | null): string {
  if (!gender) return 'gray';
  return gender === 'male' ? 'blue' : gender === 'female' ? 'pink' : 'gray';
}

const generationsSchema = z.object({
  generations: z.coerce.number().int().min(1).max(5).default(3),
});

router.get('/:cowId', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const cowId = req.params.cowId;
  const { generations } = generationsSchema.parse(req.query);

  const cowRes = await query(
    `SELECT id, cow_code, name, breed, gender, date_of_birth, status, health, photo_url, mother_id, father_id, farm_id
     FROM cows WHERE id=$1`,
    [cowId]
  );
  if (!cowRes.rows[0]) throw new HttpError(404, 'Cow not found');
  if (cowRes.rows[0].farm_id !== farmId) throw new HttpError(403, 'Access denied');

  const cow = cowRes.rows[0];

  async function buildAncestor(cid: string | null, depth: number): Promise<any> {
    if (!cid || depth <= 0) return null;
    const r = await query(
      `SELECT id, cow_code, name, breed, gender, date_of_birth, status, health, photo_url, mother_id, father_id
       FROM cows WHERE id=$1`,
      [cid]
    );
    if (!r.rows[0]) return null;
    const c = r.rows[0];
    return {
      cow: {
        id: c.id, cowCode: c.cow_code, name: c.name, breed: c.breed, gender: c.gender,
        dateOfBirth: c.date_of_birth, status: c.status, health: c.health, photoUrl: c.photo_url,
        motherId: c.mother_id, fatherId: c.father_id,
      },
      mother: await buildAncestor(c.mother_id, depth - 1),
      father: await buildAncestor(c.father_id, depth - 1),
      offspring: [],
    };
  }

  const motherNode = await buildAncestor(cow.mother_id, generations - 1);
  const fatherNode = await buildAncestor(cow.father_id, generations - 1);

  const offspringRes = await query(
    `SELECT id, cow_code, name, breed, gender, date_of_birth, status, health, photo_url, mother_id, father_id
     FROM cows
     WHERE farm_id=$1 AND (mother_id=$2 OR father_id=$2)
     ORDER BY date_of_birth DESC`,
    [farmId, cowId]
  );

  const offspringList = offspringRes.rows.map((c: any) => ({
    id: c.id, cowCode: c.cow_code, name: c.name, breed: c.breed, gender: c.gender,
    dateOfBirth: c.date_of_birth, status: c.status, health: c.health, photoUrl: c.photo_url,
    motherId: c.mother_id, fatherId: c.father_id,
  }));

  const tree = {
    cow: {
      id: cow.id, cowCode: cow.cow_code, name: cow.name, breed: cow.breed, gender: cow.gender,
      dateOfBirth: cow.date_of_birth, status: cow.status, health: cow.health, photoUrl: cow.photo_url,
      motherId: cow.mother_id, fatherId: cow.father_id,
    },
    mother: motherNode,
    father: fatherNode,
    offspring: offspringList,
  };

  await audit(req.user, 'read', 'pedigree', cowId);
  res.json(tree);
}));

router.get('/offspring/:cowId', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const cowId = req.params.cowId;

  const cowRes = await query('SELECT id, farm_id FROM cows WHERE id=$1', [cowId]);
  if (!cowRes.rows[0]) throw new HttpError(404, 'Cow not found');
  if (cowRes.rows[0].farm_id !== farmId) throw new HttpError(403, 'Access denied');

  const { rows } = await query(
    `SELECT id, cow_code, name, breed, gender, date_of_birth, status, health, photo_url, mother_id, father_id
     FROM cows
     WHERE farm_id=$1 AND (mother_id=$2 OR father_id=$2)
     ORDER BY date_of_birth DESC`,
    [farmId, cowId]
  );

  const offspring = rows.map((c: any) => ({
    id: c.id, cowCode: c.cow_code, name: c.name, breed: c.breed, gender: c.gender,
    dateOfBirth: c.date_of_birth, status: c.status, health: c.health, photoUrl: c.photo_url,
    motherId: c.mother_id, fatherId: c.father_id,
  }));

  res.json(offspring);
}));

router.get('/ancestors/:cowId', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const cowId = req.params.cowId;
  const { generations } = generationsSchema.parse(req.query);

  const cowRes = await query('SELECT id, farm_id FROM cows WHERE id=$1', [cowId]);
  if (!cowRes.rows[0]) throw new HttpError(404, 'Cow not found');
  if (cowRes.rows[0].farm_id !== farmId) throw new HttpError(403, 'Access denied');

  const ancestors: any[] = [];

  async function collectAncestors(cid: string | null, depth: number, path: string[] = []): Promise<void> {
    if (!cid || depth <= 0) return;
    const r = await query(
      `SELECT id, cow_code, name, breed, gender, date_of_birth, status, health, photo_url, mother_id, father_id
       FROM cows WHERE id=$1`,
      [cid]
    );
    if (!r.rows[0]) return;
    const c = r.rows[0];
    const relation = path.length === 0 ? 'self' : path[path.length - 1];
    ancestors.push({
      id: c.id, cowCode: c.cow_code, name: c.name, breed: c.breed, gender: c.gender,
      dateOfBirth: c.date_of_birth, status: c.status, health: c.health, photoUrl: c.photo_url,
      motherId: c.mother_id, fatherId: c.father_id,
      generation: path.length,
      relation,
    });
    await collectAncestors(c.mother_id, depth - 1, [...path, 'mother']);
    await collectAncestors(c.father_id, depth - 1, [...path, 'father']);
  }

  await collectAncestors(cowId, generations);
  res.json(ancestors);
}));

export default router;
