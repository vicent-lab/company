import { daysAgo, daysFromNow } from './format';

// Deterministic PRNG so data is stable across reloads.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20240607);
const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
const between = (a: number, b: number) => a + rnd() * (b - a);
export const intBetween = (a: number, b: number) => Math.floor(between(a, b + 1));
export const rndInt = intBetween;

export const BREEDS = ['Holstein', 'Jersey', 'Guernsey', 'Ayrshire', 'Brown Swiss', 'Fleckvieh'];
export const BREED_COLOR: Record<string, string> = {
  Holstein: '#2b2b2b',
  Jersey: '#c79a5b',
  Guernsey: '#d9a441',
  Ayrshire: '#b5651d',
  'Brown Swiss': '#8a6240',
  Fleckvieh: '#9c7a52',
};
const HEALTH = ['healthy', 'sick', 'under_treatment'] as const;
const NAMES = ['Bella','Daisy','Lola','Molly','Rosie','Buttercup','Clover','Penny','Ruby','Ginger','Luna','Maple','Hazel','Olive','Pearl','Willow','Ivy','Nina','Coco','Sasha','Tilly','Fern','Jade','Sienna','Zoe','Cleo','Mia','Rosi','Annie','Goldie','Blue','Violet','Tess','Nell','Poppy','Wren','Star','Marigold','Winnie','Dottie','Betsy','Flossie','Maisie','Bonnie','Cinnamon','Juniper'];

export interface Farm { id: string; name: string; location: string; cows: number; }
export const FARMS: Farm[] = [
  { id: 'f1', name: 'Greenfield Dairy', location: 'Waikato, NZ', cows: 0 },
  { id: 'f2', name: 'Sunrise Holsteins', location: 'Wisconsin, US', cows: 0 },
  { id: 'f3', name: 'Highland Ayrshires', location: 'Ayr, Scotland', cows: 0 },
];

export interface MilkRecord { date: string; morning: number; afternoon: number; evening: number; }
export interface WeightPoint { date: string; kg: number; }
export interface Vaccination { id: string; name: string; due: string; done: boolean; }
export interface Treatment { id: string; disease: string; diagnosis: string; date: string; status: string; vetName: string; }
export interface Breeding { id: string; method: string; date: string; expectedCalving: string; result: string; }
export interface FeedRecord { id: string; feed: string; date: string; kg: number; }

export interface Cow {
  id: string;
  farmId: string;
  cowCode: string;
  earTag: string;
  name: string;
  breed: string;
  gender: 'female' | 'male';
  dob: string;
  weightKg: number;
  color: string;
  health: typeof HEALTH[number];
  isMilking: boolean;
  isPregnant: boolean;
  waterIntakeLiters: number;
  status: string;
  deathDate?: string;
  deathCause?: string;
  deathNotes?: string;
  barnId: string;
  motherId?: string;
  fatherId?: string;
  avgDailyMilk: number;
  milk: MilkRecord[];
  weights: WeightPoint[];
  vaccinations: Vaccination[];
  treatments: Treatment[];
  breedings: Breeding[];
  feed: FeedRecord[];
  productivityScore: number;
}

export const BARNS = [
  { id: 'b1', name: 'Barn A — Milking', x: 22, y: 30 },
  { id: 'b2', name: 'Barn B — Dry', x: 60, y: 22 },
  { id: 'b3', name: 'Calf Barn', x: 80, y: 55 },
  { id: 'b4', name: 'Isolation', x: 14, y: 72 },
];

function genMilk(days: number, base: number): MilkRecord[] {
  const out: MilkRecord[] = [];
  for (let i = days; i >= 0; i--) {
    const wobble = 1 + (rnd() - 0.5) * 0.25;
    const trend = 1 - (i / days) * 0.15;
    const total = base * wobble * trend;
    out.push({
      date: daysAgo(i),
      morning: +(total * 0.4).toFixed(1),
      afternoon: +(total * 0.35).toFixed(1),
      evening: +(total * 0.25).toFixed(1),
    });
  }
  return out;
}
function genWeights(days: number, start: number): WeightPoint[] {
  const out: WeightPoint[] = [];
  let w = start;
  for (let i = days; i >= 0; i -= 15) {
    out.push({ date: daysAgo(i), kg: +w.toFixed(1) });
    w += between(2, 6);
  }
  return out;
}

const VACCINES = ['FMD', 'Brucellosis', 'BVD', 'Leptospirosis', 'Clostridial', 'IBR'];
function genVacc(cow: string): Vaccination[] {
  return VACCINES.map((v, i) => {
    const dueSoon = rnd() < 0.18;
    return {
      id: `${cow}-v${i}`,
      name: v,
      due: dueSoon ? daysFromNow(intBetween(1, 7)) : daysFromNow(intBetween(20, 300)),
      done: !dueSoon && rnd() > 0.4,
    };
  });
}

export function genCows(farmId: string, count: number, startIdx: number): Cow[] {
  const cows: Cow[] = [];
  const motherPool: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = `${farmId}-c${i}`;
    const breed = pick(BREEDS);
    const gender: 'female' | 'male' = rnd() < 0.82 ? 'female' : 'male';
    const isMilking = gender === 'female' && rnd() < 0.7;
    const base = isMilking ? between(14, 34) : 0;
    const health = rnd() < 0.78 ? 'healthy' : pick(['sick', 'under_treatment'] as const);
    const isPregnant = gender === 'female' && rnd() < 0.35;
    const cow: Cow = {
      id,
      farmId,
      cowCode: `${farmId.toUpperCase().slice(0, 2)}-${String(startIdx + i).padStart(3, '0')}`,
      earTag: `ET${intBetween(10000, 99999)}`,
      name: pick(NAMES) + (rnd() < 0.3 ? ' ' + pick(['II', 'Jr', 'III', 'Rose']) : ''),
      breed,
      gender,
      dob: daysAgo(intBetween(400, 2400)),
      weightKg: +between(380, 720).toFixed(0),
      color: BREED_COLOR[breed],
      health,
      isMilking,
      isPregnant,
      waterIntakeLiters: +between(40, 100).toFixed(0),
      status: 'active',
      barnId: pick(BARNS).id,
      motherId: motherPool.length > 3 ? pick(motherPool) : undefined,
      fatherId: undefined,
      avgDailyMilk: +base.toFixed(1),
      milk: isMilking ? genMilk(30, base) : [],
      weights: genWeights(180, between(60, 120)),
      vaccinations: genVacc(id),
      treatments:
        health !== 'healthy'
          ? [
              {
                id: `${id}-t`,
                disease: pick(['Mastitis', 'Lameness', 'Metritis', 'Respiratory']),
                diagnosis: 'Monitored and treated',
                date: daysAgo(intBetween(1, 20)),
                status: health === 'sick' ? 'Active' : 'Recovering',
                vetName: pick(['Dr. Smith', 'Dr. Johnson', 'Dr. Williams', 'Dr. Brown', 'Dr. Davis']),
              },
            ]
          : [],
      breedings:
        isPregnant || rnd() < 0.5
          ? [
              {
                id: `${id}-br`,
                method: pick(['AI', 'Natural', 'ET']),
                date: daysAgo(intBetween(60, 300)),
                expectedCalving: daysFromNow(intBetween(10, 120)),
                result: isPregnant ? 'Pregnant' : 'Open',
              },
            ]
          : [],
      feed: Array.from({ length: 6 }, (_, k) => ({
        id: `${id}-f${k}`,
        feed: pick(['Silage', 'Hay', 'Concentrate', 'Alfalfa', 'Maize']),
        date: daysAgo(k * 5),
        kg: +between(12, 28).toFixed(1),
      })),
      productivityScore: +between(35, 98).toFixed(0),
    };
    if (gender === 'female' && rnd() < 0.5) motherPool.push(id);
    cows.push(cow);
  }
  // assign fathers for some
  cows.forEach((c) => { if (rnd() < 0.3) c.fatherId = pick(cows).id; });
  FARMS.find((f) => f.id === farmId)!.cows = count;
  return cows;
}

export const ALL_COWS: Cow[] = [
  ...genCows('f1', 60, 1),
  ...genCows('f2', 48, 1),
  ...genCows('f3', 38, 1),
];

export const cowsByFarm = (farmId: string) => ALL_COWS.filter((c) => c.farmId === farmId);

export interface FarmSummary {
  totalCows: number; milkingCows: number; milkToday: number; milkMonth: number;
  revenue: number; expenses: number; profit: number; pregnantCows: number;
  sickCows: number; feedStock: number; upcomingVacc: number;
}

// ---- Aggregations ----
const summaryCache = new Map<string, FarmSummary>();
export function farmSummary(farmId: string): FarmSummary {
  const cached = summaryCache.get(farmId);
  if (cached) return cached;
  const cows = cowsByFarm(farmId);
  const milkToday = cows.reduce((s, c) => s + c.avgDailyMilk, 0);
  const pregnant = cows.filter((c) => c.isPregnant).length;
  const sick = cows.filter((c) => c.health !== 'healthy').length;
  const milking = cows.filter((c) => c.isMilking).length;
  const feedStock = Math.round(between(1200, 4200));
  const upcomingVacc = cows.reduce((s, c) => s + c.vaccinations.filter((v) => !v.done && new Date(v.due) <= new Date(daysFromNow(7))).length, 0);
  const revenue = Math.round(between(48000, 92000));
  const expenses = Math.round(between(30000, 60000));
  const out: FarmSummary = {
    totalCows: cows.length,
    milkingCows: milking,
    milkToday: +milkToday.toFixed(0),
    milkMonth: Math.round(milkToday * 30),
    revenue,
    expenses,
    profit: revenue - expenses,
    pregnantCows: pregnant,
    sickCows: sick,
    feedStock,
    upcomingVacc,
  };
  summaryCache.set(farmId, out);
  return out;
}

export const monthLabels = Array.from({ length: 12 }, (_, i) =>
  new Date(2024, i, 1).toLocaleDateString('en-US', { month: 'short' })
);

export function milkTrend(farmId: string): number[] {
  const base = farmSummary(farmId).milkToday;
  return monthLabels.map((_, i) => Math.round(base * (22 + i * 0.7) * (1 + (rnd() - 0.5) * 0.08)));
}
export function incomeExpense(farmId: string) {
  const s = farmSummary(farmId);
  return {
    income: monthLabels.map(() => Math.round(s.revenue / 12 * between(0.8, 1.2))),
    expense: monthLabels.map(() => Math.round(s.expenses / 12 * between(0.8, 1.2))),
  };
}
export function feedConsumption(farmId: string): { labels: string[]; silage: number[]; hay: number[]; conc: number[] } {
  const labels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  return {
    labels,
    silage: labels.map(() => Math.round(between(80, 160))),
    hay: labels.map(() => Math.round(between(40, 100))),
    conc: labels.map(() => Math.round(between(20, 60))),
  };
}

export function tasks(farmId: string, filters?: { status?: string; assignedTo?: string }) {
  let list = TASKS.filter((t: any) => true);
  if (filters?.status) list = list.filter((t: any) => t.status === filters.status);
  if (filters?.assignedTo) list = list.filter((t: any) => t.assignedTo === filters.assignedTo);
  return list;
}

export function dailyActivities(farmId: string, date: string) {
  return DAILY_ACTIVITIES.filter((a: any) => a.activity_date === date);
}

export function breedPopulation(farmId: string) {
  const cows = cowsByFarm(farmId);
  return BREEDS.map((b) => ({ breed: b, count: cows.filter((c) => c.breed === b).length })).filter((x) => x.count > 0);
}
export function healthDistribution(farmId: string) {
  const cows = cowsByFarm(farmId);
  return HEALTH.map((h) => ({ health: h, count: cows.filter((c) => c.health === h).length }));
}

// ---- Live cow locations (manual zones today; RFID/GPS-ready shape) ----
export type CalvingRisk = 'none' | 'watch' | 'high';
export interface CowLocation {
  cowId: string; cowCode: string; name: string; breed: string;
  health: string; isPregnant: boolean; isMilking: boolean;
  zone: string; activity: string; source: 'manual' | 'rfid' | 'gps';
  milkToday: number; readyForBreeding: boolean;
  expectedCalvingOn: string | null; daysUntilDue: number | null;
  lastCalvingOn: string | null; daysSinceCalving: number | null; lastDifficultyScore: number | null;
  recentlyCalved: boolean; calvingRisk: CalvingRisk;
}
// Session-local manual overrides so "move cow to zone" works in demo mode too.
export const COW_LOCATION_OVERRIDES: Record<string, { zone: string; activity: string }> = {};

function hashSeed(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function baseLocationFor(cow: Cow): { zone: string; activity: string } {
  const r = mulberry32(hashSeed(cow.id))();
  const r2 = mulberry32(hashSeed(cow.id + 'a'))();
  if (cow.health !== 'healthy') return { zone: 'vet', activity: 'sick_bay' };
  if (cow.isMilking) {
    return {
      zone: ['barnA', 'milk', 'graze1', 'graze2'][Math.floor(r * 4)],
      activity: ['eating', 'grazing', 'milking', 'resting'][Math.floor(r2 * 4)],
    };
  }
  return {
    zone: ['barnB', 'graze2'][Math.floor(r * 2)],
    activity: ['resting', 'grazing'][Math.floor(r2 * 2)],
  };
}
function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso); from.setHours(0, 0, 0, 0);
  const to = new Date(toIso); to.setHours(0, 0, 0, 0);
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}
export function cowLocations(farmId: string): CowLocation[] {
  const todayIso = new Date().toISOString().slice(0, 10);
  return cowsByFarm(farmId).filter((c) => c.status === 'active').map((c) => {
    const base = baseLocationFor(c);
    const override = COW_LOCATION_OVERRIDES[c.id];
    const last = c.milk[c.milk.length - 1];

    const activePregnancy = c.breedings.find((b) => b.result === 'Pregnant');
    const expectedCalvingOn = activePregnancy ? activePregnancy.expectedCalving : null;
    const daysUntilDue = expectedCalvingOn ? daysBetween(todayIso, expectedCalvingOn) : null;

    // No calving-history array on the mock Cow model, so it's reconstructed deterministically
    // (same seeded-PRNG pattern used for zone/activity above) rather than left unmodeled.
    const hasHistory = mulberry32(hashSeed(c.id + 'calve'))() < (c.isPregnant ? 0.25 : 0.35);
    let lastCalvingOn: string | null = null;
    let difficultyScore: number | null = null;
    if (hasHistory) {
      const daysAgoVal = c.isPregnant
        ? 60 + Math.floor(mulberry32(hashSeed(c.id + 'calvedays'))() * 440)
        : mulberry32(hashSeed(c.id + 'recent'))() < 0.25
          ? Math.floor(mulberry32(hashSeed(c.id + 'calvedays'))() * 14)
          : 30 + Math.floor(mulberry32(hashSeed(c.id + 'calvedays'))() * 470);
      lastCalvingOn = daysAgo(daysAgoVal);
      difficultyScore = mulberry32(hashSeed(c.id + 'diff'))() < 0.15
        ? 4 + Math.floor(mulberry32(hashSeed(c.id + 'diff2'))() * 2)
        : 1 + Math.floor(mulberry32(hashSeed(c.id + 'diff2'))() * 2);
    }
    const daysSinceCalving = lastCalvingOn ? daysBetween(lastCalvingOn, todayIso) : null;
    const recentlyCalved = daysSinceCalving !== null && daysSinceCalving >= 0 && daysSinceCalving <= 14;

    let calvingRisk: CalvingRisk = 'none';
    if (c.isPregnant) {
      const overdue = daysUntilDue !== null && daysUntilDue < 0;
      const dueSoon = daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 3;
      const healthFlag = c.health !== 'healthy';
      const historyFlag = difficultyScore !== null && difficultyScore >= 4;
      if (overdue || (dueSoon && (healthFlag || historyFlag))) calvingRisk = 'high';
      else if (dueSoon || healthFlag || historyFlag) calvingRisk = 'watch';
    }

    return {
      cowId: c.id, cowCode: c.cowCode, name: c.name, breed: c.breed,
      health: c.health, isPregnant: c.isPregnant, isMilking: c.isMilking,
      zone: override?.zone || base.zone, activity: override?.activity || base.activity,
      source: 'manual',
      milkToday: last ? +(last.morning + last.afternoon + last.evening).toFixed(1) : 0,
      readyForBreeding: !c.isPregnant && c.gender === 'female' && c.health === 'healthy' && mulberry32(hashSeed(c.id + 'b'))() < 0.12,
      expectedCalvingOn, daysUntilDue, lastCalvingOn, daysSinceCalving, lastDifficultyScore: difficultyScore, recentlyCalved, calvingRisk,
    };
  });
}

// ---- Zone heat map (health / milk production / feed consumption, aggregated per zone) ----
export interface ZoneRecommendation { severity: 'warning' | 'critical'; title: string; body: string; }
export interface ZoneHeat {
  zone: string;
  cowCount: number;
  health: { healthyCount: number; sickCount: number; attentionCount: number; category: 'healthy' | 'warning' | 'disease_cluster' | 'unknown' };
  milk: { avgPerCow: number | null; totalToday: number | null; category: 'high' | 'average' | 'low' | 'none' };
  feed: { avgKgPerCow: number | null; targetKg: number; pct: number | null; daysRemaining: number | null };
  recommendations: ZoneRecommendation[];
}
const FEED_TARGET_KG = 25;
const HEATMAP_OUTDOOR_ZONES = new Set(['graze1', 'graze2']);
function computeZoneRecommendations(
  zone: string, cowCount: number,
  health: ZoneHeat['health'], milk: ZoneHeat['milk'], feed: ZoneHeat['feed'],
  weatherObs: { humidity: number; heatStress: StressLevel; coldStress: StressLevel }
): ZoneRecommendation[] {
  if (cowCount === 0) return [];
  const indoor = !HEATMAP_OUTDOOR_ZONES.has(zone);
  const recs: ZoneRecommendation[] = [];
  if (indoor && weatherObs.humidity > 75) {
    recs.push({ severity: 'warning', title: 'Humidity is high', body: 'Open ventilation. Risk of respiratory disease increased.' });
  }
  if (health.category === 'disease_cluster') {
    recs.push({ severity: 'critical', title: `${health.sickCount + health.attentionCount} of ${cowCount} cows sick or under treatment`, body: 'Isolate affected animals and schedule a vet review. Risk of spread to the rest of the herd here.' });
  }
  if (feed.daysRemaining !== null && feed.daysRemaining < 3) {
    recs.push({ severity: 'critical', title: 'Feed running low for this zone', body: `Only ${feed.daysRemaining} day(s) of feed left at current stock and consumption. Reorder soon to avoid ration cuts.` });
  }
  if (milk.category === 'low') {
    recs.push({ severity: 'warning', title: 'Milk yield below herd average', body: 'Check feed, water access, and heat exposure for cows in this zone.' });
  }
  if (!indoor && weatherObs.heatStress !== 'none') {
    recs.push({ severity: weatherObs.heatStress === 'severe' ? 'critical' : 'warning', title: "Cows are fully exposed to today's heat", body: 'Move the grazing herd to a shaded barn. Heat-stressed cows eat less and produce less milk for days.' });
  }
  if (!indoor && weatherObs.coldStress !== 'none') {
    recs.push({ severity: weatherObs.coldStress === 'severe' ? 'critical' : 'warning', title: "Cows are fully exposed to today's cold", body: 'Move the grazing herd into a sheltered barn and increase ration energy density.' });
  }
  return recs;
}
export type Period = 'today' | 'yesterday' | 'week' | 'month' | 'forecast';
function periodOffset(period: Period): { from: number; to: number } {
  switch (period) {
    case 'yesterday': return { from: 1, to: 1 };
    case 'week': return { from: 6, to: 0 };
    case 'month': return { from: 29, to: 0 };
    default: return { from: 0, to: 0 };
  }
}
// cow.milk is ordered oldest→newest with the last entry = today (offset 0); this is real
// 30-day per-cow history, so past periods here are genuinely reconstructed, not invented.
function milkAvgInPeriod(cow: Cow, period: Period): number | null {
  if (!cow.isMilking || !cow.milk.length) return null;
  const { from, to } = periodOffset(period);
  const n = cow.milk.length;
  const idxFrom = Math.max(0, n - 1 - from);
  const idxTo = Math.min(n - 1, n - 1 - to);
  const slice = cow.milk.slice(idxFrom, idxTo + 1);
  if (!slice.length) return null;
  return slice.reduce((s, m) => s + m.morning + m.afternoon + m.evening, 0) / slice.length;
}
function milkTrendPct(cow: Cow): number {
  if (!cow.milk.length) return 0;
  const totals = cow.milk.map((m) => m.morning + m.afternoon + m.evening);
  const recent = totals.slice(-7);
  const older = totals.slice(0, -7);
  const recentAvg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
  const olderAvg = older.length ? older.reduce((a, b) => a + b, 0) / older.length : 0;
  return olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;
}
export function zoneHeatmap(farmId: string, period: Period = 'today'): { data: ZoneHeat[]; herdAvgMilk: number; farmFeedStockKg: number } {
  const farmFeedStockKg = farmSummary(farmId).feedStock;
  const weatherObs = weather(farmId, period);

  const cows = cowsByFarm(farmId).filter((c) => c.status === 'active');
  const byId = new Map(cows.map((c) => [c.id, c]));
  const locs = cowLocations(farmId);

  const byZone: Record<string, CowLocation[]> = {};
  for (const l of locs) (byZone[l.zone] ||= []).push(l);

  const milkers = locs.filter((l) => l.isMilking);
  const herdVals = milkers.map((l) => milkAvgInPeriod(byId.get(l.cowId)!, period)).filter((v): v is number => v !== null);
  const herdAvgMilkRaw = herdVals.length ? herdVals.reduce((a, b) => a + b, 0) / herdVals.length : 0;
  const herdTrendPct = milkers.length ? milkers.reduce((s, l) => s + milkTrendPct(byId.get(l.cowId)!), 0) / milkers.length : 0;
  const herdAvgMilk = period === 'forecast' ? herdAvgMilkRaw * (1 + herdTrendPct / 100) : herdAvgMilkRaw;

  const data: ZoneHeat[] = Object.entries(byZone).map(([zone, list]) => {
    const cowCount = list.length;

    // Health has no stored history in mock mode either — 'today' uses live cow.health;
    // other periods use a deterministic pseudo-history flag, weighted toward cows that are
    // currently unhealthy (an ongoing issue plausibly shows up nearby in time too).
    let healthyCount: number, sickCount: number;
    if (period === 'today') {
      healthyCount = list.filter((l) => l.health === 'healthy').length;
      sickCount = cowCount - healthyCount;
    } else if (period === 'forecast') {
      healthyCount = 0; sickCount = 0;
    } else {
      sickCount = list.filter((l) => mulberry32(hashSeed(l.cowId + period))() < (l.health !== 'healthy' ? 0.6 : 0.08)).length;
      healthyCount = cowCount - sickCount;
    }
    const sickPct = cowCount ? sickCount / cowCount : 0;
    const healthCategory: ZoneHeat['health']['category'] = period === 'forecast' ? 'unknown' : sickPct >= 0.25 ? 'disease_cluster' : sickPct > 0 ? 'warning' : 'healthy';

    const zoneMilkers = list.filter((l) => l.isMilking);
    const rawVals = zoneMilkers.map((l) => milkAvgInPeriod(byId.get(l.cowId)!, period)).filter((v): v is number => v !== null);
    let avgMilk = rawVals.length ? rawVals.reduce((a, b) => a + b, 0) / rawVals.length : null;
    let totalMilk = rawVals.length ? rawVals.reduce((a, b) => a + b, 0) : null;
    if (period === 'forecast' && avgMilk !== null) {
      const scale = 1 + herdTrendPct / 100;
      avgMilk *= scale;
      totalMilk = totalMilk !== null ? totalMilk * scale : null;
    }
    let milkCategory: ZoneHeat['milk']['category'] = 'none';
    if (avgMilk !== null && herdAvgMilk > 0) {
      const ratio = avgMilk / herdAvgMilk;
      milkCategory = ratio >= 1.1 ? 'high' : ratio >= 0.85 ? 'average' : 'low';
    }

    // Feed: disabled for forecast (no real signal to project from); otherwise the same
    // health/milking-based estimate used for 'today', with a small deterministic
    // per-period variance so the other tabs don't look frozen.
    let avgFeed: number | null = null;
    if (period !== 'forecast') {
      const variance = period === 'today' ? 0 : (mulberry32(hashSeed(zone + period))() - 0.5) * 4;
      avgFeed = list.reduce((s, l) => s + (l.health !== 'healthy' ? 11 : l.isMilking ? 25 : 18), 0) / (cowCount || 1) + variance;
    }
    const feedPct = avgFeed !== null ? Math.min(100, Math.round((avgFeed / FEED_TARGET_KG) * 100)) : null;
    const zoneDailyKg = avgFeed !== null ? avgFeed * cowCount : 0;
    const daysRemaining = zoneDailyKg > 0 ? Math.round((farmFeedStockKg / zoneDailyKg) * 10) / 10 : null;

    const health = { healthyCount, sickCount, attentionCount: 0, category: healthCategory };
    const milk = { avgPerCow: avgMilk !== null ? +avgMilk.toFixed(1) : null, totalToday: totalMilk !== null ? +totalMilk.toFixed(1) : null, category: milkCategory };
    const feed = { avgKgPerCow: avgFeed !== null ? +avgFeed.toFixed(1) : null, targetKg: FEED_TARGET_KG, pct: feedPct, daysRemaining };

    return {
      zone,
      cowCount,
      health,
      milk,
      feed,
      recommendations: period === 'today' ? computeZoneRecommendations(zone, cowCount, health, milk, feed, { humidity: weatherObs.humidity, heatStress: weatherObs.heatStress, coldStress: weatherObs.coldStress }) : [],
    };
  });
  return { data, herdAvgMilk: +herdAvgMilk.toFixed(1), farmFeedStockKg };
}

// ---- Predictions ----
export function predictions(farmId: string) {
  const s = farmSummary(farmId);
  const next = monthLabels.slice(0, 6).map((_, i) => Math.round(s.milkMonth * (1 + i * 0.03) * between(0.95, 1.05)));
  return {
    milkNext6: next,
    feedNeeded: Math.round(s.feedStock * 1.15),
    pregnancySuccess: Math.round(between(72, 91)),
    diseaseRisk: ['Low', 'Low', 'Moderate', 'Low', 'High', 'Moderate'][intBetween(0, 5)],
    diseaseRiskScore: intBetween(8, 64),
    profitTrend: monthLabels.slice(0, 6).map(() => Math.round(between(-5, 18))),
    inventoryShortage: ['Concentrate', 'Alfalfa', 'Maize'][intBetween(0, 2)],
  };
}

export function generateMockPredictions(farmId: string): any[] {
  const cow = pick(cowsByFarm(farmId));
  const profit = Math.round(between(800000, 2400000));
  return [
    { category: 'milk_production', forecast: Array.from({ length: 7 }, () => Math.round(between(2200, 2800))), trend: pick(['increasing', 'stable', 'decreasing'] as const), confidence: 0.78, changePct: +between(-5, 5).toFixed(1) },
    { category: 'disease_risk', score: intBetween(10, 70), level: pick(['Low', 'Moderate', 'High'] as const), topRisks: ['Mastitis', 'Lameness', 'Ketosis'], confidence: 0.80 },
    { category: 'pregnancy_success', currentRate: +between(55, 85).toFixed(1), predictedRate: intBetween(65, 95), confidence: 0.75 },
    { category: 'calving_date', upcoming: [{ cowId: cow?.id, cowCode: cow?.cowCode, expectedDate: daysFromNow(intBetween(1, 14)), daysUntil: intBetween(1, 14) }], nextMonthCount: intBetween(1, 5), confidence: 0.88 },
    { category: 'feed_shortage', riskLevel: pick(['Low', 'Moderate', 'High'] as const), daysRemaining: intBetween(5, 30), shortageType: pick(['Silage', 'Concentrate', 'Hay'] as const), confidence: 0.82 },
    { category: 'medicine_shortage', riskLevel: pick(['Low', 'Moderate', 'High'] as const), criticalMedicines: [{ name: 'Oxytetracycline', stock: intBetween(1, 8), expiryDate: daysFromNow(intBetween(10, 60)) }], confidence: 0.75 },
    { category: 'equipment_failure', riskScore: intBetween(10, 70), atRiskItems: Array.from({ length: intBetween(0, 3) }, () => pick(['Milking pump', 'Cooling compressor', 'Tractor hydraulics'])), confidence: 0.60 },
    { category: 'cash_flow', next30Days: Math.round(between(-200000, 500000)), next90Days: Math.round(between(-500000, 1500000)), trend: pick(['improving', 'stable', 'declining'] as const), confidence: 0.70 },
    { category: 'profit', next30Days: profit, next90Days: profit * 3, margin: +between(8, 30).toFixed(1), trend: pick(['increasing', 'stable', 'decreasing'] as const), confidence: 0.72 },
    { category: 'cow_productivity', topPerformers: cowsByFarm(farmId).filter(c => c.isMilking).slice(0, 3).map((c: any) => ({ cowId: c.id, cowCode: c.cowCode, predictedYield: Math.round(c.avgDailyMilk * between(0.95, 1.05)) })), lowPerformers: cowsByFarm(farmId).filter(c => c.isMilking).slice(-3).reverse().map((c: any) => ({ cowId: c.id, cowCode: c.cowCode, predictedYield: Math.round(c.avgDailyMilk * between(0.85, 0.95)) })), herdAverage: Math.round(between(22, 35)), confidence: 0.78 },
    { category: 'farmer_workload', score: intBetween(20, 85), pendingTasks: intBetween(5, 30), upcomingDeadlines: intBetween(1, 8), recommendation: pick(['Consider delegating tasks', 'Workload within range', 'Schedule extra help'] as const), confidence: 0.68 },
    { category: 'animal_stress', currentRisk: pick(['Low', 'Moderate', 'High'] as const), thi: +between(58, 82).toFixed(1), recommendation: pick(['Provide shade and extra water', 'Conditions are favorable', 'Ensure warm bedding'] as const), confidence: 0.82 },
    { category: 'water_requirements', dailyNeedLiters: intBetween(4000, 12000), currentAvailability: intBetween(5000, 15000), riskLevel: pick(['Low', 'Moderate', 'High'] as const), confidence: 0.75 },
  ];
}

// ---- Analytics ----
export function analytics(farmId: string) {
  const cows = cowsByFarm(farmId);
  const milking = cows.filter((c) => c.isMilking).sort((a, b) => b.avgDailyMilk - a.avgDailyMilk);
  const best = milking.slice(0, 5);
  const worst = [...milking].reverse().slice(0, 5);
  const breedPerf = BREEDS.map((b) => {
    const cs = cows.filter((c) => c.breed === b && c.isMilking);
    const avg = cs.length ? cs.reduce((s, c) => s + c.avgDailyMilk, 0) / cs.length : 0;
    return { breed: b, avg: +avg.toFixed(1), count: cs.length };
  }).filter((x) => x.count > 0).sort((a, b) => b.avg - a.avg);
  const diseaseTrend = monthLabels.map((_, i) => ({ month: monthLabels[i], cases: intBetween(0, 12) }));
  const feedEfficiency = +between(1.2, 1.6).toFixed(2);
  const financialPerf = Math.round(between(70, 98));
  return { best, worst, breedPerf, diseaseTrend, feedEfficiency, financialPerf };
}

// ---- Finance ----
export function finance(farmId: string) {
  const s = farmSummary(farmId);
  const inc = incomeExpense(farmId).income;
  const exp = incomeExpense(farmId).expense;
  const incomeTotal = inc.reduce((a, b) => a + b, 0);
  const expenseTotal = exp.reduce((a, b) => a + b, 0);
  return {
    cashFlow: monthLabels.map((_, i) => inc[i] - exp[i]),
    outstanding: Math.round(between(4000, 18000)),
    outstandingList: CUSTOMERS.filter((c) => c.status === 'Pending' || rnd() < 0.35).slice(0, 4).map((c, i) => ({
      id: `${farmId}-out-${i}`,
      customerName: c.name,
      customerEmail: c.email,
      saleType: pick(['Milk delivery', 'Bulk order', 'Subscription']),
      saleDate: daysAgo(intBetween(3, 45)),
      amount: Math.round(between(300, 5200)),
      status: pick(['pending', 'overdue']),
    })),
    salesTrend: monthLabels.map(() => Math.round(between(20, 80))),
    categories: [
      { name: 'Feed', value: Math.round(s.expenses * 0.34) },
      { name: 'Labor', value: Math.round(s.expenses * 0.28) },
      { name: 'Vet & Medicine', value: Math.round(s.expenses * 0.14) },
      { name: 'Utilities', value: Math.round(s.expenses * 0.12) },
      { name: 'Other', value: Math.round(s.expenses * 0.12) },
    ],
    incomeTotal,
    expenseTotal,
  };
}

// ---- Weather ----
// Mirrors the server's weather-station.ts: same THI formula (Celsius converted to
// Fahrenheit before use — the classic Thom/NRC formula is calibrated for Fahrenheit) and
// the same deterministic per-farm-per-day seed, so demo mode and live mode agree in shape.
export type StressLevel = 'none' | 'moderate' | 'high' | 'severe';
function computeThi(temperatureC: number, humidityPct: number): number {
  const tempF = (temperatureC * 9) / 5 + 32;
  const rh = humidityPct / 100;
  return tempF - (0.55 - 0.55 * rh) * (tempF - 58);
}
function heatStressLevel(thi: number): StressLevel {
  if (thi > 80) return 'severe';
  if (thi > 76) return 'high';
  if (thi > 72) return 'moderate';
  return 'none';
}
function coldStressLevel(temperatureC: number): StressLevel {
  if (temperatureC < 0) return 'severe';
  if (temperatureC < 5) return 'moderate';
  return 'none';
}
const WEATHER_CONDITIONS = ['Sunny', 'Partly cloudy', 'Cloudy', 'Light rain', 'Heavy rain', 'Clear', 'Breezy'];
function synthesizeWeather(farmId: string, date: Date) {
  const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000);
  const seed = ((dayOfYear % 7) + (hashSeed(farmId) % 7) + 7) % 7;
  const temp = 17 + seed * 2.5;
  const humidity = 55 + seed * 4;
  const wind = 8 + ((seed * 3) % 5) * 2;
  const rainMm = [0, 0, 2, 8, 14, 4, 0][seed];
  const condition = WEATHER_CONDITIONS[seed];
  return { temp, humidity, wind, rainMm, condition };
}
function finishWeather(s: { temp: number; humidity: number; wind: number; rainMm: number; condition: string }) {
  const thi = computeThi(s.temp, s.humidity);
  const heatStress = heatStressLevel(thi);
  const coldStress = coldStressLevel(s.temp);
  const recommendation = heatStress !== 'none'
    ? `Heat stress risk (THI ${thi.toFixed(1)}, ${heatStress}): move grazing herds to shaded barns during 11am–4pm, increase water point access, and shift milking to cooler morning/evening hours.`
    : coldStress !== 'none'
    ? `Cold stress risk (${s.temp.toFixed(1)}°C): move exposed cows into sheltered barns and increase ration energy density.`
    : 'Cool morning (6–9am) is ideal for grazing; bring the herd in before the afternoon heat peak.';
  const rainChanceBase: Record<string, number> = { Sunny: 5, Clear: 5, Breezy: 10, 'Partly cloudy': 20, Cloudy: 35, 'Light rain': 60, 'Heavy rain': 85 };
  const baseChance = rainChanceBase[s.condition] ?? 15;
  const forecast = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const rainChance = forecast.map((_, i) => Math.max(5, Math.min(95, Math.round(baseChance + (i - 3) * 6))));
  return {
    temp: Math.round(s.temp * 10) / 10, condition: s.condition, humidity: Math.round(s.humidity), wind: Math.round(s.wind), rainMm: s.rainMm,
    rainChance, forecast, thi: Math.round(thi * 10) / 10, heatStress, coldStress, recommendation,
  };
}
export function weather(farmId: string, period: Period = 'today') {
  switch (period) {
    case 'yesterday': return weatherForDate(farmId, new Date(Date.now() - 86400000));
    case 'week': return weatherAverage(farmId, 7);
    case 'month': return weatherAverage(farmId, 30);
    case 'forecast': return weatherForDate(farmId, new Date(Date.now() + 86400000));
    default: return finishWeather(synthesizeWeather(farmId, new Date()));
  }
}
function weatherForDate(farmId: string, date: Date) {
  return finishWeather(synthesizeWeather(farmId, date));
}
function weatherAverage(farmId: string, daysBack: number) {
  const today = new Date();
  let temp = 0, humidity = 0, wind = 0, rainMm = 0;
  for (let i = 0; i < daysBack; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const s = synthesizeWeather(farmId, d);
    temp += s.temp; humidity += s.humidity; wind += s.wind; rainMm += s.rainMm;
  }
  return finishWeather({ temp: temp / daysBack, humidity: humidity / daysBack, wind: wind / daysBack, rainMm: +(rainMm / daysBack).toFixed(1), condition: 'Mixed' });
}

// ---- Notifications ----
export const NOTIFICATIONS = [
  { id: 1, type: 'vaccination', title: 'Vaccination due', body: '3 cows need Leptospirosis booster this week.', time: '2h ago', tone: 'warn', read_at: null, category: 'important', link: '/app/health' },
  { id: 2, type: 'heat', title: 'Heat detected', body: 'Cow HF-014 showing strong estrus signs.', time: '4h ago', tone: 'info', read_at: null, category: 'information', link: '/app/breeding' },
  { id: 3, type: 'calving', title: 'Expected calving', body: 'JF-009 due to calve in 4 days.', time: 'Yesterday', tone: 'info', read_at: null, category: 'important', link: '/app/breeding' },
  { id: 4, type: 'sick', title: 'Sick cow alert', body: 'BR-021 flagged under treatment for lameness.', time: 'Yesterday', tone: 'danger', read_at: null, category: 'critical', link: '/app/cow/f1-c5', cowCode: 'BR-021' },
  { id: 5, type: 'feed', title: 'Low feed stock', body: 'Concentrate below reorder level (380 kg).', time: '2d ago', tone: 'warn', read_at: null, category: 'important', link: '/app/management' },
  { id: 6, type: 'medicine', title: 'Medicine expiring', body: 'Oxytetracycline expires in 18 days.', time: '3d ago', tone: 'warn', read_at: null, category: 'important', link: '/app/health' },
  { id: 7, type: 'task', title: 'Task reminder', body: 'Afternoon milking roster due at 4pm.', time: '3d ago', tone: 'info', read_at: null, category: 'information', link: '/app/tasks' },
  { id: 8, type: 'payment', title: 'Payment due', body: 'Supplier invoice #INV-228 due in 5 days.', time: '4d ago', tone: 'warn', read_at: null, category: 'important', link: '/app/customers' },
];

// ---- Gallery ----
export const GALLERY_ITEMS = [
  { id: 'g1', farmId: 'f1', category: 'cows', url: 'https://picsum.photos/seed/cow1/400/400', caption: 'Bessie - Holstein', isPrimary: true },
  { id: 'g2', farmId: 'f1', category: 'cows', url: 'https://picsum.photos/seed/cow2/400/400', caption: 'Daisy - Jersey', isPrimary: false },
  { id: 'g3', farmId: 'f1', category: 'facilities', url: 'https://picsum.photos/seed/barn1/400/400', caption: 'Main barn', isPrimary: true },
  { id: 'g4', farmId: 'f1', category: 'employees', url: 'https://picsum.photos/seed/emp1/400/400', caption: 'Morning team', isPrimary: false },
  { id: 'g5', farmId: 'f1', category: 'calves', url: 'https://picsum.photos/seed/calf1/400/400', caption: 'Newborn #1', isPrimary: false },
  { id: 'g6', farmId: 'f1', category: 'equipment', url: 'https://picsum.photos/seed/tractor/400/400', caption: 'Tractor maintenance', isPrimary: true },
];

export const GALLERY_CATEGORIES = [
  { id: 'cows', label: 'Cows', count: 2 },
  { id: 'calves', label: 'Calves', count: 1 },
  { id: 'employees', label: 'Employees', count: 1 },
  { id: 'equipment', label: 'Equipment', count: 1 },
  { id: 'facilities', label: 'Facilities', count: 1 },
];

// ---- Customers ----
export const CUSTOMERS = Array.from({ length: 8 }, (_, i) => ({
  id: `cu${i}`,
  name: pick(['FreshMart','DairyCo','MorningLight','PurePint','GreenGrocer','UrbanBottle','ValleyCoop','DailyDose']),
  email: `buyer${i}@example.com`,
  phone: `+1 555 0${intBetween(100, 999)}`,
  orders: intBetween(3, 40),
  spent: Math.round(between(2000, 60000)),
  status: pick(['Active','Active','Active','Pending']),
}));

export const INVOICES = Array.from({ length: 6 }, (_, i) => ({
  id: `INV-20${i + 10}`,
  date: daysAgo(intBetween(2, 60)),
  amount: Math.round(between(400, 5200)),
  status: pick(['Paid','Paid','Pending','Overdue']),
}));

// ---- Employees ----
export const EMPLOYEES = Array.from({ length: 10 }, (_, i) => ({
  id: `em${i}`,
  name: pick(NAMES) + ' ' + pick(['Smith','Khan','Lee','Garcia','Nguyen','Patel','Okafor','Rossi']),
  role: pick(['Herd Manager','Milker','Vet Tech','Feeder','Mechanic','Admin']),
  attendance: Math.round(between(88, 100)),
  tasks: intBetween(2, 9),
}));

export const TASKS = Array.from({ length: 15 }, (_, i) => ({
  id: `task-${i}`,
  title: pick(['Morning milking','Feed inventory check','Vet visit','Equipment maintenance','Barn cleaning','Vaccination round','Breeding check','Feed mixing','Water system check','Calf feeding','Milk quality test','Pasture rotation','Manure management','Record keeping','Training session']),
  description: 'Assigned task',
  assignedTo: pick(EMPLOYEES).id,
  priority: pick(['low','medium','high','urgent']),
  status: pick(['pending','in_progress','completed']),
  due_date: new Date(Date.now() + intBetween(0, 14) * 86400000).toISOString().slice(0, 10),
  category: pick(['Milking','Feeding','Health','Maintenance','Breeding','Admin']),
}));

export const DAILY_ACTIVITIES = Array.from({ length: 20 }, (_, i) => ({
  id: `act-${i}`,
  activity_type: pick(['Milking','Feeding','Cleaning','Vet check','Breeding','Maintenance','Record keeping']),
  description: 'Daily farm activity',
  duration_minutes: intBetween(15, 180),
  employee_id: pick(EMPLOYEES).id,
  activity_date: new Date(Date.now() - intBetween(0, 7) * 86400000).toISOString().slice(0, 10),
}));

const mockPregnancies: any[] = [];
const mockOffspring: any[] = [];

function findCow(cows: Cow[], id: string): Cow | undefined {
  return cows.find((c) => c.id === id);
}

export function mockPedigreeNode(cowId: string): any {
  const cow = findCow(ALL_COWS, cowId);
  if (!cow) return null;
  const build = (cid: string, depth: number): any => {
    if (depth <= 0) return null;
    const c = findCow(ALL_COWS, cid);
    if (!c) return null;
    return {
      cow: {
        id: c.id, cowCode: c.cowCode, name: c.name, breed: c.breed, gender: c.gender,
        dateOfBirth: c.dob, status: c.status, health: c.health, photoUrl: null,
        motherId: c.motherId, fatherId: c.fatherId,
      },
      mother: build(c.motherId || '', depth - 1),
      father: build(c.fatherId || '', depth - 1),
      offspring: [],
    };
  };
  const offspring = mockOffspring.filter((o) => o.motherId === cowId || o.fatherId === cowId).map((o) => {
    const c = findCow(ALL_COWS, o.animalId);
    return c ? { id: c.id, cowCode: c.cowCode, name: c.name, breed: c.breed, gender: c.gender, dateOfBirth: c.dob, status: c.status, health: c.health, motherId: c.motherId, fatherId: c.fatherId } : null;
  }).filter(Boolean);
  return {
    cow: {
      id: cow.id, cowCode: cow.cowCode, name: cow.name, breed: cow.breed, gender: cow.gender,
      dateOfBirth: cow.dob, status: cow.status, health: cow.health, photoUrl: null,
      motherId: cow.motherId, fatherId: cow.fatherId,
    },
    mother: build(cow.motherId || '', 2),
    father: build(cow.fatherId || '', 2),
    offspring,
  };
}

export function mockOffspringFor(cowId: string): any[] {
  return mockOffspring.filter((o) => o.motherId === cowId || o.fatherId === cowId).map((o) => {
    const c = findCow(ALL_COWS, o.animalId);
    return c ? { id: c.id, cowCode: c.cowCode, name: c.name, breed: c.breed, gender: c.gender, dateOfBirth: c.dob, status: c.status, health: c.health, motherId: c.motherId, fatherId: c.fatherId } : null;
  }).filter(Boolean);
}

export function mockBreedingAnalytics(farmId: string): any {
  return {
    conceptionRate: +between(55, 82).toFixed(1),
    pregnancyRate: +between(60, 88).toFixed(1),
    calvingInterval: +between(380, 430).toFixed(1),
    servicesPerConception: +between(1.5, 2.8).toFixed(1),
    daysOpen: +between(60, 140).toFixed(1),
    ageAtFirstCalving: +between(24, 36).toFixed(1),
    calvingSuccessRate: +between(75, 95).toFixed(1),
    totalBreeding: ALL_COWS.filter((c) => c.farmId === farmId).length,
    totalCalvings: Math.floor(ALL_COWS.filter((c) => c.farmId === farmId).length * 0.6),
  };
}

export function mockBreedingAssistant(cowId: string, sireId: string): any {
  const cow = findCow(ALL_COWS, cowId);
  const sire = findCow(ALL_COWS, sireId);
  const related = !!(cow && sire && (cow.motherId === sire.motherId || cow.fatherId === sire.fatherId || cow.motherId === sire.id || cow.fatherId === sire.id || cow.id === sire.motherId || cow.id === sire.fatherId));
  const previousOffspring = mockOffspring.filter((o) => o.motherId === cowId && o.fatherId === sireId);
  return {
    cowId, sireId, related,
    risk: related ? 'high' : 'low',
    cow: cow ? { id: cow.id, cowCode: cow.cowCode, name: cow.name, breed: cow.breed, gender: cow.gender } : { id: cowId, cowCode: '?', name: 'Unknown', breed: 'Unknown', gender: 'female' },
    sire: sire ? { id: sire.id, cowCode: sire.cowCode, name: sire.name, breed: sire.breed, gender: sire.gender } : { id: sireId, cowCode: '?', name: 'Unknown', breed: 'Unknown', gender: 'male' },
    previousOffspring,
    breedingHistory: [],
    healthInfo: { health: cow?.health || 'healthy', status: cow?.status || 'active' },
    milkProduction: { avgDailyLiters90d: cow?.avgDailyMilk || 0 },
    recommendation: related
      ? 'High risk: these animals share ancestry. Inbreeding can reduce calf viability and increase genetic defects. Consider a different sire.'
      : previousOffspring.length > 0
        ? 'No previous breeding history between these animals. Proceed with standard care.'
        : 'Good match based on available data. Proceed with standard care.',
  };
}

export { mockPregnancies, mockOffspring };

// ---- Gamification ----
export const BADGES = [
  { id: 'b1', name: 'Early Riser', desc: 'Logged 30 morning milkings', icon: 'Sunrise', earned: true },
  { id: 'b2', name: 'Herd Master', desc: 'Manage 100+ cows', icon: 'Crown', earned: true },
  { id: 'b3', name: 'Health Hero', desc: 'Zero sick cows for 30 days', icon: 'HeartPulse', earned: false },
  { id: 'b4', name: 'Data Champion', desc: '1000 records entered', icon: 'Database', earned: true },
  { id: 'b5', name: 'Streak 60', desc: '60-day login streak', icon: 'Flame', earned: false },
];
export const LEADERBOARD = [
  { name: 'Ana K.', score: 9820, role: 'Herd Manager' },
  { name: 'Liam P.', score: 8740, role: 'Milker' },
  { name: 'Sofia R.', score: 8210, role: 'Vet Tech' },
  { name: 'You', score: 7640, role: 'Owner', you: true },
  { name: 'Tom B.', score: 6980, role: 'Feeder' },
];

// ---- Sustainability ----
export function sustainability(farmId: string) {
  const s = farmSummary(farmId);
  return {
    waterUsage: Math.round(between(8000, 14000)),
    feedEfficiency: +between(1.2, 1.6).toFixed(2),
    carbon: Math.round(between(120, 260)),
    manure: Math.round(between(4000, 9000)),
    renewable: Math.round(between(10, 45)),
    trend: monthLabels.map(() => Math.round(between(180, 260))),
  };
}

// ---- AI assistant canned responses ----
export function aiAnswer(q: string, farmId: string): string {
  const s = farmSummary(farmId);
  const cows = cowsByFarm(farmId);
  const milking = cows.filter((c) => c.isMilking).length;
  const sick = cows.filter((c) => c.health !== 'healthy').length;
  const pregnant = cows.filter((c) => c.isPregnant).length;
  const ql = q.toLowerCase();
  if (ql.includes('hello') || ql.includes('hi') || ql.includes('hey')) return `Hello! I'm your DairyOS AI advisor. Your farm: ${s.totalCows} cows, ${s.milkToday.toLocaleString()} L today, ${s.feedStock.toLocaleString()} kg feed. How can I help?`;
  if (ql.includes('bye') || ql.includes('goodbye')) return 'Goodbye! Your farm data is always here when you need it.';

  // Specific, data-grounded questions — checked before the broader topic keywords below.
  if ((ql.includes('milk') || ql.includes('production')) && /(fall|falling|fell|drop|declin|decreas|down|less|reduc)/.test(ql)) {
    const decliners = analytics(farmId).worst.slice(0, 2);
    return `Milk production is down about 8%: this week's daily average is lower than last week's. Likely contributing factors: ${sick > 0 ? `${sick} cow(s) currently unwell; ` : ''}individual cows trending down include ${decliners.map(c => c.cowCode).join(', ')}. Check these cows first, then review ration consistency and feed stock levels.`;
  }
  if (ql.includes('cow') && /(attention|priorit|watch|focus)/.test(ql)) {
    const flagged = cows.filter(c => c.health !== 'healthy').slice(0, 3);
    return flagged.length ? `${flagged.length} cow(s) need attention today: ${flagged.map(c => `${c.cowCode} (${c.health.replace('_',' ')})`).join(', ')}. Start with the first one — check temperature, appetite, and treatment plan.` : 'No cows are flagged for attention today — health, vaccinations, and body condition all look normal. Good day for routine checks.';
  }
  if (ql.includes('tomorrow')) {
    return s.upcomingVacc > 0
      ? `Tomorrow's plan: ${s.upcomingVacc} vaccination(s) due — check Alerts for exact cows. ${sick > 0 ? `Also keep monitoring ${sick} cow(s) under care.` : ''}`
      : `Nothing time-critical scheduled for tomorrow — good time for routine herd checks and equipment maintenance.`;
  }
  if (ql.includes('cow') && /(money|costing|expensive|unprofitable|profitab)/.test(ql)) {
    const worst = analytics(farmId).worst.slice(0, 3);
    return `Based on feed cost vs. milk output, the cows worth reviewing are: ${worst.map(c => c.cowCode).join(', ')} — lowest yield relative to feed intake. This excludes vet/labor costs, which aren't tracked per-cow.`;
  }
  if (ql.includes('profit') && /(increas|improve|boost|raise|more)/.test(ql)) {
    return `Finance snapshot: profit ${s.profit.toLocaleString()} (${s.revenue > 0 ? ((s.profit / s.revenue) * 100).toFixed(1) : 0}% margin). Biggest levers right now: negotiate feed pricing, review labor scheduling, and check for any cows costing more in treatment than they produce in milk.`;
  }
  if (ql.includes('pregnan') && /(which|likely|candidate|probably)/.test(ql)) {
    const candidates = cows.filter(c => c.isPregnant).slice(0, 3);
    return candidates.length ? `${pregnant} cow(s) confirmed pregnant, including ${candidates.map(c => c.cowCode).join(', ')}. A few more are awaiting pregnancy check confirmation — schedule ultrasounds for cows serviced 30-90 days ago with no recorded result.` : `No confirmed pregnancies right now. Check breeding records for cows serviced 30-90 days ago that are due for a pregnancy check.`;
  }
  if (ql.includes('report') && ql.includes('financ')) {
    return `Financial report — this month:\n\nIncome: ${s.revenue.toLocaleString()} | Expenses: ${s.expenses.toLocaleString()} | Net profit: ${s.profit.toLocaleString()} | Margin: ${s.revenue > 0 ? ((s.profit / s.revenue) * 100).toFixed(1) : 0}%\n\nOpen the Finance tab for the full category breakdown and 6-month trend.`;
  }
  if (ql.includes('feed') && ql.includes('cost') && /(increas|rising|risen|rose|expensive|higher|up|why)/.test(ql)) {
    return `Feed costs have trended up recently, driven mainly by the size of your milking herd (${milking} cows) and current concentrate pricing. Check the Finance tab's expense breakdown for the exact month-over-month change.`;
  }

  if (ql.includes('vaccin')) return s.upcomingVacc > 0 ? `You have ${s.upcomingVacc} vaccination(s) due this week. Prioritize Leptospirosis boosters for lactating cows and BVD for calves. Check Alerts for exact dates.` : 'No vaccinations due this week. All cattle are up to date. Schedule next boosters in 6 months.';
  if (ql.includes('milk')) return `Today: ${s.milkToday.toLocaleString()} L from ${milking} milking cows (avg ${milking ? (s.milkToday/milking).toFixed(1) : 0} L/cow). Tips: maintain consistent milking times, monitor SCC, check for mastitis signs, ensure proper teat disinfection.`;
  if (ql.includes('low') && ql.includes('product')) return `Lowest producers: ${analytics(farmId).worst.slice(0,3).map(c=>c.cowCode).join(', ')}. Action: check feed intake, review milk trends, schedule vet checks, consider culling after 2+ low-lactation cycles.`;
  if (ql.includes('predict')) return `Next month projection: ~${(s.milkMonth*1.03).toLocaleString()} L. ${pregnant} pregnancies may boost output. Monitor feed intake as lactation progresses. Check Predictions tab for 6-month forecasts.`;
  if (ql.includes('feed')) { const fc = feedConsumption(farmId); return `Stock: ${s.feedStock.toLocaleString()} kg. Top feeds: ${fc.labels.slice(0,3).join(', ')}. Advice: increase concentrate 8% for lactating cows, provide 80-150L water/cow/day, rotate pastures, store silage properly.`; }
  if (ql.includes('sick') || ql.includes('health')) return sick > 0 ? `${sick} cows need attention. Isolate sick animals, follow vet treatment plans, monitor temp/appetite daily, maintain clean bedding. Check Alerts for active cases.` : 'All cows healthy! Maintain vaccination schedule, practice milking hygiene, provide balanced nutrition, monitor for early illness signs.';
  if (ql.includes('pregnan') || ql.includes('breed')) return `${pregnant} cows pregnant. AI success rate 60-70% first service. Best AI timing: 12h after heat detection. Schedule pregnancy checks 28-45 days post-AI. Dry period: 45-60 days before calving.`;
  if (ql.includes('weather')) return `Open Weather tab for live data. Monitor THI for heat stress. ${s.feedStock > 1000 ? 'Feed stock adequate.' : 'Consider supplementary feeding during poor grazing.'}`;
  if (ql.includes('finance') || ql.includes('profit') || ql.includes('income')) return `This month: income ${s.revenue.toLocaleString()}, expenses ${s.expenses.toLocaleString()}, profit ${s.profit.toLocaleString()} (${s.revenue > 0 ? ((s.profit/s.revenue)*100).toFixed(1) : 0}% margin). ${s.profit > 0 ? 'Reinvest in feed, genetics, equipment.' : 'Review feed/labor/vet costs, reduce waste, optimize milk price.'}`;
  if (ql.includes('employee') || ql.includes('staff')) return `${EMPLOYEES.length} employees. Tips: track attendance, set clear roles, schedule regular training, use Employees tab for rosters and reports, consider performance incentives.`;
  if (ql.includes('gallery') || ql.includes('photo')) return `Gallery: ${GALLERY_CATEGORIES.reduce((a,b) => a + b.count, 0)} items. Upload high-quality photos, tag with cow IDs, keep profile images updated, export for marketing/reports.`;
  if (ql.includes('how to') || ql.includes('help') || ql.includes('feature') || ql.includes('guide') || ql.includes('use') || ql.includes('project')) return `DairyOS features: Dashboard (KPIs), Herd (cow management), Farm Map, AI Assistant, Alerts, Predictions, Analytics, Finance, Weather, Sustainability, Gallery, Customers, Employees, Search, Goals. Use sidebar to navigate. Export via PDF/Excel/CSV buttons.`;
  if (ql.includes('pricing') || ql.includes('plan') || ql.includes('upgrade')) return `Plans: Starter $29/mo (50 cows, dashboard, QR), Pro $79/mo (500 cows, AI, multi-farm, finance), Enterprise Custom (unlimited, RBAC, API). 14-day free trial.`;
  if (ql.includes('sustainab') || ql.includes('water') || ql.includes('carbon') || ql.includes('manure')) return `Sustainability: water conservation, manure composting/biogas, solar energy, pasture biodiversity, soil health, carbon tracking. Check Sustainability tab for metrics.`;
  if (ql.includes('export') || ql.includes('pdf') || ql.includes('excel')) return `Export data via CSV, Excel, or PDF buttons on Finance, Customers, and Employees pages. Use for vet reports, accounting, and meetings.`;
  if (ql.includes('customer') || ql.includes('order') || ql.includes('invoice')) return `Customer management: track orders, invoices, payments, deliveries. Use Customers tab. Maintain quality and delivery schedules for buyer loyalty.`;
  if (ql.includes('barn') || ql.includes('facility') || ql.includes('equipment')) return `Open Farm Map for barns, pastures, water points, milking stations. Maintain clean, dry barns with ventilation. Regular equipment maintenance.`;
  if (ql.includes('cow') || ql.includes('herd') || ql.includes('cattle')) return `Herd: ${s.totalCows} cows, ${milking} milking, ${pregnant} pregnant, ${sick} issues. Use Herd tab to search, add, edit, view profiles. Track health, milk, breeding, feed.`;
  if (ql.includes('analytics') || ql.includes('report') || ql.includes('trend')) { const ap = analytics(farmId); const topBreed = ap.breedPerf[0]; return `Analytics: ${s.totalCows} cows, ${milking} milking, avg ${s.milkToday > 0 && milking > 0 ? (s.milkToday/milking).toFixed(1) : '0'} L/cow. Top breed: ${topBreed?.breed || 'N/A'}. Track performance curves, breed trends, seasonal patterns.`; }
  return `I advise on all farm matters: milk production (${s.milkToday.toLocaleString()} L today), feed (${s.feedStock.toLocaleString()} kg), health (${sick} issues), breeding (${pregnant} pregnant), finance (${s.profit.toLocaleString()} profit), employees (${EMPLOYEES.length}), gallery (${GALLERY_CATEGORIES.reduce((a,b)=>a+b.count,0)} items), and DairyOS features. What specifically?`;
}

// ---- AI Advisor mock ----
export interface AiInsight {
  id: string;
  type: 'recommendation'|'warning'|'prediction'|'action_plan'|'alert';
  category: string;
  severity: 'low'|'medium'|'high'|'critical';
  priority: number;
  title: string;
  description: string;
  action_items: { label: string; done: boolean }[];
  related_cow_id?: string | null;
  confidence_score: number;
  status: 'new'|'acknowledged'|'in_progress'|'resolved'|'dismissed';
  acknowledged_at?: string | null;
  resolved_at?: string | null;
  expires_at?: string | null;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

export function generateMockInsights(farmId: string): AiInsight[] {
  const r = mulberry32(farmId.charCodeAt(1) * 1000 + 1);
  const cattle = cowsByFarm(farmId).filter(c => c.status === 'active');
  const pick2 = <T,>(arr: T[]) => [pick(arr), pick(arr)];
  return [
    {
      id: `ai-${farmId}-1`,
      type: 'warning', category: 'health', severity: 'high', priority: 4,
      title: `${rndInt(1,4)} cows with active health concerns`,
      description: `AI monitoring detected unusual patterns in health records. Several cows have elevated body temperature or reduced feed intake over the last 3 days. Immediate veterinary review recommended to prevent spread and ensure timely treatment.`,
      action_items: [{ label: 'Schedule vet visit for affected cows', done: false }, { label: 'Isolate animals showing symptoms', done: false }, { label: 'Update health records with current observations', done: false }],
      related_cow_id: String(cattle[rndInt(0, cattle.length-1)]?.id || ''),
      confidence_score: +between(0.75, 0.95).toFixed(2),
      status: 'new',
      created_at: new Date(Date.now() - 2*3600000).toISOString(),
      updated_at: new Date(Date.now() - 2*3600000).toISOString(),
      metadata: { affected_cows: rndInt(1,4) },
    },
    {
      id: `ai-${farmId}-2`,
      type: 'warning', category: 'feed_nutrition', severity: 'critical', priority: 4,
      title: 'Concentrate stock critically low — order now',
      description: `Feed inventory shows concentrate at just over reorder level. At current consumption rate, stock will be depleted in approximately ${rndInt(2,5)} days. Production losses from feed shortage can be severe for lactating cows.`,
      action_items: [{ label: 'Place emergency feed order', done: rnd() > 0.5 }, { label: 'Check delivery schedule with supplier', done: false }, { label: 'Notify milking crew of potential ration change', done: false }],
      confidence_score: +between(0.88, 0.99).toFixed(2),
      status: 'new',
      created_at: new Date(Date.now() - 5*3600000).toISOString(),
      updated_at: new Date(Date.now() - 5*3600000).toISOString(),
      metadata: { stock_left_kg: rndInt(200, 800), days_remaining: rndInt(2,5) },
    },
    {
      id: `ai-${farmId}-3`,
      type: 'recommendation', category: 'milk_production', severity: 'medium', priority: 2,
      title: 'Optimize milking schedule — detected yield dip during afternoon session',
      description: `Afternoon milk collection averages 8% lower than morning over the past week. Possible causes: milker fatigue, cow comfort issues, or afternoon heat stress. Aligning milking times with cow comfort windows can recover significant volume.`,
      action_items: [{ label: 'Review afternoon milking times', done: false }, { label: 'Assess cooling/ventilation in holding area', done: false }, { label: 'Rotate milking staff for rest breaks', done: false }],
      confidence_score: +between(0.65, 0.85).toFixed(2),
      status: 'new',
      created_at: new Date(Date.now() - 8*3600000).toISOString(),
      updated_at: new Date(Date.now() - 8*3600000).toISOString(),
      metadata: { afternoon_dip_pct: rndInt(5,12) },
    },
    {
      id: `ai-${farmId}-4`,
      type: 'action_plan', category: 'breeding', severity: 'critical', priority: 5,
      title: `Calving imminent for ${cattle[rndInt(0,cattle.length-1)]?.cowCode || 'GF-042'} — prepare calving pen`,
      description: `Expected calving within 48 hours. Ensure calving pen is clean, dry, bedded, and has calving equipment ready. Assign a dedicated observer for overnight monitoring. Have vet and emergency contacts pre-staged.`,
      action_items: [{ label: 'Prepare and disinfect calving pen', done: false }, { label: 'Stock colostrum and warming supplies', done: false }, { label: 'Brief team on emergency calving protocol', done: false }],
      related_cow_id: String(cattle[rndInt(0,cattle.length-1)]?.id || ''),
      confidence_score: 0.95,
      status: 'new',
      created_at: new Date(Date.now() - 12*3600000).toISOString(),
      updated_at: new Date(Date.now() - 12*3600000).toISOString(),
      metadata: { days_until_calving: rndInt(1,3) },
    },
    {
      id: `ai-${farmId}-5`,
      type: 'recommendation', category: 'financial', severity: 'low', priority: 1,
      title: 'Profit margin healthy — reinvestment opportunities identified',
      description: `This month's profit margin is within target range. Consider reinvesting 10-15% of profit into genetics, feed quality upgrades, or equipment maintenance to maximize long-term returns.`,
      action_items: [{ label: 'Review capex plan for next quarter', done: false }, { label: 'Compare semen prices from top suppliers', done: false }],
      confidence_score: +between(0.70, 0.85).toFixed(2),
      status: 'acknowledged',
      acknowledged_at: new Date(Date.now() - 3600000).toISOString(),
      created_at: new Date(Date.now() - 24*3600000).toISOString(),
      updated_at: new Date(Date.now() - 1*3600000).toISOString(),
      metadata: { margin_pct: rndInt(16,28), profit: rndInt(8000,25000) },
    },
    {
      id: `ai-${farmId}-6`,
      type: 'prediction', category: 'milk_production', severity: 'medium', priority: 2,
      title: 'Milk yield forecast: +3% expected next 30 days',
      description: `Based on current lactation curves, herd age distribution, and feed intake patterns, model predicts a 3% increase in daily output over the next month. Peak lactation window aligns with scheduled pasture rotations.`,
      action_items: [{ label: 'Confirm grazing schedule', done: false }, { label: 'Adjust TMR for peak lactation needs', done: false }],
      confidence_score: +between(0.70, 0.88).toFixed(2),
      status: 'new',
      created_at: new Date(Date.now() - 18*3600000).toISOString(),
      updated_at: new Date(Date.now() - 18*3600000).toISOString(),
      metadata: { forecast_pct: rndInt(2,5), days: 30 },
    },
    {
      id: `ai-${farmId}-7`,
      type: 'alert', category: 'health', severity: 'high', priority: 3,
      title: `${rndInt(3,8)} vaccination(s) due within 7 days`,
      description: `Scheduled vaccinations are approaching due dates. Delayed administration increases disease susceptibility in the herd. Plan administration during low-stress hours (early morning).`,
      action_items: [{ label: 'Schedule vaccination appointments', done: false }, { label: 'Verify cold chain storage', done: false }],
      confidence_score: 0.99,
      status: 'new',
      created_at: new Date(Date.now() - 24*3600000).toISOString(),
      updated_at: new Date(Date.now() - 24*3600000).toISOString(),
      metadata: { count: rndInt(3,8) },
    },
  ];
}

const FARM_SCORE_CATEGORY_KEYS = ['health', 'nutrition', 'breeding', 'finance', 'milkProduction', 'inventory', 'biosecurity', 'workerPerformance', 'animalWelfare'] as const;

const FARM_SCORE_SAMPLE_DEDUCTIONS: Record<typeof FARM_SCORE_CATEGORY_KEYS[number], { points: number; reason: string; recommendation: string }[]> = {
  health: [
    { points: 6, reason: '2 cow(s) currently sick', recommendation: 'Schedule veterinary examinations for sick cows and isolate as needed.' },
    { points: 6, reason: '2 vaccination(s) overdue', recommendation: 'Catch up on overdue vaccinations to reduce disease risk.' },
  ],
  nutrition: [
    { points: 10, reason: 'Feed stock will last 12.0 days', recommendation: 'Plan the next feed order within the next week.' },
  ],
  breeding: [
    { points: 8, reason: '2 pregnancy check(s) overdue (>45 days since service)', recommendation: 'Schedule pregnancy checks and record results promptly.' },
  ],
  finance: [
    { points: 10, reason: 'Profit margin is 21.4% this month', recommendation: 'Margin is below target — review pricing and expense trends monthly.' },
  ],
  milkProduction: [],
  inventory: [
    { points: 8, reason: '1 inventory item(s) at or below reorder level', recommendation: 'Reorder low-stock items and review reorder thresholds.' },
  ],
  biosecurity: [
    { points: 5, reason: '1 parasite control treatment(s) overdue', recommendation: 'Complete overdue parasite control treatments to prevent spread.' },
  ],
  workerPerformance: [
    { points: 6, reason: '2 absence(s) recorded in the last 14 days', recommendation: 'Follow up on attendance patterns and review shift coverage.' },
  ],
  animalWelfare: [
    { points: 12, reason: 'Severe lameness affects 3% of examined cows', recommendation: 'Monitor lameness trend and review footbath protocol.' },
  ],
};

const OVERALL_WEIGHTS: Record<string, number> = { health: 1.5, animalWelfare: 1.3, biosecurity: 1.2, milkProduction: 1.0, breeding: 1.0, nutrition: 1.0, finance: 0.9, inventory: 0.7, workerPerformance: 0.7 };

export function generateMockDailyAdvice(farmId: string): any {
  const cow = pick(cowsByFarm(farmId));
  const profit = Math.round(between(800000, 2400000));
  return {
    greeting: `Good morning${rnd() > 0.5 ? ' Vicent' : ''}.`,
    farmScore: rndInt(75, 99),
    priorityTasks: [
      { label: `Vaccinate ${cow?.cowCode || 'HM-042'}`, done: false, severity: 'high' },
      { label: `Move ${pick(cowsByFarm(farmId)).cowCode} to Isolation`, done: false, severity: 'high' },
      { label: `Feed stock will finish in ${rndInt(3, 7)} days`, done: false, severity: 'medium' },
      { label: `Milk production dropped by ${rndInt(3, 12)}%`, done: false, severity: 'high' },
      { label: 'Heavy rainfall expected', done: false, severity: 'medium' },
      { label: `Calving expected tomorrow`, done: false, severity: 'critical' },
    ],
    urgentAlerts: [
      { title: 'Heat stress risk', description: 'THI exceeds 72. Provide shade and extra water.', severity: 'high' },
      { title: 'Low feed stock', description: 'Concentrate below reorder level.', severity: 'high' },
    ],
    healthWarnings: [
      { title: 'Active treatment: mastitis', description: `${cow?.cowCode || 'HF-014'} — follow treatment plan.`, cowId: cow?.id, severity: 'high' },
    ],
    milkProductionAnalysis: { title: 'Milk production stable', description: `Today: 2,340 L from 42 cows (avg 55 L/cow).`, metrics: { todayLiters: 2340, avgLitersPerCow: 55, totalMilking: 42 } },
    feedRecommendations: [
      { title: 'Increase concentrate during peak lactation', description: 'Target 18-22% crude protein.', severity: 'medium' },
    ],
    breedingRecommendations: [
      { title: `Calving expected for ${cow?.cowCode || 'HF-042'}`, description: 'Expected tomorrow. Prepare calving pen.', cowId: cow?.id, severity: 'critical' },
    ],
    financialSummary: { title: 'Monthly snapshot', description: `Income: 18,500,000 UGX | Expenses: 14,200,000 UGX | Profit: 4,300,000 UGX (23% margin)`, metrics: { income: 18500000, expenses: 14200000, profit: 4300000, marginPct: 23, estimatedProfitToday: profit } },
    inventoryWarnings: [
      { title: 'Low stock: Concentrate', description: '380 kg remaining (reorder at 500 kg).', severity: 'high' },
    ],
    weatherAdvice: { title: 'Heat stress risk', description: 'THI is 78. Provide shade and extra water.', metrics: { temperature_c: 29, humidity_pct: 75, thi: '78.0' } },
    employeeTasks: [
      { title: 'Morning milking', description: 'Complete by 7am.', assignedTo: 'Morning team', dueDate: new Date().toISOString().slice(0, 10) },
    ],
    suggestedImprovements: [
      { title: 'Review feed supplier contracts', description: 'Negotiate bulk pricing to reduce cost per liter.' },
    ],
    endOfDayChecklist: [
      { label: 'Verify all milking records entered', done: false },
      { label: 'Check barn temperatures', done: false },
    ],
    estimatedProfitUgx: profit,
  };
}

export function generateMockFarmScore(farmId: string): any {
  const r = mulberry32(farmId.charCodeAt(1) * 3000 + 11);
  const categories: any = {};
  let weightedSum = 0;
  let totalWeight = 0;
  for (const key of FARM_SCORE_CATEGORY_KEYS) {
    const deductions = FARM_SCORE_SAMPLE_DEDUCTIONS[key];
    const lost = deductions.reduce((s, d) => s + d.points, 0);
    const jitter = Math.round((r() - 0.5) * 6);
    const score = Math.max(0, Math.min(100, 100 - lost + jitter));
    categories[key] = { score, deductions };
    weightedSum += score * OVERALL_WEIGHTS[key];
    totalWeight += OVERALL_WEIGHTS[key];
  }
  const overall = Math.round(weightedSum / totalWeight);
  return { date: new Date().toISOString().slice(0, 10), categories, overall };
}

export function generateMockFarmScoreHistory(farmId: string, days = 30): any[] {
  const r = mulberry32(farmId.charCodeAt(1) * 4000 + 13);
  const base = generateMockFarmScore(farmId);
  const points: any[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 3600000).toISOString().slice(0, 10);
    const wobble = () => Math.round((r() - 0.5) * 10);
    const point: any = { date };
    for (const key of FARM_SCORE_CATEGORY_KEYS) point[key] = Math.max(0, Math.min(100, base.categories[key].score + wobble()));
    point.overall = Math.max(0, Math.min(100, base.overall + wobble()));
    points.push(point);
  }
  return points;
}

// Other mock data follows after:
export const TESTIMONIALS = [
  { name: 'Maria Alvarez', role: 'Owner, Alvarez Dairy', text: 'Milk yields are up 18% since we switched. The AI alerts alone save us hours every week.' },
  { name: 'James Whitlock', role: 'Farm Manager, Whitlock Farms', text: 'The dashboard is the first thing I open each morning. Everything I need is in one place.' },
  { name: 'Priya Nair', role: 'Vet, Sunrise Holsteins', text: 'Health tracking and vaccination schedules keep our herd healthier and our audits clean.' },
];
export const PARTNERS = ['AgriBank','HerdPro','MilkLink','VetSuite','FarmTech','NutriCo'];
export const FAQ = [
  { q: 'How long is the free trial?', a: '14 days, full-featured, no credit card required.' },
  { q: 'Does it work offline?', a: 'Yes. The app caches data on-device and syncs automatically when you reconnect.' },
  { q: 'Can I manage multiple farms?', a: 'Absolutely. Switch farms instantly and compare performance side by side.' },
  { q: 'Is my data secure?', a: 'We use encryption at rest and in transit, 2FA, role-based access, and automatic backups.' },
  { q: 'Do you integrate with milk meters and scales?', a: 'Yes — RFID ear tags, digital scales, and milk meters connect via our integration hub.' },
];

export function generateMockCommandCenter(farmId: string): any {
  const score = generateMockFarmScore(farmId);
  const herd = cowsByFarm(farmId);
  const sick = herd.filter(c => c.health !== 'healthy').slice(0, 3);
  const actions: any[] = [];
  let seq = 0;
  const seqId = (block: string) => `${block}-${++seq}`;

  const urgent: any[] = [
    { id: seqId('urgent'), block: 'urgent', title: `Vaccinate ${pick(herd).cowCode} — Leptospirosis booster overdue`, category: 'health', priority: 5, severity: 'critical', reason: 'Vaccination overdue increases disease susceptibility for this lactating cow.', consequenceIfSkipped: 'Mastitis or leptospirosis risk rises. Possible production loss of 8–15 L/day per cow.', estimatedCostIfSkippedUGX: rndInt(800000, 2400000), estimatedTimeMinutes: 25, relatedCowId: pick(herd).id, cowCode: pick(herd).cowCode, source: 'command_center_fusion', done: false, actionable: true, shortcut: 'Schedule vaccination appointment' },
  ];

  const morning: any[] = [
    { id: seqId('morning'), block: 'morning', title: 'Check water flow rates at 3 troughs', category: 'operations', priority: 4, severity: 'high', reason: 'THI expected to exceed 72 by 10am. Water intake drops before milk yield.', consequenceIfSkipped: 'Herd heat stress reduces afternoon output by 10–20%.', estimatedCostIfSkippedUGX: rndInt(400000, 1200000), estimatedTimeMinutes: 20, source: 'command_center_weather', done: false, actionable: true },
    { id: seqId('morning'), block: 'morning', title: 'Breeeding check: confirm pregnancy for 2 cows serviced 35+ days ago', category: 'breeding', priority: 4, severity: 'high', reason: 'Pregnancy checks delayed beyond optimal window.', consequenceIfSkipped: 'Missed non-pregnant cows can be re-bred later, extending calving interval.', estimatedCostIfSkippedUGX: rndInt(200000, 600000), estimatedTimeMinutes: 30, relatedCowId: pick(herd).id, cowCode: pick(herd).cowCode, source: 'command_center_breeding', done: false, actionable: true, shortcut: 'Schedule ultrasound appointment' },
  ];

  const midday: any[] = [
    { id: seqId('midday'), block: 'midday', title: 'Review afternoon milking yield vs. morning trend', category: 'milk_production', priority: 3, severity: 'medium', reason: 'Afternoon sessions averaging 8% lower this week.', consequenceIfSkipped: 'Continued dip represents approx. 120 L/day across herd.', estimatedCostIfSkippedUGX: rndInt(300000, 900000), estimatedTimeMinutes: 15, source: 'command_center_production', done: false, actionable: true },
    { id: seqId('midday'), block: 'midday', title: 'Order concentrate supplement — 500 kg', category: 'inventory', priority: 4, severity: 'high', reason: 'Stock projected to run out in 4 days at current consumption.', consequenceIfSkipped: 'Lactating cows on restricted feed drop yield within 48h.', estimatedCostIfSkippedUGX: rndInt(800000, 3000000), estimatedTimeMinutes: 10, source: 'command_center_feed', done: false, actionable: true, shortcut: 'Create draft purchase order' },
  ];

  const evening: any[] = [
    { id: seqId('evening'), block: 'evening', title: 'Verify all milk records from today', category: 'review', priority: 2, severity: 'low', reason: 'Ensures AI analysis for tomorrow morning is accurate.', consequenceIfSkipped: 'Tomorrow\'s AI brief may miss production anomalies.', estimatedCostIfSkippedUGX: rndInt(50000, 150000), estimatedTimeMinutes: 10, source: 'command_center_data_quality', done: false, actionable: true },
    { id: seqId('evening'), block: 'evening', title: 'End-of-day temperature and lameness check', category: 'health', priority: 2, severity: 'low', reason: 'Pre-calving and heat-stress risk cows need monitoring.', consequenceIfSkipped: 'Heat stress events may go unnoticed overnight.', estimatedCostIfSkippedUGX: rndInt(100000, 300000), estimatedTimeMinutes: 15, source: 'command_center_welfare', done: false, actionable: true },
  ];

  return {
    generatedAt: new Date().toISOString(),
    farmScore: score.overall,
    farmScoreDelta: rndInt(-5, 12),
    herdPulse: {
      total: herd.length,
      milking: herd.filter(c => c.isMilking).length,
      sick: sick.length,
      inTreatment: herd.filter(c => c.health === 'under_treatment').length,
      calvingToday: rndInt(0, 2),
      calvingThisWeek: rndInt(1, 4),
      sickCodes: sick.map(c => c.cowCode),
      treatmentCodes: herd.filter(c => c.health === 'under_treatment').slice(0, 3).map(c => c.cowCode),
    },
    blocks: [
      { label: 'Urgent — Do now', window: '0–2h', actions: urgent },
      { label: 'Morning briefing', window: '6–9am', actions: morning },
      { label: 'Midday follow-up', window: '12–2pm', actions: midday },
      { label: 'Evening review', window: '5–7pm', actions: evening },
    ],
    eveningReview: {
      tasksChecked: rndInt(0, 3),
      pendingCount: rndInt(2, 5),
      completionPct: rndInt(20, 80),
    },
    meta: {
      totalActions: urgent.length + morning.length + midday.length + evening.length,
      criticalPending: urgent.length,
      estimatedTimeTotalMinutes: [...urgent, ...morning, ...midday, ...evening].reduce((s: number, a: any) => s + a.estimatedTimeMinutes, 0),
      highestRiskAction: urgent[0] || morning[0] || null,
    },
  };
}
