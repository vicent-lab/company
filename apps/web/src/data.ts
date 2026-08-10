import * as mock from './mock';
import { isLive, apiGet, apiSend, getRefreshToken } from './api';
import { sendOrQueue } from './lib/offline-queue';

function q(params: Record<string, any>): string {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  return p ? `?${p}` : '';
}

// ---------- Farms ----------
export async function loadFarms(): Promise<{ id: string; name: string; location: string; cows: number }[]> {
  if (!isLive) return mock.FARMS.map((f) => ({ ...f, cows: mock.cowsByFarm(f.id).length }));
  const res = await apiGet<{ data: { id: string; name: string; country: string | null; district: string | null; cows: number }[] }>('/farms');
  return res.data.map((f) => ({ id: f.id, name: f.name, location: [f.district, f.country].filter(Boolean).join(', '), cows: f.cows }));
}

export const inviteToFarm = (farmId: string, email: string, role: string) =>
  apiSend<{ message: string; pending: boolean; devInviteLink?: string }>(`/farms/${farmId}/invitations`, 'POST', { email, role });
export const getFarmMembers = (farmId: string) =>
  apiGet<{ members: { id: string; name: string; email: string; role: string; email_verified: boolean }[]; pending: { email: string; role: string; expires_at: string }[] }>(`/farms/${farmId}/members`);

export interface InvitePreview { email: string; farmName: string; role: string; invitedBy: string | null; }
export const getInvitePreview = (token: string) => apiGet<InvitePreview>(`/auth/invitations/${token}`);

export interface AccountTypeInfo {
  id: string; flow: 'owner' | 'team_member' | 'demo'; label: string; framing: string;
  hintRole?: 'administrator' | 'farm_manager' | 'veterinarian' | 'worker' | 'accountant';
}
export const getAccountTypes = () => apiGet<{ data: AccountTypeInfo[] }>('/auth/account-types').then((r) => r.data);

export interface CreateFarmInput {
  name: string; country: string; district: string;
  farmSizeValue: number; farmSizeUnit: 'acres' | 'hectares';
  expectedHerdSize: number; primaryProduction: 'milk' | 'beef' | 'mixed';
  refreshToken: string;
}
export const createFarm = (input: CreateFarmInput) =>
  apiSend<{ token: string; refreshToken: string; farm: { id: string; name: string }; user: any }>('/farms', 'POST', input);
export const updateFarmMedia = (farmId: string, body: { logoUrl?: string; photoUrl?: string }) =>
  apiSend<{ farm: { id: string; name: string; logo_url: string | null; photo_url: string | null } }>(`/farms/${farmId}`, 'PATCH', body);

// ---------- Farm setup wizard: barns + cow import ----------
export const createBarns = (barns: { name: string; capacity?: number }[]) =>
  apiSend<{ data: { id: string; name: string; capacity: number | null }[] }>('/barns', 'POST', { barns });

export interface ImportCowRow {
  cowCode: string; earTag: string; name?: string; breed?: string;
  gender: 'female' | 'male'; weightKg?: number;
}
export const importCows = (cows: ImportCowRow[]) =>
  apiSend<{ created: number; errors: { row: number; message: string }[] }>('/cows/import', 'POST', { cows });

// ---------- Auth flows (password reset, email verification) ----------
export const forgotPassword = (email: string) =>
  apiSend<{ message: string; devResetLink?: string }>('/auth/forgot-password', 'POST', { email });
export const resetPassword = (token: string, newPassword: string) =>
  apiSend<{ message: string }>('/auth/reset-password', 'POST', { token, newPassword });
export const verifyEmail = (code: string) =>
  apiSend<{ message: string }>('/auth/verify-email', 'POST', { code });
export const resendVerification = () =>
  apiSend<{ message: string; devVerifyCode?: string }>('/auth/resend-verification', 'POST');
export const registerAccount = (body: { name: string; email: string; password: string; accountType: 'owner' | 'team_member'; inviteToken?: string }) =>
  apiSend<{ token: string; refreshToken: string; user: any; farms: any[]; devVerifyLink?: string }>('/auth/register', 'POST', body);

// ---------- CAPTCHA + phone login ----------
export const getCaptcha = () => apiGet<{ token: string; question: string }>('/auth/captcha');
export const requestPhoneOtp = (phone: string) =>
  apiSend<{ message: string; devOtpCode?: string }>('/auth/phone/request-otp', 'POST', { phone });
export const getOAuthStatus = (provider: 'google' | 'microsoft' | 'apple') =>
  apiGet<{ enabled: boolean; message?: string }>(`/auth/oauth/${provider}`);

// ---------- Security settings: 2FA, login history, devices ----------
export const get2faStatus = () => apiGet<{ enabled: boolean }>('/security/2fa/status');
export const setup2fa = () => apiSend<{ secret: string; otpauthUrl: string }>('/security/2fa/setup', 'POST');
export const enable2fa = (code: string) => apiSend<{ message: string }>('/security/2fa/enable', 'POST', { code });
export const disable2fa = (password: string) => apiSend<{ message: string }>('/security/2fa/disable', 'POST', { password });

export interface LoginHistoryEntry { success: boolean; reason: string; ip_address: string | null; user_agent: string | null; created_at: string; }
export const getLoginHistory = () => apiGet<{ data: LoginHistoryEntry[] }>('/security/login-history');

export interface DeviceSession {
  id: string; userAgent: string | null; ipAddress: string | null; deviceLabel: string | null;
  createdAt: string; lastSeenAt: string; expiresAt: string; isCurrent: boolean;
}
export const getSessions = () => apiGet<{ data: DeviceSession[] }>(`/security/sessions${q({ refreshToken: getRefreshToken() })}`);
export const revokeSession = (id: string) => apiSend<{ message: string }>(`/security/sessions/${id}/revoke`, 'POST');
export const revokeAllOtherSessions = () =>
  apiSend<{ message: string; count: number }>('/security/sessions/revoke-all-others', 'POST', { refreshToken: getRefreshToken() });

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
  status: string; photoUrl?: string | null;
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
    photoUrl: c.photo_url ?? c.photoUrl ?? null,
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

export async function getCow(id: string): Promise<CowDetail | null> {
  if (!isLive) {
    const c = mock.ALL_COWS.find((x) => x.id === id);
    if (!c) return null;
    return {
      ...normalizeSummary(c),
      dob: c.dob, barnId: c.barnId, motherId: c.motherId, fatherId: c.fatherId,
      milk: c.milk, weights: c.weights, vaccinations: c.vaccinations, treatments: c.treatments,
      breedings: c.breedings, feed: c.feed, productivityScore: c.productivityScore,
      deathDate: c.deathDate, deathCause: c.deathCause, deathNotes: c.deathNotes,
    };
  }
  try {
    const c = await apiGet<any>(`/cows/${id}`);
    const totals = c.milk.map((m: any) => Number(m.morning_liters) + Number(m.afternoon_liters) + Number(m.evening_liters));
    const avg = totals.length ? totals.reduce((a: number, b: number) => a + b, 0) / totals.length : 0;
    return {
      id: c.id, cowCode: c.cow_code, earTag: c.ear_tag, name: c.name, breed: c.breed,
      gender: c.gender, health: c.health, isMilking: c.is_milking, isPregnant: c.is_pregnant,
      weightKg: Number(c.weight_kg), color: mock.BREED_COLOR[c.breed] || '#888', avgDailyMilk: +avg.toFixed(1),
      waterIntakeLiters: Number(c.water_intake_liters ?? 0),
      status: c.status ?? 'active', photoUrl: c.photo_url ?? null,
      dob: c.date_of_birth, barnId: c.barn_id, motherId: c.mother_id, fatherId: c.father_id,
      milk: c.milk.map((m: any) => ({ date: m.recorded_on, morning: Number(m.morning_liters), afternoon: Number(m.afternoon_liters), evening: Number(m.evening_liters) })),
      vaccinations: (c.vaccinations || []).map((v: any) => ({ id: v.id, name: v.vaccine_name, due: v.due_on, done: !!v.administered_on })),
      treatments: (c.treatments || []).map((t: any) => ({ id: t.id, disease: t.disease_name || 'Condition', diagnosis: t.diagnosis, date: t.diagnosed_on, status: t.status || 'Active', vetName: t.veterinarian_name || t.vetName || '' })),
      breedings: (c.breedings || []).map((b: any) => ({ id: b.id, method: b.method, date: b.serviced_on, expectedCalving: b.expected_calving_on, result: b.result })),
      feed: (c.feed || []).map((f: any) => ({ id: f.id, feed: f.feed_type_id, date: f.consumed_on, kg: Number(f.quantity) })),
      weights: [], productivityScore: Math.min(99, Math.round(40 + avg * 1.5)),
      deathDate: c.death_date, deathCause: c.death_cause, deathNotes: c.death_notes,
    };
  } catch (e) {
    return null;
  }
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
    photoUrl: body.photo_url ?? body.photoUrl,
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

function toCamelTreatment(body: any) {
  return {
    cowId: body.cow_id || body.cowId,
    diseaseName: body.disease || body.diseaseName,
    diagnosis: body.diagnosis,
    treatmentPlan: body.treatment_plan || body.treatmentPlan,
    veterinarianName: body.veterinarian_name || body.vetName || body.veterinarianName,
    status: body.status,
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
  isLive ? apiGet<{ data: any[] }>(`/predictions${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve(mock.generateMockPredictions(farmId));

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

export const weather = (farmId: string, period: mock.Period = 'today') =>
  isLive ? apiGet<any>(`/weather${q({ farmId, period })}`) : Promise.resolve(mock.weather(farmId, period));

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
  isLive
    ? apiGet<{ categories: { category: string; count: number }[]; items: any[] }>(`/gallery/categories${q({ farmId })}`).then((r) => ({
        // Backend groups by the raw `category` column (id/label aren't real columns —
        // categories are free-form strings on each gallery row); map to the {id, label,
        // count} shape the picker buttons render, same shape the mock data already uses.
        categories: r.categories.map((c) => ({ id: c.category, label: c.category.charAt(0).toUpperCase() + c.category.slice(1), count: c.count })),
        items: r.items,
      }))
    : Promise.resolve({ categories: mock.GALLERY_CATEGORIES, items: mock.GALLERY_ITEMS.filter((g) => g.farmId === farmId) });

export const customers = (farmId: string) =>
  isLive ? apiGet<{ data: any[] }>(`/customers${q({ farmId })}`).then((r) => r.data) : Promise.resolve(mock.CUSTOMERS);

export const customerInvoices = (id: string) =>
  isLive ? apiGet<{ data: any[] }>(`/customers/${id}/invoices`).then((r) => r.data) : Promise.resolve(mock.INVOICES);

export const employees = (farmId: string) =>
  isLive ? apiGet<{ data: any[] }>(`/employees${q({ farmId })}`).then((r) => r.data) : Promise.resolve(mock.EMPLOYEES);

// ---------- Health & Veterinary ----------
export const healthRecords = (farmId: string) =>
  isLive ? apiGet<any[]>(`/health/records${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]);
export const createHealthRecord = (body: any) =>
  isLive ? apiSend('/health/records', 'POST', body) : Promise.resolve({ ...body, id: 'mock-hr-' + Date.now() });
export const updateHealthRecord = (id: string, body: any) =>
  isLive ? apiSend(`/health/records/${id}`, 'PATCH', body) : Promise.resolve({ ...body, id });
export const deleteHealthRecord = (id: string) =>
  isLive ? apiSend(`/health/records/${id}`, 'DELETE') : Promise.resolve();

export const medicines = (farmId: string) =>
  isLive ? apiGet<any[]>(`/health/medicines${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]);
export const createMedicine = (body: any) =>
  isLive ? apiSend('/health/medicines', 'POST', body) : Promise.resolve({ ...body, id: 'mock-med-' + Date.now() });
export const updateMedicine = (id: string, body: any) =>
  isLive ? apiSend(`/health/medicines/${id}`, 'PATCH', body) : Promise.resolve({ ...body, id });
export const deleteMedicine = (id: string) =>
  isLive ? apiSend(`/health/medicines/${id}`, 'DELETE') : Promise.resolve();

export const labTests = (farmId: string) =>
  isLive ? apiGet<any[]>(`/health/lab-tests${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]);
export const createLabTest = (body: any) =>
  isLive ? apiSend('/health/lab-tests', 'POST', body) : Promise.resolve({ ...body, id: 'mock-lab-' + Date.now() });
export const updateLabTest = (id: string, body: any) =>
  isLive ? apiSend(`/health/lab-tests/${id}`, 'PATCH', body) : Promise.resolve({ ...body, id });
export const deleteLabTest = (id: string) =>
  isLive ? apiSend(`/health/lab-tests/${id}`, 'DELETE') : Promise.resolve();

export const parasiteControl = (farmId: string) =>
  isLive ? apiGet<any[]>(`/health/parasite-control${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]);
export const createParasiteControl = (body: any) =>
  isLive ? apiSend('/health/parasite-control', 'POST', body) : Promise.resolve({ ...body, id: 'mock-par-' + Date.now() });
export const updateParasiteControl = (id: string, body: any) =>
  isLive ? apiSend(`/health/parasite-control/${id}`, 'PATCH', body) : Promise.resolve({ ...body, id });
export const deleteParasiteControl = (id: string) =>
  isLive ? apiSend(`/health/parasite-control/${id}`, 'DELETE') : Promise.resolve();

export const quarantineRecords = (farmId: string) =>
  isLive ? apiGet<any[]>(`/health/quarantine${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]);
export const createQuarantineRecord = (body: any) =>
  isLive ? apiSend('/health/quarantine', 'POST', body) : Promise.resolve({ ...body, id: 'mock-qua-' + Date.now() });
export const updateQuarantineRecord = (id: string, body: any) =>
  isLive ? apiSend(`/health/quarantine/${id}`, 'PATCH', body) : Promise.resolve({ ...body, id });
export const deleteQuarantineRecord = (id: string) =>
  isLive ? apiSend(`/health/quarantine/${id}`, 'DELETE') : Promise.resolve();

export const emergencyAlerts = (farmId: string) =>
  isLive ? apiGet<any[]>(`/health/alerts${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]);
export const createEmergencyAlert = (body: any) =>
  isLive ? apiSend('/health/alerts', 'POST', body) : Promise.resolve({ ...body, id: 'mock-alt-' + Date.now() });
export const updateEmergencyAlert = (id: string, body: any) =>
  isLive ? apiSend(`/health/alerts/${id}`, 'PATCH', body) : Promise.resolve({ ...body, id });
export const deleteEmergencyAlert = (id: string) =>
  isLive ? apiSend(`/health/alerts/${id}`, 'DELETE') : Promise.resolve();

export const treatmentEffectiveness = (farmId: string) =>
  isLive ? apiGet<any[]>(`/health/treatment-effectiveness${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]);

export const mapNodes = (farmId: string) =>
  isLive ? apiGet<{ barns: any[] }>(`/map${q({ farmId })}`) : Promise.resolve({ barns: mock.BARNS.map((b) => ({ id: b.id, name: b.name, cows: mock.cowsByFarm(farmId).filter((c) => c.barnId === b.id).length, capacity: 30 + mock.rndInt(0, 40) })) });

// ---------- Live cow locations ----------
export type CowStatus = 'sick' | 'attention' | 'pregnant' | 'breeding' | 'healthy';
export type { CalvingRisk } from './mock';
export interface CowLocationView {
  cowId: string; cowCode: string; name: string; breed: string;
  health: string; isPregnant: boolean; isMilking: boolean;
  zone: string; activity: string; source: string;
  milkToday: number; status: CowStatus;
  expectedCalvingOn: string | null; daysUntilDue: number | null;
  lastCalvingOn: string | null; daysSinceCalving: number | null; lastDifficultyScore: number | null;
  recentlyCalved: boolean; calvingRisk: mock.CalvingRisk;
}
function deriveCowStatus(health: string, isPregnant: boolean, readyForBreeding: boolean): CowStatus {
  if (health === 'sick') return 'sick';
  if (health === 'under_treatment') return 'attention';
  if (isPregnant) return 'pregnant';
  if (readyForBreeding) return 'breeding';
  return 'healthy';
}
export const cowLocations = async (farmId: string): Promise<CowLocationView[]> => {
  if (!isLive) {
    return mock.cowLocations(farmId).map((c) => ({
      cowId: c.cowId, cowCode: c.cowCode, name: c.name, breed: c.breed,
      health: c.health, isPregnant: c.isPregnant, isMilking: c.isMilking,
      zone: c.zone, activity: c.activity, source: c.source,
      milkToday: c.milkToday, status: deriveCowStatus(c.health, c.isPregnant, c.readyForBreeding),
      expectedCalvingOn: c.expectedCalvingOn, daysUntilDue: c.daysUntilDue,
      lastCalvingOn: c.lastCalvingOn, daysSinceCalving: c.daysSinceCalving, lastDifficultyScore: c.lastDifficultyScore,
      recentlyCalved: c.recentlyCalved, calvingRisk: c.calvingRisk,
    }));
  }
  const r = await apiGet<{ data: CowLocationView[] }>(`/cow-locations${q({ farmId })}`);
  return r.data;
};

export const moveCowLocation = (farmId: string, cowId: string, zone: string, activity: string) => {
  if (!isLive) {
    mock.COW_LOCATION_OVERRIDES[cowId] = { zone, activity };
    return Promise.resolve();
  }
  return apiSend(`/cow-locations${q({ farmId })}`, 'POST', { cowId, zone, activity });
};

export type { ZoneHeat, ZoneRecommendation, Period } from './mock';
export const zoneHeatmap = async (farmId: string, period: mock.Period = 'today'): Promise<{ data: mock.ZoneHeat[]; herdAvgMilk: number; farmFeedStockKg: number }> => {
  if (!isLive) return mock.zoneHeatmap(farmId, period);
  return apiGet(`/cow-locations/heatmap${q({ farmId, period })}`);
};

// ---------- Notifications ----------
const TONE: Record<string, string> = { sick: 'danger', vaccination: 'warn', feed: 'warn', medicine: 'warn', heat: 'info', calving: 'info', task: 'info', payment: 'warn' };
export const notifications = async () => {
  if (!isLive) return mock.NOTIFICATIONS.map((n: any) => ({ ...n, read_at: n.read_at || null }));
  const r = await apiGet<{ data: any[] }>('/notifications');
  return r.data.map((n) => ({
    id: n.id, type: n.type, title: n.title, body: n.body,
    tone: TONE[n.type] || 'info', time: n.read_at ? 'read' : 'new', read_at: n.read_at || null,
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
  isLive
    ? sendOrQueue('/milk-records', 'POST', toCamelMilk(body), 'Milk record')
    : Promise.resolve({ queued: false, data: { ...body, id: 'mock-mr-' + Date.now() } });

export const updateMilkRecord = (id: string, body: any) =>
  isLive ? apiSend(`/milk-records/${id}`, 'PATCH', toCamelMilk(body)) : Promise.resolve({ ...body, id });

export const deleteMilkRecord = (id: string) =>
  isLive ? apiSend(`/milk-records/${id}`, 'DELETE') : Promise.resolve();

// ---------- Feed records ----------
export const listFeedRecords = (cowId?: string) =>
  isLive ? apiGet<{ data: any[] }>(`/feed-records${q({ cowId })}`).then((r) => r.data) : Promise.resolve([]);

export const createFeedRecord = (body: any) =>
  isLive
    ? sendOrQueue('/feed-records', 'POST', toCamelFeed(body), 'Feed record')
    : Promise.resolve({ queued: false, data: { ...body, id: 'mock-fr-' + Date.now() } });

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
  isLive ? apiSend('/treatments', 'POST', toCamelTreatment(body)) : Promise.resolve({ ...body, id: 'mock-treat-' + Date.now() });

export const updateTreatment = (id: string, body: any) =>
  isLive ? apiSend(`/treatments/${id}`, 'PATCH', toCamelTreatment(body)) : Promise.resolve({ ...body, id });

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

export const createTask = (body: any) => {
  const data = { ...body, id: 'mock-task-' + Date.now() };
  if (!isLive) mock.TASKS.push(data);
  return isLive ? apiSend('/tasks', 'POST', body) : Promise.resolve(data);
};

export const updateTask = (id: string, body: any) => {
  if (!isLive) {
    const idx = mock.TASKS.findIndex((t: any) => t.id === id);
    if (idx >= 0) mock.TASKS[idx] = { ...mock.TASKS[idx], ...body };
  }
  return isLive ? apiSend(`/tasks/${id}`, 'PATCH', body) : Promise.resolve({ ...body, id });
};

export const deleteTask = (id: string) => {
  if (!isLive) {
    const idx = mock.TASKS.findIndex((t: any) => t.id === id);
    if (idx >= 0) mock.TASKS.splice(idx, 1);
  }
  return isLive ? apiSend(`/tasks/${id}`, 'DELETE') : Promise.resolve();
};

// ---------- Daily Activities ----------
function toCamelDaily(body: any) {
  return {
    activityType: body.activity_type || body.activityType,
    description: body.description,
    durationMinutes: body.duration_minutes ?? body.durationMinutes,
    relatedCowId: body.related_cow_id || body.relatedCowId,
    relatedTaskId: body.related_task_id || body.relatedTaskId,
    activityDate: body.activity_date || body.activityDate,
    employeeId: body.employee_id || body.employeeId,
  };
}

export const dailyActivities = (farmId: string, date: string) =>
  isLive ? apiGet<any[]>(`/daily-activities${q({ farmId, date })}`).then((r: any) => r.data) : Promise.resolve(mock.dailyActivities(farmId, date));

export const createDailyActivity = (body: any) => {
  const data = { ...body, id: 'mock-act-' + Date.now() };
  if (!isLive) {
    mock.DAILY_ACTIVITIES.push(data);
  }
  return isLive
    ? sendOrQueue('/daily-activities', 'POST', toCamelDaily(data), 'Daily activity')
    : Promise.resolve({ queued: false, data });
};

export const updateDailyActivity = (id: string, body: any) => {
  if (!isLive) {
    const idx = mock.DAILY_ACTIVITIES.findIndex((a) => a.id === id);
    if (idx >= 0) {
      mock.DAILY_ACTIVITIES[idx] = { ...mock.DAILY_ACTIVITIES[idx], ...body };
    }
  }
  return isLive ? apiSend(`/daily-activities/${id}`, 'PATCH', toCamelDaily(body)) : Promise.resolve({ ...body, id });
};

export const deleteDailyActivity = (id: string) => {
  if (!isLive) {
    const idx = mock.DAILY_ACTIVITIES.findIndex((a) => a.id === id);
    if (idx >= 0) mock.DAILY_ACTIVITIES.splice(idx, 1);
  }
  return isLive ? apiSend(`/daily-activities/${id}`, 'DELETE') : Promise.resolve();
};
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
  isLive
    ? sendOrQueue(`/attendance${q({ farmId })}`, 'POST', body, 'Attendance')
    : Promise.resolve({ queued: false, data: { ...body, id: 'mock-att-' + Date.now() } });

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

// ---------- AI Advisor ----------
export interface DailyAdvice {
  greeting: string;
  farmScore: number;
  priorityTasks: { label: string; done: boolean; severity?: string }[];
  urgentAlerts: { title: string; description: string; severity?: string }[];
  healthWarnings: { title: string; description: string; cowId?: string; severity?: string }[];
  milkProductionAnalysis: { title: string; description: string; metrics?: Record<string, any> };
  feedRecommendations: { title: string; description: string; severity?: string }[];
  breedingRecommendations: { title: string; description: string; cowId?: string; severity?: string }[];
  financialSummary: { title: string; description: string; metrics?: Record<string, any> };
  inventoryWarnings: { title: string; description: string; severity?: string }[];
  weatherAdvice: { title: string; description: string; metrics?: Record<string, any> };
  employeeTasks: { title: string; description: string; assignedTo?: string; dueDate?: string }[];
  suggestedImprovements: { title: string; description: string }[];
  endOfDayChecklist: { label: string; done: boolean }[];
  estimatedProfitUgx: number;
}

export const dailyAdvice = (farmId: string) =>
  isLive ? apiGet<{ data: DailyAdvice }>(`/ai-advisor/daily-advice${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve(mock.generateMockDailyAdvice(farmId));

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
  created_at: string;
  updated_at: string;
  metadata?: any;
  actions?: any[];
  evidence?: any[];
  explanation?: {
    probability: number;
    reasons: string[];
    recommendedActions: string[];
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: string;
    relatedCowId?: string;
    confidence: number;
  };
}

export interface FarmScoreDeduction { points: number; reason: string; recommendation: string; }
export interface FarmScoreCategory { score: number; deductions: FarmScoreDeduction[]; }
export interface FarmScoreCategories {
  health: FarmScoreCategory;
  nutrition: FarmScoreCategory;
  breeding: FarmScoreCategory;
  finance: FarmScoreCategory;
  milkProduction: FarmScoreCategory;
  inventory: FarmScoreCategory;
  biosecurity: FarmScoreCategory;
  workerPerformance: FarmScoreCategory;
  animalWelfare: FarmScoreCategory;
}
export interface FarmScoreResult {
  date: string;
  categories: FarmScoreCategories;
  overall: number;
}
export interface FarmScoreHistoryPoint {
  date: string;
  health: number; nutrition: number; breeding: number; finance: number; milkProduction: number;
  inventory: number; biosecurity: number; workerPerformance: number; animalWelfare: number; overall: number;
}

export const farmScore = (farmId: string) =>
  isLive ? apiGet<{ data: FarmScoreResult }>(`/farm-score${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve(mock.generateMockFarmScore(farmId));

export const farmScoreHistory = (farmId: string, days = 30) =>
  isLive ? apiGet<{ data: FarmScoreHistoryPoint[] }>(`/farm-score/history${q({ farmId, days })}`).then((r: any) => r.data) : Promise.resolve(mock.generateMockFarmScoreHistory(farmId, days));

export const aiInsights = (farmId: string, filters: { type?: string; category?: string; severity?: string; status?: string; includeEvidence?: boolean } = {}) => {
  const params: any = { farmId };
  if (filters.type) params.type = filters.type;
  if (filters.category) params.category = filters.category;
  if (filters.severity) params.severity = filters.severity;
  if (filters.status) params.status = filters.status;
  if (filters.includeEvidence) params.includeEvidence = 'true';
  return isLive ? apiGet<{ data: AiInsight[] }>(`/ai-advisor/insights${q(params)}`).then((r: any) => r.data) : Promise.resolve(mock.generateMockInsights(farmId));
};

export const aiInsightHistory = (farmId: string, days = 30) =>
  isLive ? apiGet<{ data: AiInsight[] }>(`/ai-advisor/insights/history${q({ farmId, days })}`).then((r: any) => r.data) : Promise.resolve(mock.generateMockInsights(farmId).sort((a: AiInsight, b: AiInsight) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 20));

export interface TimelineEvent {
  at: string;
  type: 'milk' | 'activity' | 'health' | 'insight' | 'action';
  label: string;
}

// No mock fallback with fabricated clock times — several source tables (vaccinations,
// feed logs) only store a date, not a time of day, so a demo timeline would have to
// invent times that don't exist. Live mode shows exactly what's real; demo mode shows
// an honest empty state instead of fake precision.
export const aiTimeline = (farmId: string, date?: string) =>
  isLive ? apiGet<{ data: TimelineEvent[] }>(`/ai-advisor/timeline${q({ farmId, date })}`).then((r: any) => r.data) : Promise.resolve([]);

export const submitFeedback = (insightId: string, farmId: string, body: { helpful?: boolean; accurate?: boolean; urgent?: boolean; note?: string }) =>
  isLive ? apiSend<any>(`/ai-advisor/insights/${insightId}/feedback${q({ farmId })}`, 'POST', body) : Promise.resolve({ ok: true });

export const runAiAnalysis = (farmId: string) =>
  isLive ? apiSend<any>(`/ai-advisor/analyze${q({ farmId })}`, 'POST') : Promise.resolve({ ok: true, created: 7, insights: mock.generateMockInsights(farmId) });

export const aiDailyActionPlan = (farmId: string) =>
  isLive ? apiSend<any>(`/ai-advisor/daily-action-plan${q({ farmId })}`, 'POST') : Promise.resolve({ ok: true, plan: null, action_items: mock.generateMockInsights(farmId).slice(0, 5) });

export const updateAiInsight = (id: string, body: { status?: string }) =>
  isLive ? apiSend<any>(`/ai-advisor/insights/${id}`, 'PATCH', body) : Promise.resolve({ ...body, id });

export const addAiAction = (insightId: string, farmId: string, body: { title: string; description?: string; assignedTo?: string; dueDate?: string }) =>
  isLive ? apiSend<any>(`/ai-advisor/insights/${insightId}/actions${q({ farmId })}`, 'POST', body) : Promise.resolve({ ...body, id: 'mock-action-' + Date.now() });

export const updateAiAction = (actionId: string, farmId: string, body: any) =>
  isLive ? apiSend<any>(`/ai-advisor/actions/${actionId}${q({ farmId })}`, 'PATCH', body) : Promise.resolve({ ...body, id: actionId });

export interface AiChatAttachment { name: string; type: string; data: string }
export interface AiChatMessage {
  id: string; question: string; answer: string;
  attachment_name?: string | null; attachment_type?: string | null; attachment_data?: string | null;
  created_at: string;
}

export const aiChat = (question: string, farmId: string, attachment?: AiChatAttachment) =>
  isLive
    ? apiSend<{ id: string; answer: string; created_at: string }>(`/ai-advisor/chat${q({ farmId })}`, 'POST', { question, attachment })
    : Promise.resolve({ id: `mock-${Date.now()}`, created_at: new Date().toISOString(), answer: 'I am analyzing your farm data. For live data insights, ensure the backend is connected. In mock mode, I can show general advice.' });

export const aiChatHistory = (farmId: string) =>
  isLive ? apiGet<{ data: AiChatMessage[] }>(`/ai-advisor/chat/history${q({ farmId })}`).then((r) => r.data) : Promise.resolve([] as AiChatMessage[]);

export const deleteAiChatMessage = (id: string, farmId: string) =>
  isLive ? apiSend<{ ok: boolean }>(`/ai-advisor/chat/history/${id}${q({ farmId })}`, 'DELETE') : Promise.resolve({ ok: true });

export const clearAiChatHistory = (farmId: string) =>
  isLive ? apiSend<{ ok: boolean }>(`/ai-advisor/chat/history${q({ farmId })}`, 'DELETE') : Promise.resolve({ ok: true });

export const recordInsightOutcome = (insightId: string, farmId: string, body: { outcome: 'success' | 'failure' | 'partial' | 'unknown'; actualValue?: number; notes?: string }) =>
  isLive ? apiSend<any>(`/ai-advisor/insights/${insightId}/outcome${q({ farmId })}`, 'POST', body) : Promise.resolve({ ok: true });

export const runVerification = (farmId: string) =>
  isLive ? apiSend<any>(`/ai-advisor/learning/verify${q({ farmId })}`, 'POST') : Promise.resolve({ ok: true });

export const getCalibration = (farmId: string, ruleId?: string) =>
  isLive ? apiGet<any>(`/ai-advisor/learning/calibration${q({ farmId, ...(ruleId ? { ruleId } : {}) })}`).then((r: any) => r.data) : Promise.resolve([]);

export const getLearningStats = (farmId: string) =>
  isLive ? apiGet<any>(`/ai-advisor/learning/stats${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve({ totalRulesLearned: 0, averageAccuracy: 0.75, suppressedRules: 0, improvementsThisMonth: 0 });

export const triggerRetrain = (farmId: string) =>
  isLive ? apiSend<any>(`/ai-advisor/learning/retrain${q({ farmId })}`, 'POST') : Promise.resolve({ ok: true });

export interface AutopilotRule {
  id: string;
  description: string;
  risk: string;
  maxAmountUGX: number;
  allowedCategories: string[];
  requiresApproval: boolean;
}

export const autopilotRules = () =>
  isLive ? apiGet<{ data: AutopilotRule[] }>(`/autopilot/autopilot-rules`).then((r: any) => r.data) : Promise.resolve([
    { id: 'auto_reorder_feed', description: 'Reorders feed when stock is below reorder level for 2+ days', risk: 'low', maxAmountUGX: 5_000_000, allowedCategories: ['feed', 'inventory'], requiresApproval: false },
    { id: 'auto_schedule_checkup', description: 'Schedules vet checkup for cows flagged as sick for 3+ days', risk: 'medium', maxAmountUGX: 2_000_000, allowedCategories: ['health'], requiresApproval: true },
    { id: 'auto_acknowledge_low_risk', description: 'Acknowledges low-risk AI insights automatically', risk: 'low', maxAmountUGX: 0, allowedCategories: ['general', 'review'], requiresApproval: false },
  ] as AutopilotRule[]);

export const runAutopilot = (farmId: string) =>
  isLive ? apiSend<{ processed: number; executed: number; results: any[] }>(`/autopilot/run${q({ farmId })}`, 'POST') : Promise.resolve({ processed: 3, executed: 1, results: [] });

export const autopilotInsight = (insightId: string, farmId: string) =>
  isLive ? apiSend<{ executed: boolean; reason: string }>(`/autopilot/insights/${insightId}/autopilot${q({ farmId })}`, 'POST') : Promise.resolve({ executed: false, reason: 'mock' });

export interface WhatIfScenario {
  id: string;
  label: string;
  description: string;
  params: string[];
}

export interface WhatIfResult {
  scenario: string;
  riskScore: number;
  estimatedImpactUGX: number;
  recommendations: string[];
  affectedCows: number;
  timeline: string;
  confidence: number;
}

export const whatIfScenarios = () =>
  isLive ? apiGet<{ data: WhatIfScenario[] }>(`/what-if/scenarios`).then((r: any) => r.data) : Promise.resolve([
    { id: 'reduce_feed', label: 'Reduce feed', description: 'Cut concentrate or total feed by X%', params: ['reduction_pct'] },
    { id: 'sell_cows', label: 'Sell cows', description: 'Sell N lowest-producing cows', params: ['count'] },
    { id: 'delay_vaccination', label: 'Delay vaccination', description: 'Postpone vaccination by N days', params: ['delay_days'] },
    { id: 'increase_feed', label: 'Increase feed', description: 'Boost feed to improve yield by X%', params: ['increase_pct'] },
    { id: 'change_milking_schedule', label: 'Change milking schedule', description: 'Shift milking window by 1–2 hours', params: [] },
  ] as WhatIfScenario[]);

export const runWhatIf = (farmId: string, body: { scenario: string; parameters: Record<string, any> }) =>
  isLive ? apiSend<{ data: WhatIfResult }>(`/what-if/what-if${q({ farmId })}`, 'POST', body) : Promise.resolve({
    data: {
      scenario: body.scenario,
      riskScore: 30,
      estimatedImpactUGX: -120_000,
      recommendations: ['Simulation: monitor impact.', 'Check quality metrics weekly.'],
      affectedCows: 3,
      timeline: '1–2 weeks',
      confidence: 0.7,
    },
  });


export interface CommandCenterData {
  generatedAt: string;
  farmScore: number;
  farmScoreDelta: number;
  herdPulse: {
    total: number; milking: number; sick: number; inTreatment: number;
    calvingToday: number; calvingThisWeek: number; sickCodes: string[]; treatmentCodes: string[];
  };
  blocks: { label: string; window: string; actions: CommandAction[] }[];
  eveningReview: { tasksChecked: number; pendingCount: number; completionPct: number };
  meta: { totalActions: number; criticalPending: number; estimatedTimeTotalMinutes: number; highestRiskAction: CommandAction | null };
}

export interface CommandAction {
  id: string;
  block: 'morning' | 'midday' | 'evening' | 'urgent';
  title: string;
  category: string;
  priority: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  reason: string;
  consequenceIfSkipped: string;
  estimatedCostIfSkippedUGX: number;
  estimatedTimeMinutes: number;
  relatedCowId?: string | null;
  cowCode?: string | null;
  source: string;
  done: boolean;
  delegatedTo?: string | null;
  actionable: boolean;
  shortcut?: string;
}

export const commandCenter = (farmId: string) =>
  isLive ? apiGet<{ data: CommandCenterData }>(`/ai-advisor/command-center${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve(mock.generateMockCommandCenter(farmId));

export interface FarmSetupStep { key: string; label: string; done: boolean; }
export const getFarmSetupStatus = (farmId: string) =>
  apiGet<{ steps: FarmSetupStep[]; completionPct: number }>(`/farms/${farmId}/setup-status`);

// ---------- Platform admin (Super Admin only) ----------
export interface PlatformOverview {
  total_farms: number; total_users: number; total_cows: number;
  new_users_7d: number; new_farms_7d: number; unverified_users: number; super_admin_count: number;
}
export const getPlatformOverview = () => apiGet<PlatformOverview>('/platform/overview');

export interface PlatformFarm {
  id: string; name: string; country: string | null; district: string | null;
  primary_production: string | null; created_at: string;
  cows: number; members: number; owner_name: string | null; owner_email: string | null;
}
export const getPlatformFarms = () => apiGet<{ data: PlatformFarm[] }>('/platform/farms');

export interface PlatformUser {
  id: string; name: string; email: string; account_type: string | null;
  is_active: boolean; is_super_admin: boolean; email_verified: boolean;
  created_at: string; farm_count: number;
}
export const getPlatformUsers = () => apiGet<{ data: PlatformUser[] }>('/platform/users');
