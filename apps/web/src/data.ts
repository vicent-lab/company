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
  weightKg: number; color: string; avgDailyMilk: number; waterIntakeLiters: number;
  status: string;
}
export interface CowDetail extends CowSummary {
  dob: string; barnId?: string; motherId?: string; fatherId?: string;
  milk: { date: string; morning: number; afternoon: number; evening: number }[];
  weights: { date: string; kg: number }[];
  vaccinations: { id: string; name: string; due: string; done: boolean }[];
  treatments: { id: string; disease: string; diagnosis: string; date: string; status: string; vetName?: string }[];
  breedings: { id: string; method: string; date: string; expectedCalving: string; result: string }[];
  feed: { id: string; feed: string; date: string; kg: number }[];
  productivityScore: number;
  deathDate?: string; deathCause?: string; deathNotes?: string;
}

function normalizeSummary(c: any): CowSummary {
  return {
    id: c.id, cowCode: c.cow_code ?? c.cowCode, earTag: c.ear_tag ?? c.earTag,
    name: c.name, breed: c.breed, gender: c.gender, health: c.health,
    isMilking: c.is_milking ?? c.isMilking, isPregnant: c.is_pregnant ?? c.isPregnant,
    weightKg: Number(c.weight_kg ?? c.weightKg ?? 0),
    color: mock.BREED_COLOR[c.breed] || '#888', avgDailyMilk: Number(c.avgDailyMilk ?? 0),
    waterIntakeLiters: Number(c.water_intake_liters ?? c.waterIntakeLiters ?? 0),
    status: c.status ?? 'active',
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
  const res = await apiGet<{ data: any[] }>(`/cows${q({ farmId, ...filters, pageSize: 200 })}`);
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
      deathDate: c.deathDate, deathCause: c.deathCause, deathNotes: c.deathNotes,
    };
  }
  const c = await apiGet<any>(`/cows/${id}`);
  const totals = c.milk.map((m: any) => Number(m.morning_liters) + Number(m.afternoon_liters) + Number(m.evening_liters));
  const avg = totals.length ? totals.reduce((a: number, b: number) => a + b, 0) / totals.length : 0;
  return {
    id: c.id, cowCode: c.cow_code, earTag: c.ear_tag, name: c.name, breed: c.breed,
    gender: c.gender, health: c.health, isMilking: c.is_milking, isPregnant: c.is_pregnant,
    weightKg: Number(c.weight_kg), color: mock.BREED_COLOR[c.breed] || '#888', avgDailyMilk: +avg.toFixed(1),
    waterIntakeLiters: Number(c.water_intake_liters ?? 0),
    status: c.status ?? 'active',
    dob: c.date_of_birth, barnId: c.barn_id, motherId: c.mother_id, fatherId: c.father_id,
    milk: c.milk.map((m: any) => ({ date: m.recorded_on, morning: Number(m.morning_liters), afternoon: Number(m.afternoon_liters), evening: Number(m.evening_liters) })),
    vaccinations: (c.vaccinations || []).map((v: any) => ({ id: v.id, name: v.vaccine_name, due: v.due_on, done: !!v.administered_on })),
    treatments: (c.treatments || []).map((t: any) => ({ id: t.id, disease: t.disease_id || 'Condition', diagnosis: t.diagnosis, date: t.diagnosed_on, status: t.status || 'Active', vetName: t.veterinarian_name || t.vetName || '' })),
    breedings: (c.breedings || []).map((b: any) => ({ id: b.id, method: b.method, date: b.serviced_on, expectedCalving: b.expected_calving_on, result: b.result })),
    feed: (c.feed || []).map((f: any) => ({ id: f.id, feed: f.feed_type_id, date: f.consumed_on, kg: Number(f.quantity) })),
    weights: [], productivityScore: Math.min(99, Math.round(40 + avg * 1.5)),
    deathDate: c.death_date, deathCause: c.death_cause, deathNotes: c.death_notes,
  };
}

function toCamel(body: any) {
  return {
    cowCode: body.cow_code || body.cowCode,
    earTag: body.ear_tag || body.earTag,
    name: body.name,
    breed: body.breed,
    gender: body.gender,
    dateOfBirth: body.date_of_birth || body.dateOfBirth,
    weightKg: body.weight_kg ?? body.weightKg,
    waterIntakeLiters: body.water_intake_liters ?? body.waterIntakeLiters,
    barnId: body.barn_id || body.barnId,
    health: body.health,
    isMilking: body.is_milking ?? body.isMilking,
    isPregnant: body.is_pregnant ?? body.isPregnant,
    deathDate: body.death_date || body.deathDate,
    deathCause: body.death_cause || body.deathCause,
    deathNotes: body.death_notes || body.deathNotes,
    status: body.status,
  };
}

function toCamelMilk(body: any) {
  return {
    cowId: body.cow_id || body.cowId,
    recordedOn: body.recorded_on || body.recordedOn,
    morningLiters: body.morning_liters ?? body.morningLiters,
    afternoonLiters: body.afternoon_liters ?? body.afternoonLiters,
    eveningLiters: body.evening_liters ?? body.eveningLiters,
    fatPercent: body.fat_percent ?? body.fatPercent,
    snfPercent: body.snf_percent ?? body.snfPercent,
  };
}

function toCamelFeed(body: any) {
  return {
    cowId: body.cow_id || body.cowId,
    feedTypeId: body.feed_type_id || body.feedTypeId || body.feed_type || body.feed,
    consumedOn: body.consumed_on || body.consumedOn,
    quantity: body.quantity_kg ?? body.quantity ?? body.kg,
  };
}

function toCamelEmployee(body: any) {
  return {
    jobTitle: body.job_title || body.jobTitle,
    hiredOn: body.hired_on || body.hiredOn,
    baseSalary: body.base_salary ?? body.baseSalary,
  };
}

export const createCow = (farmId: string, body: any) => {
  const camel = toCamel(body);
  const cowCode = camel.cowCode || `${farmId.toUpperCase().slice(0,2)}-${String(mock.ALL_COWS.filter((c) => c.farmId === farmId).length + 1).padStart(3, '0')}`;
  return isLive ? apiSend(`/cows${q({ farmId })}`, 'POST', { ...camel, cowCode }) : (() => {
    const newCow: mock.Cow = {
      id: `${farmId}-c${mock.ALL_COWS.length}`,
      farmId,
      cowCode: `${farmId.toUpperCase().slice(0, 2)}-${String(mock.ALL_COWS.filter((c) => c.farmId === farmId).length + 1).padStart(3, '0')}`,
      earTag: camel.earTag || `ET${mock.intBetween(10000, 99999)}`,
      name: camel.name,
      breed: camel.breed,
      gender: camel.gender || 'female',
      dob: new Date().toISOString().slice(0, 10),
      weightKg: Number(camel.weightKg ?? 0),
      color: mock.BREED_COLOR[camel.breed] || '#888',
      health: camel.health || 'healthy',
      isMilking: camel.isMilking ?? false,
      isPregnant: camel.isPregnant ?? false,
      waterIntakeLiters: Number(camel.waterIntakeLiters ?? 0),
      status: camel.status || 'active',
      deathDate: camel.deathDate,
      deathCause: camel.deathCause,
      deathNotes: camel.deathNotes,
      barnId: camel.barnId || mock.BARNS[0].id,
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
}

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
  isLive ? apiGet<{ data: any[] }>(`/gallery${q({ farmId })}`).then((r) => r.data) : Promise.resolve(mock.GALLERY_ITEMS.filter((g) => g.farmId === farmId));

export const galleryCategories = (farmId: string) =>
  isLive ? apiGet<{ categories: any[]; items: any[] }>('/gallery/categories') : Promise.resolve({ categories: mock.GALLERY_CATEGORIES, items: mock.GALLERY_ITEMS.filter((g) => g.farmId === farmId) });

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

// ---------- Cows edit/delete ----------
export const updateCow = (id: string, body: any) =>
  isLive ? apiSend(`/cows/${id}`, 'PATCH', toCamel(body)) : (() => {
    const c = mock.ALL_COWS.find((x) => x.id === id);
    if (!c) return Promise.reject(new Error('Cow not found'));
    Object.assign(c, body);
    return Promise.resolve(c);
  })();

export const deleteCow = (id: string) =>
  isLive ? apiSend(`/cows/${id}`, 'DELETE') : (() => {
    const idx = mock.ALL_COWS.findIndex((x) => x.id === id);
    if (idx >= 0) mock.ALL_COWS.splice(idx, 1);
    return Promise.resolve();
  })();

// ---------- Milk records ----------
export const listMilkRecords = (cowId?: string) =>
  isLive ? apiGet<{ data: any[] }>(`/milk-records${q({ cowId })}`).then((r) => r.data) : Promise.resolve([]);

export const createMilkRecord = (body: any) =>
  isLive ? apiSend('/milk-records', 'POST', toCamelMilk(body)) : Promise.resolve({ ...body, id: 'mock-mr-' + Date.now() });

export const updateMilkRecord = (id: string, body: any) =>
  isLive ? apiSend(`/milk-records/${id}`, 'PATCH', toCamelMilk(body)) : Promise.resolve({ ...body, id });

export const deleteMilkRecord = (id: string) =>
  isLive ? apiSend(`/milk-records/${id}`, 'DELETE') : Promise.resolve();

// ---------- Feed records ----------
export const listFeedRecords = (cowId?: string) =>
  isLive ? apiGet<{ data: any[] }>(`/feed-records${q({ cowId })}`).then((r) => r.data) : Promise.resolve([]);

export const createFeedRecord = (body: any) =>
  isLive ? apiSend('/feed-records', 'POST', toCamelFeed(body)) : Promise.resolve({ ...body, id: 'mock-fr-' + Date.now() });

export const updateFeedRecord = (id: string, body: any) =>
  isLive ? apiSend(`/feed-records/${id}`, 'PATCH', toCamelFeed(body)) : Promise.resolve({ ...body, id });

export const deleteFeedRecord = (id: string) =>
  isLive ? apiSend(`/feed-records/${id}`, 'DELETE') : Promise.resolve();

// ---------- Employees ----------
export const createEmployee = (farmId: string, body: any) =>
  isLive ? apiSend(`/employees${q({ farmId })}`, 'POST', toCamelEmployee(body)) : Promise.resolve({ ...body, id: 'mock-emp-' + Date.now() });

export const updateEmployee = (id: string, body: any) =>
  isLive ? apiSend(`/employees/${id}`, 'PATCH', toCamelEmployee(body)) : Promise.resolve({ ...body, id });

export const deleteEmployee = (id: string) =>
  isLive ? apiSend(`/employees/${id}`, 'DELETE') : Promise.resolve();

// ---------- Treatments ----------
export const createTreatment = (body: any) =>
  isLive ? apiSend('/treatments', 'POST', body) : Promise.resolve({ ...body, id: 'mock-treat-' + Date.now() });

export const updateTreatment = (id: string, body: any) =>
  isLive ? apiSend(`/treatments/${id}`, 'PATCH', body) : Promise.resolve({ ...body, id });

export const deleteTreatment = (id: string) =>
  isLive ? apiSend(`/treatments/${id}`, 'DELETE') : Promise.resolve();

// ---------- Gallery ----------
export const createGalleryItem = (farmId: string, body: any) =>
  isLive ? apiSend(`/gallery${q({ farmId })}`, 'POST', { ...body, isPrimary: body.is_primary ?? body.isPrimary }) : Promise.resolve({ ...body, id: 'mock-gal-' + Date.now() });

export const updateGalleryItem = (id: string, body: any) =>
  isLive ? apiSend(`/gallery/${id}`, 'PATCH', { ...body, isPrimary: body.is_primary ?? body.isPrimary }) : Promise.resolve({ ...body, id });

export const deleteGalleryItem = (id: string) =>
  isLive ? apiSend(`/gallery/${id}`, 'DELETE') : Promise.resolve();

// ---------- Tasks ----------
export const tasks = (filters?: { status?: string; assignedTo?: string }) =>
  isLive ? apiGet<any[]>(`/tasks${q(filters || {})}`).then((r: any) => r.data) : Promise.resolve(mock.tasks('f1', filters));

export const createTask = (body: any) =>
  isLive ? apiSend('/tasks', 'POST', body) : Promise.resolve({ ...body, id: 'mock-task-' + Date.now() });

export const updateTask = (id: string, body: any) =>
  isLive ? apiSend(`/tasks/${id}`, 'PATCH', body) : Promise.resolve({ ...body, id });

export const deleteTask = (id: string) =>
  isLive ? apiSend(`/tasks/${id}`, 'DELETE') : Promise.resolve();

// ---------- Daily Activities ----------
export const dailyActivities = (farmId: string, date: string) =>
  isLive ? apiGet<any[]>(`/daily-activities${q({ farmId, date })}`).then((r: any) => r.data) : Promise.resolve(mock.dailyActivities(farmId, date));

export const createDailyActivity = (body: any) =>
  isLive ? apiSend('/daily-activities', 'POST', body) : Promise.resolve({ ...body, id: 'mock-act-' + Date.now() });

export const updateDailyActivity = (id: string, body: any) =>
  isLive ? apiSend(`/daily-activities/${id}`, 'PATCH', body) : Promise.resolve({ ...body, id });

export const deleteDailyActivity = (id: string) =>
  isLive ? apiSend(`/daily-activities/${id}`, 'DELETE') : Promise.resolve();
// ---------- Shifts ----------
export const shifts = (farmId: string) =>
  isLive ? apiGet<any[]>(`/shifts${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]);

export const createShift = (farmId: string, body: any) =>
  isLive ? apiSend(`/shifts${q({ farmId })}`, 'POST', body) : Promise.resolve({ ...body, id: 'mock-shift-' + Date.now() });

export const updateShift = (id: string, body: any) =>
  isLive ? apiSend(`/shifts/${id}`, 'PATCH', body) : Promise.resolve({ ...body, id });

export const deleteShift = (id: string) =>
  isLive ? apiSend(`/shifts/${id}`, 'DELETE') : Promise.resolve();

// ---------- Training ----------
export const trainingRecords = (farmId: string) =>
  isLive ? apiGet<any[]>(`/training${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]);

export const createTrainingRecord = (farmId: string, body: any) =>
  isLive ? apiSend(`/training${q({ farmId })}`, 'POST', body) : Promise.resolve({ ...body, id: 'mock-train-' + Date.now() });

export const updateTrainingRecord = (id: string, body: any) =>
  isLive ? apiSend(`/training/${id}`, 'PATCH', body) : Promise.resolve({ ...body, id });

export const deleteTrainingRecord = (id: string) =>
  isLive ? apiSend(`/training/${id}`, 'DELETE') : Promise.resolve();

// ---------- Performance ----------
export const performanceReviews = (farmId: string) =>
  isLive ? apiGet<any[]>(`/performance${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]);

export const createPerformanceReview = (farmId: string, body: any) =>
  isLive ? apiSend(`/performance${q({ farmId })}`, 'POST', body) : Promise.resolve({ ...body, id: 'mock-perf-' + Date.now() });

export const updatePerformanceReview = (id: string, body: any) =>
  isLive ? apiSend(`/performance/${id}`, 'PATCH', body) : Promise.resolve({ ...body, id });

export const deletePerformanceReview = (id: string) =>
  isLive ? apiSend(`/performance/${id}`, 'DELETE') : Promise.resolve();

// ---------- Leave ----------
export const leaveRequests = (farmId: string) =>
  isLive ? apiGet<any[]>(`/leave${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]);

export const createLeaveRequest = (farmId: string, body: any) =>
  isLive ? apiSend(`/leave${q({ farmId })}`, 'POST', body) : Promise.resolve({ ...body, id: 'mock-leave-' + Date.now() });

export const updateLeaveRequest = (id: string, body: any) =>
  isLive ? apiSend(`/leave/${id}`, 'PATCH', body) : Promise.resolve({ ...body, id });

export const deleteLeaveRequest = (id: string) =>
  isLive ? apiSend(`/leave/${id}`, 'DELETE') : Promise.resolve();

// ---------- Messages ----------
export const messages = (farmId: string) =>
  isLive ? apiGet<any[]>(`/messages${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]);

export const sendMessage = (farmId: string, body: any) =>
  isLive ? apiSend(`/messages${q({ farmId })}`, 'POST', body) : Promise.resolve({ ...body, id: 'mock-msg-' + Date.now() });

export const markMessageRead = (id: string) =>
  isLive ? apiSend(`/messages/${id}/read`, 'PATCH') : Promise.resolve({ id, readAt: new Date().toISOString() });

// ---------- Face ----------
export const faceRegistrations = (farmId: string) =>
  isLive ? apiGet<any[]>(`/face${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]);

export const registerFace = (farmId: string, body: any) =>
  isLive ? apiSend(`/face${q({ farmId })}`, 'POST', body) : Promise.resolve({ ...body, id: 'mock-face-' + Date.now() });

export const deleteFaceRegistration = (id: string) =>
  isLive ? apiSend(`/face/${id}`, 'DELETE') : Promise.resolve();

// ---------- GPS ----------
export const gpsLocations = (farmId: string, params?: { employeeId?: string; startDate?: string; endDate?: string }) =>
  isLive ? apiGet<any[]>(`/gps${q({ farmId, ...params })}`).then((r: any) => r.data) : Promise.resolve([]);

export const createGpsLocation = (farmId: string, body: any) =>
  isLive ? apiSend(`/gps${q({ farmId })}`, 'POST', body) : Promise.resolve({ ...body, id: 'mock-gps-' + Date.now() });

// ---------- Attendance ----------
export const attendance = (farmId: string, params?: { employeeId?: string; date?: string }) =>
  isLive ? apiGet<any[]>(`/attendance${q({ farmId, ...params })}`).then((r: any) => r.data) : Promise.resolve([]);

export const createAttendance = (farmId: string, body: any) =>
  isLive ? apiSend(`/attendance${q({ farmId })}`, 'POST', body) : Promise.resolve({ ...body, id: 'mock-att-' + Date.now() });

// ---------- Payroll ----------
export const payroll = (farmId: string) =>
  isLive ? apiGet<any[]>(`/payroll${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]);

export const createPayroll = (farmId: string, body: any) =>
  isLive ? apiSend(`/payroll${q({ farmId })}`, 'POST', body) : Promise.resolve({ ...body, id: 'mock-pay-' + Date.now() });
// ---------- Shift assignments ----------
export const shiftAssignments = (farmId: string) =>
  isLive ? apiGet<any[]>(`/shifts/assignments${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]);

export const assignShift = (shiftId: string, body: any) =>
  isLive ? apiSend(`/shifts/${shiftId}/assign`, 'POST', body) : Promise.resolve({ ...body, id: 'mock-assign-' + Date.now() });

export const deleteShiftAssignment = (id: string) =>
  isLive ? apiSend(`/shifts/assignments/${id}`, 'DELETE') : Promise.resolve();
// ---------- Heat Detection ----------
export const heatDetections = (farmId: string) =>
  isLive ? apiGet<any[]>(`/heat-detection${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]);

export const createHeatDetection = (farmId: string, body: any) =>
  isLive ? apiSend(`/heat-detection${q({ farmId })}`, 'POST', body) : Promise.resolve({ ...body, id: 'mock-heat-' + Date.now() });

export const deleteHeatDetection = (id: string) =>
  isLive ? apiSend(`/heat-detection/${id}`, 'DELETE') : Promise.resolve();

// ---------- Breeding ----------
export const breedingRecords = (farmId: string) =>
  isLive ? apiGet<any[]>(`/breeding${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]);

export const createBreedingRecord = (farmId: string, body: any) =>
  isLive ? apiSend(`/breeding${q({ farmId })}`, 'POST', body) : Promise.resolve({ ...body, id: 'mock-breed-' + Date.now() });

export const updateBreedingRecord = (id: string, body: any) =>
  isLive ? apiSend(`/breeding/${id}`, 'PATCH', body) : Promise.resolve({ ...body, id });

export const deleteBreedingRecord = (id: string) =>
  isLive ? apiSend(`/breeding/${id}`, 'DELETE') : Promise.resolve();

// ---------- Semen Inventory ----------
export const semenInventory = (farmId: string) =>
  isLive ? apiGet<any[]>(`/semen${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]);

export const createSemenItem = (farmId: string, body: any) =>
  isLive ? apiSend(`/semen${q({ farmId })}`, 'POST', body) : Promise.resolve({ ...body, id: 'mock-semen-' + Date.now() });

export const updateSemenItem = (id: string, body: any) =>
  isLive ? apiSend(`/semen/${id}`, 'PATCH', body) : Promise.resolve({ ...body, id });

export const deleteSemenItem = (id: string) =>
  isLive ? apiSend(`/semen/${id}`, 'DELETE') : Promise.resolve();

// ---------- Calving ----------
export const calvingRecords = (farmId: string) =>
  isLive ? apiGet<any[]>(`/calving${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]);

export const createCalvingRecord = (farmId: string, body: any) =>
  isLive ? apiSend(`/calving${q({ farmId })}`, 'POST', body) : Promise.resolve({ ...body, id: 'mock-calving-' + Date.now() });

export const updateCalvingRecord = (id: string, body: any) =>
  isLive ? apiSend(`/calving/${id}`, 'PATCH', body) : Promise.resolve({ ...body, id });

export const deleteCalvingRecord = (id: string) =>
  isLive ? apiSend(`/calving/${id}`, 'DELETE') : Promise.resolve();

// ---------- Twin Births ----------
export const twinBirths = (farmId: string) =>
  isLive ? apiGet<any[]>(`/twin-births${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]);

export const createTwinBirth = (farmId: string, body: any) =>
  isLive ? apiSend(`/twin-births${q({ farmId })}`, 'POST', body) : Promise.resolve({ ...body, id: 'mock-twin-' + Date.now() });

export const deleteTwinBirth = (id: string) =>
  isLive ? apiSend(`/twin-births/${id}`, 'DELETE') : Promise.resolve();

// ---------- Fertility ----------
export const fertilityStats = (farmId: string) =>
  isLive ? apiGet<any[]>(`/fertility${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]);

export const createFertilityStat = (farmId: string, body: any) =>
  isLive ? apiSend(`/fertility${q({ farmId })}`, 'POST', body) : Promise.resolve({ ...body, id: 'mock-fertility-' + Date.now() });

export const updateFertilityStat = (id: string, body: any) =>
  isLive ? apiSend(`/fertility/${id}`, 'PATCH', body) : Promise.resolve({ ...body, id });

// ---------- Genetics ----------
export const geneticAnalysis = (farmId: string) =>
  isLive ? apiGet<any[]>(`/genetics${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]);

export const createGeneticAnalysis = (farmId: string, body: any) =>
  isLive ? apiSend(`/genetics${q({ farmId })}`, 'POST', body) : Promise.resolve({ ...body, id: 'mock-genetic-' + Date.now() });

// ---------- Breeding Recommendations ----------
export const breedingRecommendations = (farmId: string) =>
  isLive ? apiGet<any[]>(`/breeding-recommendations${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]);

export const createBreedingRecommendation = (farmId: string, body: any) =>
  isLive ? apiSend(`/breeding-recommendations${q({ farmId })}`, 'POST', body) : Promise.resolve({ ...body, id: 'mock-rec-' + Date.now() });

export const updateBreedingRecommendation = (id: string, body: any) =>
  isLive ? apiSend(`/breeding-recommendations/${id}`, 'PATCH', body) : Promise.resolve({ ...body, id });
