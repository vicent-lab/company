import { describe, it, expect } from 'vitest';
import { analytics, finance, farmSummary } from '../mock';
import { listCows, mapNodes, createCow, listFarmMapObjects, createFarmMapObject, updateFarmMapObject, deleteFarmMapObject, moveFarmMapObject, saveDraft, getDraft, undoChange, redoChange, getFarmLocation, updateFarmLocation, createFarmBoundary, listFarmBoundaries, deleteFarmBoundary, listFarmPastures, createFarmPasture, updateFarmPasture, deleteFarmPasture, createMapMeasurement, listMapMeasurements, deleteMapMeasurement, mapAiQuery, loadGoogleMapsScript, formatHectares, formatAcres, formatMeters, formatMeasurementValue, pregnancies, createPregnancy, updatePregnancy, deletePregnancy, offspring, createOffspring, deleteOffspring } from '../data';

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

  it('getFarmLocation returns mock location', async () => {
    const loc = await getFarmLocation('f1');
    expect(loc).toHaveProperty('farmId', 'f1');
    expect(loc).toHaveProperty('latitude');
    expect(loc).toHaveProperty('longitude');
  });

  it('createFarmBoundary adds boundary in mock mode', async () => {
    const before = (await listFarmBoundaries('f1')).length;
    await createFarmBoundary('f1', { name: 'Test Boundary', geometry: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,1],[0,0]]] } });
    const after = (await listFarmBoundaries('f1')).length;
    expect(after).toBe(before + 1);
  });

  it('listFarmPastures returns pastures in mock mode', async () => {
    const pastures = await listFarmPastures('f1');
    expect(Array.isArray(pastures)).toBe(true);
  });

  it('createFarmPasture adds pasture in mock mode', async () => {
    const before = (await listFarmPastures('f1')).length;
    await createFarmPasture('f1', { name: 'Test Pasture', geometry: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,1],[0,0]]] } });
    const after = (await listFarmPastures('f1')).length;
    expect(after).toBe(before + 1);
  });

  it('createMapMeasurement adds measurement in mock mode', async () => {
    const before = (await listMapMeasurements('f1')).length;
    await createMapMeasurement('f1', { type: 'distance', geometry: { type: 'LineString', coordinates: [[0,0],[1,1]] } });
    const after = (await listMapMeasurements('f1')).length;
    expect(after).toBe(before + 1);
  });

  it('mapAiQuery returns highlights for known queries', async () => {
    const result = await mapAiQuery('f1', 'How large is my farm?');
    expect(result).toHaveProperty('text');
    expect(typeof result.text).toBe('string');
  });

  it('formatHectares returns formatted string', () => {
    expect(formatHectares(12.3456)).toBe('12.35 ha');
  });

  it('formatAcres returns formatted string', () => {
    expect(formatAcres(30.5)).toBe('30.50 ac');
  });

  it('formatMeters returns formatted string', () => {
    expect(formatMeters(500)).toBe('500.0 m');
    expect(formatMeters(1500)).toBe('1.50 km');
  });

  it('formatMeasurementValue returns formatted string', () => {
    expect(formatMeasurementValue(100, 'distance')).toBe('100.0 m');
    expect(formatMeasurementValue(0.5, 'area')).toBe('0.50 ha');
  });

  it('getFarmLocation includes address fields in mock mode', async () => {
    const loc = await getFarmLocation('f1');
    expect(loc).toHaveProperty('address');
    expect(loc).toHaveProperty('city');
    expect(loc).toHaveProperty('district');
    expect(loc).toHaveProperty('country');
    expect(loc).toHaveProperty('plusCode');
  });

  it('updateFarmLocation accepts address fields in mock mode', async () => {
    const loc = await updateFarmLocation('f1', { address: '123 Farm Rd', city: 'Dairytown', district: 'Central', country: 'Kenya', plusCode: 'ABC+123' });
    expect(loc.address).toBe('123 Farm Rd');
    expect(loc.city).toBe('Dairytown');
  });

  it('loadGoogleMapsScript resolves when google maps already present', async () => {
    const w = window as any;
    w.google = w.google || {};
    w.google.maps = w.google.maps || { Map: class {} };
    await expect(loadGoogleMapsScript('test-key')).resolves.toBeUndefined();
  });

  it('pregnancies returns array in mock mode', async () => {
    const ps = await pregnancies('f1');
    expect(Array.isArray(ps)).toBe(true);
  });

  it('createPregnancy adds a pregnancy in mock mode', async () => {
    const before = (await pregnancies('f1')).length;
    await createPregnancy('f1', { cowId: 'f1-c0', breedingId: 'f1-c0-br', confirmationDate: '2024-01-01', status: 'confirmed', expectedCalvingDate: '2024-09-01' });
    const after = (await pregnancies('f1')).length;
    expect(after).toBe(before + 1);
  });

  it('updatePregnancy updates a pregnancy in mock mode', async () => {
    const ps = await pregnancies('f1');
    const target = ps[0];
    if (target) {
      await updatePregnancy(target.id, { status: 'failed' });
      const updated = (await pregnancies('f1')).find((p: any) => p.id === target.id);
      expect(updated?.status).toBe('failed');
    }
  });

  it('deletePregnancy removes a pregnancy in mock mode', async () => {
    const ps = await pregnancies('f1');
    const target = ps[0];
    if (target) {
      await deletePregnancy(target.id);
      const after = await pregnancies('f1');
      expect(after.find((p: any) => p.id === target.id)).toBeUndefined();
    }
  });

  it('offspring returns array in mock mode', async () => {
    const os = await offspring('f1');
    expect(Array.isArray(os)).toBe(true);
  });

  it('createOffspring adds an offspring in mock mode', async () => {
    const before = (await offspring('f1')).length;
    await createOffspring('f1', { animalId: 'f1-c0', motherId: 'f1-c1', fatherId: 'f1-c2' });
    const after = (await offspring('f1')).length;
    expect(after).toBe(before + 1);
  });

  it('deleteOffspring removes an offspring in mock mode', async () => {
    const os = await offspring('f1');
    const target = os[0];
    if (target) {
      await deleteOffspring(target.id);
      const after = await offspring('f1');
      expect(after.find((o: any) => o.id === target.id)).toBeUndefined();
    }
  });
});
