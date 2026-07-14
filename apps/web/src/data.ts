import * as mock from './mock';
import { isLive, apiGet, apiSend } from './api';

function q(params: Record<string, any>): string {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  return p ? `?${p}` : '';
}

// ---------- Farms ----------
export async function loadFarms(): Promise<{ id: string; name: string; location: string; cows: number }[]> {
  if (!isLive) return mock.FARMS;
  const res = await apiGet<{ data: { id: string; name: string; address: string; cows: number }[] }>('/farms');
  return res.data.map((f) => ({ id: f.id, name: f.name, location: f.address ?? '', cows: f.cows }));
}

// ---------- Dashboard ----------
export const dashboardSummary = (farmId: string) =>
  isLive ? apiGet<any>(`/dashboard/summary${q({ farmId })}`) : Promise.resolve(mock.farmSummary(farmId));

export const milkTrend = async (farmId: string) => {
  if (!isLive) return mock.milkTrend(farmId);
  const r = await apiGet<{ labels: string[]; data: number[] }>(`/dashboard/milk-trend${q({ farmId })}`);
  return r.data;
};
export const incomeExpense = async (farmId: string) => {
  if (!isLive) return mock.incomeExpense(farmId);
  const r = await apiGet<{ labels: string[]; income: number[]; expense: number[] }>(`/dashboard/income-expense${q({ farmId })}`);
  return { income: r.income, expense: r.expense };
};
export const feedConsumption = async (farmId: string) => {
  if (!isLive) return mock.feedConsumption(farmId);
  const r = await apiGet<{ labels: string[]; series: Record<string, number[]> }>(`/dashboard/feed-consumption${q({ farmId })}`);
  const n = r.labels.length;
  const z = () => Array(n).fill(0);
  return {
    labels: r.labels,
    silage: r.series['Silage'] || z(),
    hay: r.series['Hay'] || z(),
    conc: r.series['Concentrate'] || z(),
  };
};
export const breedPopulation = (farmId: string) =>
  isLive ? apiGet<any[]>(`/dashboard/breed-population${q({ farmId })}`) : Promise.resolve(mock.breedPopulation(farmId));
export const healthDistribution = (farmId: string) =>
  isLive ? apiGet<any[]>(`/dashboard/health-distribution${q({ farmId })}`) : Promise.resolve(mock.healthDistribution(farmId));

// ---------- Cows ----------
export interface CowSummary {
  id: string; cowCode: string; earTag: string; name: string; breed: string;
  gender: string; health: string; isMilking: boolean; isPregnant: boolean;
  weightKg: number; color: string; avgDailyMilk: number;
}
export interface CowDetail extends CowSummary {
  dob: string; barnId?: string; motherId?: string; fatherId?: string;
  milk: { date: string; morning: number; afternoon: number; evening: number }[];
  weights: { date: string; kg: number }[];
  vaccinations: { id: string; name: string; due: string; done: boolean }[];
  treatments: { id: string; disease: string; diagnosis: string; date: string; status: string }[];
  breedings: { id: string; method: string; date: string; expectedCalving: string; result: string }[];
  feed: { id: string; feed: string; date: string; kg: number }[];
  productivityScore: number;
}

function normalizeSummary(c: any): CowSummary {
  return {
    id: c.id, cowCode: c.cow_code ?? c.cowCode, earTag: c.ear_tag ?? c.earTag,
    name: c.name, breed: c.breed, gender: c.gender, health: c.health,
    isMilking: c.is_milking ?? c.isMilking, isPregnant: c.is_pregnant ?? c.isPregnant,
    weightKg: Number(c.weight_kg ?? c.weightKg ?? 0),
    color: mock.BREED_COLOR[c.breed] || '#888', avgDailyMilk: Number(c.avgDailyMilk ?? 0),
  };
}

export async function listCows(farmId: string, filters: { search?: string; breed?: string; health?: string; pregnant?: string; gender?: string } = {}) {
  if (!isLive) {
    let cows = mock.cowsByFarm(farmId);
    if (filters.search) { const s = filters.search.toLowerCase(); cows = cows.filter((c) => `${c.cowCode} ${c.name} ${c.earTag}`.toLowerCase().includes(s)); }
    if (filters.breed) cows = cows.filter((c) => c.breed === filters.breed);
    if (filters.health) cows = cows.filter((c) => c.health === filters.health);
    if (filters.pregnant === 'yes') cows = cows.filter((c) => c.isPregnant);
    if (filters.pregnant === 'no') cows = cows.filter((c) => !c.isPregnant);
    return cows.map(normalizeSummary);
  }
  const res = await apiGet<{ data: any[] }>(`/cows${q({ farmId, ...filters, pageSize: 300 })}`);
  return res.data.map(normalizeSummary);
}

export async function getCow(id: string): Promise<CowDetail> {
  if (!isLive) {
    const c = mock.ALL_COWS.find((x) => x.id === id)!;
    return {
      ...normalizeSummary(c),
      dob: c.dob, barnId: c.barnId, motherId: c.motherId, fatherId: c.fatherId,
      milk: c.milk, weights: c.weights, vaccinations: c.vaccinations, treatments: c.treatments,
      breedings: c.breedings, feed: c.feed, productivityScore: c.productivityScore,
    };
  }
  const c = await apiGet<any>(`/cows/${id}`);
  const totals = c.milk.map((m: any) => Number(m.morning_liters) + Number(m.afternoon_liters) + Number(m.evening_liters));
  const avg = totals.length ? totals.reduce((a: number, b: number) => a + b, 0) / totals.length : 0;
  return {
    id: c.id, cowCode: c.cow_code, earTag: c.ear_tag, name: c.name, breed: c.breed,
    gender: c.gender, health: c.health, isMilking: c.is_milking, isPregnant: c.is_pregnant,
    weightKg: Number(c.weight_kg), color: mock.BREED_COLOR[c.breed] || '#888', avgDailyMilk: +avg.toFixed(1),
    dob: c.date_of_birth, barnId: c.barn_id, motherId: c.mother_id, fatherId: c.father_id,
    milk: c.milk.map((m: any) => ({ date: m.recorded_on, morning: Number(m.morning_liters), afternoon: Number(m.afternoon_liters), evening: Number(m.evening_liters) })),
    vaccinations: (c.vaccinations || []).map((v: any) => ({ id: v.id, name: v.vaccine_name, due: v.due_on, done: !!v.administered_on })),
    treatments: (c.treatments || []).map((t: any) => ({ id: t.id, disease: t.disease_id || 'Condition', diagnosis: t.diagnosis, date: t.diagnosed_on, status: t.status || 'Active' })),
    breedings: (c.breedings || []).map((b: any) => ({ id: b.id, method: b.method, date: b.serviced_on, expectedCalving: b.expected_calving_on, result: b.result })),
    feed: (c.feed || []).map((f: any) => ({ id: f.id, feed: f.feed_type_id, date: f.consumed_on, kg: Number(f.quantity) })),
    weights: [], productivityScore: Math.min(99, Math.round(40 + avg * 1.5)),
  };
}

export const createCow = (farmId: string, body: any) =>
  isLive ? apiSend(`/cows${q({ farmId })}`, 'POST', body) : (() => {
    const newCow: mock.Cow = {
      id: `${farmId}-c${mock.ALL_COWS.length}`,
      farmId,
      cowCode: `${farmId.toUpperCase().slice(0, 2)}-${String(mock.ALL_COWS.filter((c) => c.farmId === farmId).length + 1).padStart(3, '0')}`,
      earTag: body.ear_tag ?? body.earTag ?? `ET${mock.intBetween(10000, 99999)}`,
      name: body.name,
      breed: body.breed,
      gender: body.gender ?? 'female',
      dob: new Date().toISOString().slice(0, 10),
      weightKg: Number(body.weight_kg ?? body.weightKg ?? 0),
      color: mock.BREED_COLOR[body.breed] || '#888',
      health: body.health ?? 'healthy',
      isMilking: body.is_milking ?? body.isMilking ?? false,
      isPregnant: body.is_pregnant ?? body.isPregnant ?? false,
      barnId: mock.BARNS[0].id,
      avgDailyMilk: 0,
      milk: [],
      weights: [],
      vaccinations: [],
      treatments: [],
      breedings: [],
      feed: [],
      productivityScore: 50,
    };
    mock.ALL_COWS.push(newCow);
    return Promise.resolve(undefined);
  })();

// ---------- Insights ----------
export const predictions = (farmId: string) =>
  isLive ? apiGet<any>(`/predictions${q({ farmId })}`) : Promise.resolve(mock.predictions(farmId));

export const analytics = async (farmId: string) => {
  if (!isLive) return mock.analytics(farmId);
  const r = await apiGet<any>(`/analytics${q({ farmId })}`);
  const fix = (arr: any[]) => arr.map((x) => ({ name: x.name, breed: x.breed, cowCode: x.cow_code, avgDailyMilk: Number(x.avg_daily_milk) }));
  return {
    best: fix(r.best), worst: fix(r.worst),
    breedPerf: r.breedPerf.map((b: any) => ({ breed: b.breed, avg: Number(b.avg), count: b.count })),
    diseaseTrend: r.diseaseTrend, feedEfficiency: r.feedEfficiency, financialPerf: r.financialPerf,
  };
};

export const finance = (farmId: string) =>
  isLive ? apiGet<any>(`/finance${q({ farmId })}`) : Promise.resolve(mock.finance(farmId));

export const weather = () =>
  isLive ? apiGet<any>('/weather') : Promise.resolve(mock.WEATHER);

export const sustainability = (farmId: string) =>
  isLive ? apiGet<any>(`/sustainability${q({ farmId })}`) : Promise.resolve(mock.sustainability(farmId));

// ---------- AI assistant ----------
export const aiAsk = async (question: string, farmId: string) => {
  if (!isLive) return mock.aiAnswer(question, farmId);
  const r = await apiSend<{ answer: string }>(`/ai/ask${q({ farmId })}`, 'POST', { question });
  return r.answer;
};

// ---------- Gallery / Customers / Employees / Map ----------
export const gallery = (farmId: string) =>
  isLive ? apiGet<any[]>(`/gallery${q({ farmId })}`) : Promise.resolve(mock.GALLERY);

export const customers = (farmId: string) =>
  isLive ? apiGet<{ data: any[] }>(`/customers${q({ farmId })}`).then((r) => r.data) : Promise.resolve(mock.CUSTOMERS);

export const customerInvoices = (id: string) =>
  isLive ? apiGet<{ data: any[] }>(`/customers/${id}/invoices`).then((r) => r.data) : Promise.resolve(mock.INVOICES);

export const employees = (farmId: string) =>
  isLive ? apiGet<{ data: any[] }>(`/employees${q({ farmId })}`).then((r) => r.data) : Promise.resolve(mock.EMPLOYEES);

export const mapNodes = (farmId: string) =>
  isLive ? apiGet<{ barns: any[] }>(`/map${q({ farmId })}`) : Promise.resolve({ barns: mock.BARNS.map((b) => ({ id: b.id, name: b.name, cows: mock.cowsByFarm(farmId).filter((c) => c.barnId === b.id).length, capacity: 30 + mock.rndInt(0, 40) })) });

// ---------- Notifications ----------
const TONE: Record<string, string> = { sick: 'danger', vaccination: 'warn', feed: 'warn', medicine: 'warn', heat: 'info', calving: 'info', task: 'info', payment: 'warn' };
export const notifications = async () => {
  if (!isLive) return mock.NOTIFICATIONS;
  const r = await apiGet<{ data: any[] }>('/notifications');
  return r.data.map((n) => ({
    id: n.id, type: n.type, title: n.title, body: n.body,
    tone: TONE[n.type] || 'info', time: n.read_at ? 'read' : 'new',
  }));
};
