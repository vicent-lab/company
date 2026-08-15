import * as mock from './mock';
import { isLive, apiGet, apiSend, getRefreshToken } from './api';
import { sendOrQueue } from './lib/offline-queue';
import { mockPregnancies, mockOffspring } from './mock';

function q(params: Record<string, any>): string {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  return p ? `?${p}` : '';
}

function backendRequired(feature: string): Promise<never> {
  return Promise.reject(new Error('I couldn\'t access your farm data right now. Please try again.'));
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

export interface LinkedIdentity {
  id: string; provider: string; providerAccountId: string; email: string; name: string | null; createdAt: string;
}
export interface AuthMethod { provider: string; connected: boolean; identity: LinkedIdentity | null; }
export const getLinkedIdentities = () => apiGet<{ data: AuthMethod[] }>('/auth/identities');
export const unlinkIdentity = (provider: string, id: string) => apiSend<{ ok: true }>(`/auth/identities/${provider}/${id}`, 'DELETE');

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
  status: string; photoUrl?: string | null; barnId?: string; dob?: string;
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
    barnId: c.barn_id ?? c.barnId ?? undefined,
    dob: c.date_of_birth ?? c.dob ?? undefined,
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
      breedings: (c.breedings || []).map((b: any) => ({ id: b.id, method: b.method, date: b.breeding_date, sireId: b.sire_id, technician: b.technician, expectedCalving: b.expected_calving_on, result: b.result })),
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
const CATEGORY: Record<string, string> = { sick: 'critical', vaccination: 'important', feed: 'important', medicine: 'important', payment: 'important', heat: 'information', calving: 'important', task: 'information' };
// Map type -> default route when the API doesn't provide a link
const DEFAULT_LINK: Record<string, string> = {
  sick: '/app/cow', vaccination: '/app/health', feed: '/app/management', medicine: '/app/health',
  payment: '/app/customers', heat: '/app/breeding', calving: '/app/breeding', task: '/app/tasks',
};
export const notifications = async () => {
  if (!isLive) return mock.NOTIFICATIONS.map((n: any) => ({ ...n, read_at: n.read_at || null }));
  const r = await apiGet<{ data: any[] }>('/notifications');
  return r.data.map((n) => ({
    id: n.id, type: n.type, title: n.title, body: n.body,
    tone: TONE[n.type] || 'info', time: n.read_at ? 'read' : 'new', read_at: n.read_at || null,
    category: n.category || CATEGORY[n.type] || 'information',
    link: n.link || n.cow_id ? (n.link || `/app/cow/${n.cow_id}`) : (DEFAULT_LINK[n.type] || '/app/alerts'),
    cowId: n.cow_id || n.cowId, taskId: n.task_id || n.taskId,
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

// ---------- Pregnancies ----------
export const pregnancies = (farmId: string) =>
  isLive ? apiGet<any[]>(`/pregnancies${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve(mockPregnancies);

export const createPregnancy = (farmId: string, body: any) => {
  const data = { ...body, id: 'mock-preg-' + Date.now() };
  if (!isLive) mockPregnancies.push(data);
  return isLive ? apiSend(`/pregnancies${q({ farmId })}`, 'POST', body) : Promise.resolve(data);
}

export const updatePregnancy = (id: string, body: any) => {
  if (!isLive) {
    const idx = mockPregnancies.findIndex((p: any) => p.id === id);
    if (idx >= 0) mockPregnancies[idx] = { ...mockPregnancies[idx], ...body };
  }
  return isLive ? apiSend(`/pregnancies/${id}`, 'PATCH', body) : Promise.resolve({ ...body, id });
}

export const deletePregnancy = (id: string) => {
  if (!isLive) {
    const idx = mockPregnancies.findIndex((p: any) => p.id === id);
    if (idx >= 0) mockPregnancies.splice(idx, 1);
  }
  return isLive ? apiSend(`/pregnancies/${id}`, 'DELETE') : Promise.resolve();
}

// ---------- Offspring ----------
export const offspring = (farmId: string) =>
  isLive ? apiGet<any[]>(`/offspring${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve(mockOffspring);

export const createOffspring = (farmId: string, body: any) => {
  const data = { ...body, id: 'mock-offspring-' + Date.now() };
  if (!isLive) mockOffspring.push(data);
  return isLive ? apiSend(`/offspring${q({ farmId })}`, 'POST', body) : Promise.resolve(data);
}

export const deleteOffspring = (id: string) => {
  if (!isLive) {
    const idx = mockOffspring.findIndex((o: any) => o.id === id);
    if (idx >= 0) mockOffspring.splice(idx, 1);
  }
  return isLive ? apiSend(`/offspring/${id}`, 'DELETE') : Promise.resolve();
}

// ---------- Pedigree ----------
export interface PedigreeCow {
  id: string; cowCode: string; name: string; breed: string; gender: string;
  dateOfBirth: string; status: string; health: string; photoUrl?: string; motherId?: string; fatherId?: string;
}
export interface PedigreeNode {
  cow: PedigreeCow;
  mother?: PedigreeNode;
  father?: PedigreeNode;
  offspring: PedigreeCow[];
}
export const getPedigree = (cowId: string, generations = 3) =>
  isLive ? apiGet<PedigreeNode>(`/pedigree/${cowId}?generations=${generations}`) : Promise.resolve(mock.mockPedigreeNode(cowId));

export const getOffspring = (cowId: string) =>
  isLive ? apiGet<PedigreeCow[]>(`/pedigree/offspring/${cowId}`) : Promise.resolve(mock.mockOffspringFor(cowId));

export const getAncestors = (cowId: string, generations = 3) =>
  isLive ? apiGet<PedigreeCow[]>(`/pedigree/ancestors/${cowId}?generations=${generations}`) : Promise.resolve([]);

// ---------- Breeding Analytics ----------
export interface BreedingAnalytics {
  conceptionRate: number;
  pregnancyRate: number;
  calvingInterval: number;
  servicesPerConception: number;
  daysOpen: number;
  ageAtFirstCalving: number;
  calvingSuccessRate: number;
  totalBreeding: number;
  totalCalvings: number;
}
export const getBreedingAnalytics = (farmId: string, filters?: Record<string, any>) =>
  isLive ? apiGet<BreedingAnalytics>(`/breeding/analytics?farmId=${farmId}${filters ? '&' + new URLSearchParams(filters as any).toString() : ''}`) : Promise.resolve(mock.mockBreedingAnalytics(farmId));

// ---------- AI Breeding Assistant ----------
export interface BreedingAssistantResult {
  cowId: string; sireId: string; related: boolean; risk: string;
  cow: { id: string; cowCode: string; name: string; breed: string; gender: string };
  sire: { id: string; cowCode: string; name: string; breed: string; gender: string };
  previousOffspring: any[];
  breedingHistory: any[];
  healthInfo: { health: string; status: string };
  milkProduction: { avgDailyLiters90d: number };
  recommendation: string;
}
export const getBreedingAssistant = (cowId: string, sireId: string) =>
  isLive ? apiSend<BreedingAssistantResult>(`/ai/breeding-assistant`, 'POST', { cowId, sireId }) : Promise.resolve(mock.mockBreedingAssistant(cowId, sireId));

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
  isLive ? apiGet<{ data: DailyAdvice }>(`/ai-advisor/daily-advice${q({ farmId })}`).then((r: any) => r.data) : backendRequired('daily advice');

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
  isLive ? apiGet<{ data: FarmScoreResult }>(`/farm-score${q({ farmId })}`).then((r: any) => r.data) : backendRequired('farm score');

export const farmScoreHistory = (farmId: string, days = 30) =>
  isLive ? apiGet<{ data: FarmScoreHistoryPoint[] }>(`/farm-score/history${q({ farmId, days })}`).then((r: any) => r.data) : backendRequired('farm score history');

export const aiInsights = (farmId: string, filters: { type?: string; category?: string; severity?: string; status?: string; includeEvidence?: boolean } = {}) => {
  const params: any = { farmId };
  if (filters.type) params.type = filters.type;
  if (filters.category) params.category = filters.category;
  if (filters.severity) params.severity = filters.severity;
  if (filters.status) params.status = filters.status;
  if (filters.includeEvidence) params.includeEvidence = 'true';
  return isLive ? apiGet<{ data: AiInsight[] }>(`/ai-advisor/insights${q(params)}`).then((r: any) => r.data) : backendRequired('AI insights');
};

export const aiInsightHistory = (farmId: string, days = 30) =>
  isLive ? apiGet<{ data: AiInsight[] }>(`/ai-advisor/insights/history${q({ farmId, days })}`).then((r: any) => r.data) : backendRequired('AI insight history');

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
  isLive ? apiGet<{ data: TimelineEvent[] }>(`/ai-advisor/timeline${q({ farmId, date })}`).then((r: any) => r.data) : backendRequired('timeline');

export const submitFeedback = (insightId: string, farmId: string, body: { helpful?: boolean; accurate?: boolean; urgent?: boolean; note?: string }) =>
  isLive ? apiSend<any>(`/ai-advisor/insights/${insightId}/feedback${q({ farmId })}`, 'POST', body) : backendRequired('feedback');

export const runAiAnalysis = (farmId: string) =>
  isLive ? apiSend<any>(`/ai-advisor/analyze${q({ farmId })}`, 'POST') : backendRequired('AI analysis');

export const aiDailyActionPlan = (farmId: string) =>
  isLive ? apiSend<any>(`/ai-advisor/daily-action-plan${q({ farmId })}`, 'POST') : backendRequired('daily action plan');

export const updateAiInsight = (id: string, body: { status?: string }) =>
  isLive ? apiSend<any>(`/ai-advisor/insights/${id}`, 'PATCH', body) : Promise.resolve({ ...body, id });

export const addAiAction = (insightId: string, farmId: string, body: { title: string; description?: string; assignedTo?: string; dueDate?: string }) =>
  isLive ? apiSend<any>(`/ai-advisor/insights/${insightId}/actions${q({ farmId })}`, 'POST', body) : backendRequired('add action');

export const updateAiAction = (actionId: string, farmId: string, body: any) =>
  isLive ? apiSend<any>(`/ai-advisor/actions/${actionId}${q({ farmId })}`, 'PATCH', body) : backendRequired('update action');

export interface AiChatAttachment { name: string; type: string; data: string }
export interface AiChatMessage {
  id: string; question: string; answer: string;
  attachment_name?: string | null; attachment_type?: string | null; attachment_data?: string | null;
  created_at: string;
}

export const aiChat = (question: string, farmId: string, attachment?: AiChatAttachment) =>
  isLive
    ? apiSend<{ id: string; answer: string; created_at: string }>(`/ai-advisor/chat${q({ farmId })}`, 'POST', { question, attachment })
    : backendRequired('AI chat');

export const aiChatHistory = (farmId: string) =>
  isLive ? apiGet<{ data: AiChatMessage[] }>(`/ai-advisor/chat/history${q({ farmId })}`).then((r) => r.data) : backendRequired('chat history');

export const deleteAiChatMessage = (id: string, farmId: string) =>
  isLive ? apiSend<{ ok: boolean }>(`/ai-advisor/chat/history/${id}${q({ farmId })}`, 'DELETE') : backendRequired('delete message');

export const clearAiChatHistory = (farmId: string) =>
  isLive ? apiSend<{ ok: boolean }>(`/ai-advisor/chat/history${q({ farmId })}`, 'DELETE') : backendRequired('clear history');

export const recordInsightOutcome = (insightId: string, farmId: string, body: { outcome: 'success' | 'failure' | 'partial' | 'unknown'; actualValue?: number; notes?: string }) =>
  isLive ? apiSend<any>(`/ai-advisor/insights/${insightId}/outcome${q({ farmId })}`, 'POST', body) : backendRequired('outcome recording');

export const runVerification = (farmId: string) =>
  isLive ? apiSend<any>(`/ai-advisor/learning/verify${q({ farmId })}`, 'POST') : backendRequired('outcome verification');

export const getCalibration = (farmId: string, ruleId?: string) =>
  isLive ? apiGet<any>(`/ai-advisor/learning/calibration${q({ farmId, ...(ruleId ? { ruleId } : {}) })}`).then((r: any) => r.data) : backendRequired('calibration');

export const getLearningStats = (farmId: string) =>
  isLive ? apiGet<any>(`/ai-advisor/learning/stats${q({ farmId })}`).then((r: any) => r.data) : backendRequired('learning stats');

export const triggerRetrain = (farmId: string) =>
  isLive ? apiSend<any>(`/ai-advisor/learning/retrain${q({ farmId })}`, 'POST') : backendRequired('retrain');

export interface AutopilotRule {
  id: string;
  description: string;
  risk: string;
  maxAmountUGX: number;
  allowedCategories: string[];
  requiresApproval: boolean;
}

export const autopilotRules = () =>
  isLive ? apiGet<{ data: AutopilotRule[] }>(`/autopilot/autopilot-rules`).then((r: any) => r.data) : backendRequired('autopilot rules');

export const runAutopilot = (farmId: string) =>
  isLive ? apiSend<{ processed: number; executed: number; results: any[] }>(`/autopilot/run${q({ farmId })}`, 'POST') : backendRequired('run autopilot');

export const autopilotInsight = (insightId: string, farmId: string) =>
  isLive ? apiSend<{ executed: boolean; reason: string }>(`/autopilot/insights/${insightId}/autopilot${q({ farmId })}`, 'POST') : backendRequired('autopilot insight');

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
  isLive ? apiGet<{ data: WhatIfScenario[] }>(`/what-if/scenarios`).then((r: any) => r.data) : backendRequired('scenarios');

export const runWhatIf = (farmId: string, body: { scenario: string; parameters: Record<string, any> }) =>
  isLive ? apiSend<{ data: WhatIfResult }>(`/what-if/what-if${q({ farmId })}`, 'POST', body) : backendRequired('simulation');


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
  isLive ? apiGet<{ data: CommandCenterData }>(`/ai-advisor/command-center${q({ farmId })}`).then((r: any) => r.data) : backendRequired('command center');

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

// ---------- Farm Map Editor ----------
export interface FarmMapObject {
  id: string; farmId: string; type: string; name: string; properties: Record<string, any>;
  geometry: { type: 'Point' | 'LineString' | 'Polygon'; coordinates: number[] | number[][] | number[][][] };
  zIndex: number; isLocked: boolean; createdBy: string; updatedBy: string; createdAt: string; updatedAt: string;
}

const mockFarmMapObjects: FarmMapObject[] = [
  { id: 'mo-1', farmId: 'f1', type: 'barn', name: 'Barn A', properties: { capacity: 60, currentAnimals: 38, waterPoints: 2, feedArea: 'Southeast corner', ventilation: 'Natural + fans', notes: 'Main milking barn' }, geometry: { type: 'Polygon', coordinates: [[[26,28],[34,28],[34,36],[26,36],[26,28]]] }, zIndex: 1, isLocked: false, createdBy: 'u1', updatedBy: 'u1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'mo-2', farmId: 'f1', type: 'pasture', name: 'Pasture 1', properties: { areaHectares: 12, grazingType: 'rotational', notes: 'Good cover' }, geometry: { type: 'Polygon', coordinates: [[[38,62],[48,62],[48,72],[38,72],[38,62]]] }, zIndex: 0, isLocked: false, createdBy: 'u1', updatedBy: 'u1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'mo-3', farmId: 'f1', type: 'water_point', name: 'Water Tank', properties: { flowRateLpm: 12, temperatureC: 14, status: 'clean', notes: 'Main water supply' }, geometry: { type: 'Point', coordinates: [34, 46] }, zIndex: 2, isLocked: false, createdBy: 'u1', updatedBy: 'u1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'mo-4', farmId: 'f1', type: 'feed_store', name: 'Feed Store', properties: { silageKg: 2400, concentrateKg: 380, notes: 'Concentrate running low' }, geometry: { type: 'Point', coordinates: [90, 36] }, zIndex: 2, isLocked: false, createdBy: 'u1', updatedBy: 'u1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'mo-5', farmId: 'f1', type: 'milking_area', name: 'Milking Parlor', properties: { stalls: 16, sessionsPerDay: 3, notes: 'Parlour 2x8' }, geometry: { type: 'Polygon', coordinates: [[[14,26],[18,26],[18,30],[14,30],[14,26]]] }, zIndex: 1, isLocked: false, createdBy: 'u1', updatedBy: 'u1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

let mockUndoLog: any[] = [];
let mockDraft: FarmMapObject[] = [];

const mockFarmBoundaries: FarmBoundary[] = [];
const mockFarmPastures: FarmPasture[] = [];
const mockMapMeasurements: MapMeasurement[] = [];

export const listFarmMapObjects = (farmId: string) =>
  isLive ? apiGet<{ data: FarmMapObject[] }>(`/farm-map/objects?farmId=${farmId}`).then((r) => r.data) : Promise.resolve(mockFarmMapObjects.filter((o) => o.farmId === farmId));

export const createFarmMapObject = (farmId: string, obj: Partial<FarmMapObject>) =>
  isLive ? apiSend<FarmMapObject>(`/farm-map/objects?farmId=${farmId}`, 'POST', obj) : (() => {
    const newObj: FarmMapObject = {
      id: `mo-${Date.now()}`,
      farmId,
      type: obj.type || 'custom',
      name: obj.name || 'New Object',
      properties: obj.properties || {},
      geometry: obj.geometry || { type: 'Point', coordinates: [0, 0] },
      zIndex: obj.zIndex ?? 0,
      isLocked: obj.isLocked ?? false,
      createdBy: 'me',
      updatedBy: 'me',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockFarmMapObjects.push(newObj);
    mockUndoLog.unshift({ id: `undo-${Date.now()}`, action: 'create', entity_type: 'farm_map_object', entity_id: newObj.id, old_state: null, new_state: newObj });
    return Promise.resolve(newObj);
  })();

export const updateFarmMapObject = (farmId: string, id: string, updates: Partial<FarmMapObject>) =>
  isLive ? apiSend<FarmMapObject>(`/farm-map/objects/${id}?farmId=${farmId}`, 'PATCH', updates) : (() => {
    const idx = mockFarmMapObjects.findIndex((o) => o.id === id && o.farmId === farmId);
    if (idx < 0) return Promise.reject(new Error('Not found'));
    const oldState = { ...mockFarmMapObjects[idx] };
    mockFarmMapObjects[idx] = { ...mockFarmMapObjects[idx], ...updates, updatedAt: new Date().toISOString() };
    mockUndoLog.unshift({ id: `undo-${Date.now()}`, action: 'update', entity_type: 'farm_map_object', entity_id: id, old_state: oldState, new_state: mockFarmMapObjects[idx] });
    return Promise.resolve(mockFarmMapObjects[idx]);
  })();

export const deleteFarmMapObject = (farmId: string, id: string) =>
  isLive ? apiSend(`/farm-map/objects/${id}?farmId=${farmId}`, 'DELETE') : (() => {
    const idx = mockFarmMapObjects.findIndex((o) => o.id === id && o.farmId === farmId);
    if (idx < 0) return Promise.reject(new Error('Not found'));
    const oldState = { ...mockFarmMapObjects[idx] };
    mockFarmMapObjects.splice(idx, 1);
    mockUndoLog.unshift({ id: `undo-${Date.now()}`, action: 'delete', entity_type: 'farm_map_object', entity_id: id, old_state: oldState, new_state: null });
    return Promise.resolve();
  })();

export const moveFarmMapObject = (farmId: string, id: string, geometry: any) =>
  isLive ? apiSend<{ geometry: any }>(`/farm-map/objects/${id}/move?farmId=${farmId}`, 'POST', { geometry }) : (() => {
    const obj = mockFarmMapObjects.find((o) => o.id === id && o.farmId === farmId);
    if (!obj) return Promise.reject(new Error('Not found'));
    obj.geometry = geometry;
    obj.updatedAt = new Date().toISOString();
    return Promise.resolve({ geometry });
  })();

export const getUndoLog = (farmId: string) =>
  isLive ? apiGet<{ data: any[] }>(`/farm-map/undo?farmId=${farmId}`).then((r) => r.data) : Promise.resolve(mockUndoLog);

export const undoChange = (farmId: string, undoId: string) =>
  isLive ? apiSend(`/farm-map/undo/${undoId}?farmId=${farmId}`, 'POST') : (() => {
    const entry = mockUndoLog.find((e) => e.id === undoId);
    if (!entry) return Promise.resolve({ ok: true });
    if (entry.action === 'create') {
      const idx = mockFarmMapObjects.findIndex((o) => o.id === entry.entity_id);
      if (idx >= 0) mockFarmMapObjects.splice(idx, 1);
    } else if (entry.action === 'update') {
      const obj = mockFarmMapObjects.find((o) => o.id === entry.entity_id);
      if (obj && entry.old_state) Object.assign(obj, entry.old_state);
    } else if (entry.action === 'delete' && entry.old_state) {
      mockFarmMapObjects.push(entry.old_state);
    }
    mockUndoLog = mockUndoLog.filter((e) => e.id !== undoId);
    return Promise.resolve({ ok: true });
  })();

export const redoChange = (farmId: string) =>
  isLive ? apiSend(`/farm-map/redo?farmId=${farmId}`, 'POST') : Promise.resolve({ ok: true });

export const saveDraft = (farmId: string, objects: FarmMapObject[]) =>
  isLive ? apiSend<{ draft: FarmMapObject[] }>(`/farm-map/save-draft?farmId=${farmId}`, 'POST', { objects }) : (() => {
    mockDraft = [...objects];
    return Promise.resolve({ draft: mockDraft });
  })();

export const getDraft = (farmId: string) =>
  isLive ? apiGet<{ draft: FarmMapObject[] }>(`/farm-map/draft?farmId=${farmId}`).then((r) => r.draft) : Promise.resolve(mockDraft);

export const publishDraft = (farmId: string) =>
  isLive ? apiSend(`/farm-map/publish?farmId=${farmId}`, 'POST') : Promise.resolve({ ok: true, published: mockDraft.length });

// ---------- Farm Satellite Map ----------
export interface FarmLocation {
  farmId: string;
  latitude: number | null;
  longitude: number | null;
  locationAccuracy: number | null;
  defaultCenterLat: number | null;
  defaultCenterLng: number | null;
  defaultZoom: number | null;
  address: string | null;
  city: string | null;
  district: string | null;
  country: string | null;
  plusCode: string | null;
}

export const loadGoogleMapsScript = (apiKey: string): Promise<void> => {
  if (typeof window === 'undefined') return Promise.resolve();
  const w = window as any;
  if (w.google?.maps?.Map) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const callbackName = '__initGoogleMaps__';
    w[callbackName] = () => {
      resolve();
      try { delete w[callbackName]; } catch { /* noop */ }
    };
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      try { delete w[callbackName]; } catch { /* noop */ }
      reject(new Error('Failed to load Google Maps'));
    };
    document.head.appendChild(script);
  });
};

export interface FarmBoundary {
  id: string;
  farmId: string;
  name: string;
  geometry: any;
  areaHectares: number;
  areaAcres: number;
  perimeterMeters: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FarmPasture {
  id: string;
  farmId: string;
  name: string;
  geometry: any;
  areaHectares: number;
  areaAcres: number;
  perimeterMeters: number;
  currentAnimals: number;
  capacity: number | null;
  condition: string | null;
  grazingStatus: string | null;
  lastGrazingOn: string | null;
  nextRecommendedGrazing: string | null;
  notes: string | null;
  color: string;
  isLocked: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MapMeasurement {
  id: string;
  farmId: string;
  userId: string;
  type: 'distance' | 'area' | 'perimeter';
  geometry: any;
  valueMeters: number | null;
  valueHectares: number | null;
  notes: string | null;
  createdAt: string;
}

export interface MapProviderSettings {
  provider: string;
  style: string;
  satelliteProvider: string;
  enabledLayers: Record<string, boolean>;
}

export interface MapAiQueryResult {
  text: string;
  highlights?: { type: string; geometry: any; label?: string }[];
}

export const getFarmLocation = (farmId: string) =>
  isLive ? apiGet<FarmLocation>(`/farm-map/location?farmId=${farmId}`) : Promise.resolve({
    farmId,
    latitude: null,
    longitude: null,
    locationAccuracy: null,
    defaultCenterLat: null,
    defaultCenterLng: null,
    defaultZoom: null,
    address: null,
    city: null,
    district: null,
    country: null,
    plusCode: null,
  });

export const updateFarmLocation = (farmId: string, body: Partial<FarmLocation>) =>
  isLive ? apiSend<FarmLocation>(`/farm-map/location?farmId=${farmId}`, 'PATCH', body) : Promise.resolve({ farmId, ...body });

export const listFarmBoundaries = (farmId: string) =>
  isLive ? apiGet<{ data: FarmBoundary[] }>(`/farm-map/boundary?farmId=${farmId}`).then((r) => r.data) : Promise.resolve(mockFarmBoundaries.filter((b) => b.farmId === farmId));

export const createFarmBoundary = (farmId: string, body: { name: string; geometry: any }) =>
  isLive ? apiSend<FarmBoundary>(`/farm-map/boundary?farmId=${farmId}`, 'POST', body) : (() => {
    const b: FarmBoundary = {
      id: 'bnd-' + Date.now(),
      farmId,
      name: body.name,
      geometry: body.geometry,
      areaHectares: 0,
      areaAcres: 0,
      perimeterMeters: 0,
      createdBy: 'me',
      updatedBy: 'me',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockFarmBoundaries.push(b);
    return Promise.resolve(b);
  })();

export const deleteFarmBoundary = (farmId: string, id: string) =>
  isLive ? apiSend(`/farm-map/boundary/${id}?farmId=${farmId}`, 'DELETE') : (() => {
    const idx = mockFarmBoundaries.findIndex((b) => b.id === id && b.farmId === farmId);
    if (idx >= 0) mockFarmBoundaries.splice(idx, 1);
    return Promise.resolve();
  })();

export const listFarmPastures = (farmId: string) =>
  isLive ? apiGet<{ data: FarmPasture[] }>(`/farm-map/pastures?farmId=${farmId}`).then((r) => r.data) : Promise.resolve(mockFarmPastures.filter((p) => p.farmId === farmId));

export const createFarmPasture = (farmId: string, body: Partial<FarmPasture> & { name: string; geometry: any }) =>
  isLive ? apiSend<FarmPasture>(`/farm-map/pastures?farmId=${farmId}`, 'POST', body) : (() => {
    const p: FarmPasture = {
      id: 'past-' + Date.now(),
      farmId,
      name: body.name,
      geometry: body.geometry,
      areaHectares: 0,
      areaAcres: 0,
      perimeterMeters: 0,
      currentAnimals: body.currentAnimals ?? 0,
      capacity: body.capacity ?? null,
      condition: body.condition ?? null,
      grazingStatus: body.grazingStatus ?? null,
      lastGrazingOn: body.lastGrazingOn ?? null,
      nextRecommendedGrazing: body.nextRecommendedGrazing ?? null,
      notes: body.notes ?? null,
      color: body.color || '#3b82f6',
      isLocked: false,
      createdBy: 'me',
      updatedBy: 'me',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockFarmPastures.push(p);
    return Promise.resolve(p);
  })();

export const updateFarmPasture = (farmId: string, id: string, body: Partial<FarmPasture>) =>
  isLive ? apiSend<FarmPasture>(`/farm-map/pastures/${id}?farmId=${farmId}`, 'PATCH', body) : (() => {
    const p = mockFarmPastures.find((x) => x.id === id && x.farmId === farmId);
    if (!p) return Promise.reject(new Error('Not found'));
    Object.assign(p, body, { updatedAt: new Date().toISOString() });
    return Promise.resolve(p);
  })();

export const deleteFarmPasture = (farmId: string, id: string) =>
  isLive ? apiSend(`/farm-map/pastures/${id}?farmId=${farmId}`, 'DELETE') : (() => {
    const idx = mockFarmPastures.findIndex((p) => p.id === id && p.farmId === farmId);
    if (idx >= 0) mockFarmPastures.splice(idx, 1);
    return Promise.resolve();
  })();

export const createMapMeasurement = (farmId: string, body: { type: 'distance' | 'area' | 'perimeter'; geometry: any; notes?: string }) =>
  isLive ? apiSend<MapMeasurement>(`/farm-map/measure?farmId=${farmId}`, 'POST', body) : (() => {
    const m: MapMeasurement = {
      id: 'meas-' + Date.now(),
      farmId,
      userId: 'me',
      type: body.type,
      geometry: body.geometry,
      valueMeters: 0,
      valueHectares: 0,
      notes: body.notes || null,
      createdAt: new Date().toISOString(),
    };
    mockMapMeasurements.push(m);
    return Promise.resolve(m);
  })();

export const listMapMeasurements = (farmId: string) =>
  isLive ? apiGet<{ data: MapMeasurement[] }>(`/farm-map/measurements?farmId=${farmId}`).then((r) => r.data) : Promise.resolve(mockMapMeasurements.filter((m) => m.farmId === farmId));

export const deleteMapMeasurement = (farmId: string, id: string) =>
  isLive ? apiSend(`/farm-map/measurements/${id}?farmId=${farmId}`, 'DELETE') : (() => {
    const idx = mockMapMeasurements.findIndex((m) => m.id === id && m.farmId === farmId);
    if (idx >= 0) mockMapMeasurements.splice(idx, 1);
    return Promise.resolve();
  })();

export const getMapLayers = (farmId: string) =>
  isLive ? apiGet<{ layers: Record<string, boolean> }>(`/farm-map/layers?farmId=${farmId}`) : Promise.resolve({
    layers: { satellite: true, boundary: true, buildings: true, pastures: true, cows: true, water: true, roads: true, fences: true, equipment: true, healthRisk: true, milkProduction: true, weather: true, aiAlerts: true },
  });

export const updateMapLayers = (farmId: string, layers: Record<string, boolean>) =>
  isLive ? apiSend<{ layers: Record<string, boolean> }>(`/farm-map/layers?farmId=${farmId}`, 'PATCH', { layers }) : Promise.resolve({ layers });

export const getMapProviders = (farmId: string) =>
  isLive ? apiGet<MapProviderSettings>(`/farm-map/providers?farmId=${farmId}`) : Promise.resolve({
    provider: 'osm',
    style: 'standard',
    satelliteProvider: 'esri',
    enabledLayers: {},
  });

export const updateMapProviders = (farmId: string, settings: Partial<MapProviderSettings>) =>
  isLive ? apiSend<MapProviderSettings>(`/farm-map/providers?farmId=${farmId}`, 'PATCH', settings) : Promise.resolve({
    provider: settings.provider || 'osm',
    style: settings.style || 'standard',
    satelliteProvider: settings.satelliteProvider || 'esri',
    enabledLayers: settings.enabledLayers || {},
  });

export const mapAiQuery = (farmId: string, query: string) =>
  isLive ? apiSend<MapAiQueryResult>(`/farm-map/ai-query?farmId=${farmId}`, 'POST', { query }) : Promise.resolve({
    text: 'Mock AI: Try asking about farm size, pastures, or water points.',
    highlights: [],
  });

export const mapAiHighlight = (farmId: string, payload: { entityType: string; entityId: string; action?: string }) =>
  isLive ? apiSend(`/farm-map/ai-highlight?farmId=${farmId}`, 'POST', payload) : Promise.resolve({ ok: true });

export function formatHectares(h: number) {
  return `${h.toFixed(2)} ha`;
}

export function formatAcres(a: number) {
  return `${a.toFixed(2)} ac`;
}

export function formatMeters(m: number) {
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${m.toFixed(1)} m`;
}

export function formatMeasurementValue(value: number | null, type: string) {
  if (value === null || value === undefined) return '—';
  if (type === 'distance') return formatMeters(value);
  if (type === 'perimeter') return formatMeters(value);
  return formatHectares(value);
}
