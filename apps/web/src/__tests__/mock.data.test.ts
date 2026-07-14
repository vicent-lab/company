import { describe, it, expect } from 'vitest';
import { analytics, finance, farmSummary } from '../mock';
import { listCows, mapNodes, createCow } from '../data';

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
});
