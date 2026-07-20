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
const NAMES = ['Bella','Daisy','Lola','Molly','Rosie','Buttercup','Clover','Penny','Ruby','Ginger','Luna','Maple','Hazel','Olive','Pearl','Willow','Ivy','Nina','Coco','Sasha','Tilly','Fern','Jade','Sienna','Zoe','Cleo','Mia','Rosi','Annie','Goldie','Blue','Violet','Tess','Nell','Poppy','Wren'];

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
  ...genCows('f1', 42, 1),
  ...genCows('f2', 36, 1),
  ...genCows('f3', 28, 1),
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
export const WEATHER = {
  temp: 19,
  condition: 'Partly cloudy',
  humidity: 68,
  wind: 12,
  rainChance: [10, 5, 20, 45, 60, 30, 15],
  forecast: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
  recommendation: 'Cool morning (6–9am) is ideal for grazing; bring herd in before the 3pm heat peak.',
};

// ---- Notifications ----
export const NOTIFICATIONS = [
  { id: 1, type: 'vaccination', title: 'Vaccination due', body: '3 cows need Leptospirosis booster this week.', time: '2h ago', tone: 'warn' },
  { id: 2, type: 'heat', title: 'Heat detected', body: 'Cow HF-014 showing strong estrus signs.', time: '4h ago', tone: 'info' },
  { id: 3, type: 'calving', title: 'Expected calving', body: 'JF-009 due to calve in 4 days.', time: 'Yesterday', tone: 'info' },
  { id: 4, type: 'sick', title: 'Sick cow alert', body: 'BR-021 flagged under treatment for lameness.', time: 'Yesterday', tone: 'danger' },
  { id: 5, type: 'feed', title: 'Low feed stock', body: 'Concentrate below reorder level (380 kg).', time: '2d ago', tone: 'warn' },
  { id: 6, type: 'medicine', title: 'Medicine expiring', body: 'Oxytetracycline expires in 18 days.', time: '3d ago', tone: 'warn' },
  { id: 7, type: 'task', title: 'Task reminder', body: 'Afternoon milking roster due at 4pm.', time: '3d ago', tone: 'info' },
  { id: 8, type: 'payment', title: 'Payment due', body: 'Supplier invoice #INV-228 due in 5 days.', time: '4d ago', tone: 'warn' },
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

// ---- Testimonials / partners / FAQ (marketing) ----
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
