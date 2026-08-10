import { describe, it, expect } from 'vitest';
import { analytics, finance, farmSummary } from '../mock';
import { listCows, mapNodes, createCow, listFarmMapObjects, createFarmMapObject, updateFarmMapObject, deleteFarmMapObject, moveFarmMapObject, saveDraft, getDraft, undoChange, redoChange } from '../data';

describe('mock data fixes', () => {
  it('finance includes incomeTotal and expenseTotal', async () => {
    const f = await finance('f1');
    expect(f.incomeTotal).toBeGreaterThan(0);
    expect(f.expenseTotal).toBeGreaterThan(0);
    expect(f.cashFlow.length).toBe(12);
  });

  it('analytics includes diseaseTrend, feedEfficiency, financialPerf', async () => {
    const a = await analytics('f1');
    expect(a.diseaseTrend.length).toBe(12);
    expect(typeof a.feedEfficiency).toBe('number');
    expect(typeof a.financialPerf).toBe('number');
  });

  it('farmSummary is cached for same farmId', async () => {
    const s1 = farmSummary('f1');
    const s2 = farmSummary('f1');
    expect(s1).toBe(s2);
  });

  it('mapNodes returns barns in mock mode', async () => {
    const m = await mapNodes('f1');
    expect(m.barns.length).toBeGreaterThan(0);
    expect(m.barns[0]).toHaveProperty('id');
    expect(m.barns[0]).toHaveProperty('cows');
  });

  it('createCow adds a cow in mock mode', async () => {
    const before = (await listCows('f1')).length;
    await createCow('f1', { name: 'Testy', breed: 'Holstein', ear_tag: 'TEST123', weight_kg: 500, is_milking: true, is_pregnant: false, gender: 'female', health: 'healthy' });
    const after = (await listCows('f1')).length;
    expect(after).toBe(before + 1);
    const found = (await listCows('f1')).find((c) => c.earTag === 'TEST123');
    expect(found).toBeDefined();
    expect(found?.name).toBe('Testy');
  });

  it('listFarmMapObjects returns objects in mock mode', async () => {
    const objs = await listFarmMapObjects('f1');
    expect(objs.length).toBeGreaterThan(0);
    expect(objs[0]).toHaveProperty('id');
    expect(objs[0]).toHaveProperty('type');
    expect(objs[0]).toHaveProperty('geometry');
  });

  it('createFarmMapObject adds an object in mock mode', async () => {
    const before = (await listFarmMapObjects('f1')).length;
    await createFarmMapObject('f1', { type: 'building', name: 'Test Building', geometry: { type: 'Point', coordinates: [50, 50] } });
    const after = (await listFarmMapObjects('f1')).length;
    expect(after).toBe(before + 1);
    const found = (await listFarmMapObjects('f1')).find((o) => o.name === 'Test Building');
    expect(found).toBeDefined();
  });

  it('updateFarmMapObject updates an object in mock mode', async () => {
    const objs = await listFarmMapObjects('f1');
    const target = objs[0];
    await updateFarmMapObject('f1', target.id, { name: 'Updated Name', properties: { ...target.properties, notes: 'Updated notes' } });
    const updated = (await listFarmMapObjects('f1')).find((o) => o.id === target.id);
    expect(updated?.name).toBe('Updated Name');
    expect(updated?.properties?.notes).toBe('Updated notes');
  });

  it('deleteFarmMapObject removes an object in mock mode', async () => {
    const objs = await listFarmMapObjects('f1');
    const target = objs[0];
    await deleteFarmMapObject('f1', target.id);
    const after = await listFarmMapObjects('f1');
    expect(after.find((o) => o.id === target.id)).toBeUndefined();
  });

  it('moveFarmMapObject updates geometry in mock mode', async () => {
    const objs = await listFarmMapObjects('f1');
    const target = objs[0];
    const newGeometry = { type: 'Point', coordinates: [60, 60] };
    await moveFarmMapObject('f1', target.id, newGeometry);
    const updated = (await listFarmMapObjects('f1')).find((o) => o.id === target.id);
    expect(updated?.geometry).toEqual(newGeometry);
  });

  it('saveDraft and getDraft work in mock mode', async () => {
    const objs = await listFarmMapObjects('f1');
    await saveDraft('f1', objs);
    const draft = await getDraft('f1');
    expect(draft.length).toBe(objs.length);
  });

  it('undoChange and redoChange work in mock mode', async () => {
    const log = await undoChange('f1', 'nonexistent');
    expect(log).toBeDefined();
    const red = await redoChange('f1');
    expect(red).toBeDefined();
  });
});
