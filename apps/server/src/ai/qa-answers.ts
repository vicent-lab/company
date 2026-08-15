import { query } from '../db/index.js';
import { computeFarmScore } from './farm-score.js';
import { getWeatherObservation, computeThi } from './weather-station.js';

function pct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

interface SourceIndicator {
  label: string;
  count: number;
  link: string;
}

const FARM_PAGES: Record<string, string> = {
  cows: '/app/herd',
  cow: '/app/cow',
  health: '/app/health',
  breeding: '/app/breeding',
  tasks: '/app/tasks',
  feed: '/app/management',
  finance: '/app/customers',
  notifications: '/app/alerts',
  milk: '/app/management',
  inventory: '/app/management',
  medicine: '/app/health',
};

function farmLink(key: string, cowCode?: string): string {
  if (cowCode && key === 'cow') return `/app/cow/${encodeURIComponent(cowCode)}`;
  return FARM_PAGES[key] || '/app';
}

function sourceLine(indicators: SourceIndicator[]): string {
  if (!indicators.length) return '';
  const parts = indicators.map((s) => `${s.label} [${s.count}](${s.link})`);
  return `\n\n---\nSources: ${parts.join(' · ')}`;
}

function farmSource(label: string, count: number, pageKey: string, cowCode?: string): SourceIndicator {
  return { label, count, link: farmLink(pageKey, cowCode) };
}

export { SourceIndicator, sourceLine, farmSource, farmLink, FARM_PAGES };

// ---------- Why is milk production falling? ----------
export async function answerMilkDecline(farmId: string): Promise<string> {
  const [trendRes, headcountRes, feedRes, weatherRes, anomalyRes] = await Promise.all([
    query(`
      WITH daily AS (
        SELECT recorded_on, SUM(morning_liters+afternoon_liters+evening_liters) AS total
        FROM milk_records WHERE farm_id=$1 AND recorded_on >= CURRENT_DATE - INTERVAL '14 days'
        GROUP BY recorded_on
      )
      SELECT
        AVG(total) FILTER (WHERE recorded_on >= CURRENT_DATE - INTERVAL '7 days') AS recent_avg,
        AVG(total) FILTER (WHERE recorded_on < CURRENT_DATE - INTERVAL '7 days') AS prev_avg
      FROM daily
    `, [farmId]),
    query(`SELECT count(*) FILTER (WHERE health='sick') AS sick, count(*) FILTER (WHERE health='under_treatment') AS under_treatment, count(*) FILTER (WHERE is_milking AND status='active') AS milking FROM cows WHERE farm_id=$1 AND status='active'`, [farmId]),
    query(`
      SELECT COALESCE(SUM(fi.quantity),0) AS stock, (SELECT count(*) FILTER (WHERE is_milking AND status='active') FROM cows WHERE farm_id=$1) AS milking, (SELECT count(*) FILTER (WHERE is_pregnant AND status='active') FROM cows WHERE farm_id=$1) AS pregnant
      FROM feed_inventory fi JOIN feed_types ft ON ft.id=fi.feed_type_id WHERE ft.farm_id=$1
    `, [farmId]),
    getWeatherObservation(farmId).then((o) => ({ rows: [{ temp: o.temperatureC, humidity: o.humidityPct }] })),
    query(`
      WITH cow_stats AS (
        SELECT cow_id, AVG(morning_liters+afternoon_liters+evening_liters) AS avg_yield, STDDEV(morning_liters+afternoon_liters+evening_liters) AS std_yield, COUNT(*) AS record_count
        FROM milk_records WHERE farm_id=$1 AND recorded_on >= CURRENT_DATE - INTERVAL '30 days' GROUP BY cow_id
      ), recent AS (
        SELECT cow_id, AVG(morning_liters+afternoon_liters+evening_liters) AS recent_avg
        FROM milk_records WHERE farm_id=$1 AND recorded_on >= CURRENT_DATE - INTERVAL '7 days' GROUP BY cow_id
      )
      SELECT c.cow_code, cs.avg_yield, r.recent_avg,
        CASE WHEN cs.std_yield > 0 THEN (r.recent_avg - cs.avg_yield) / cs.std_yield ELSE 0 END AS z_score
      FROM cow_stats cs JOIN recent r ON r.cow_id=cs.cow_id JOIN cows c ON c.id=cs.cow_id
      WHERE cs.record_count >= 5
      ORDER BY (CASE WHEN cs.std_yield > 0 THEN (r.recent_avg - cs.avg_yield) / cs.std_yield ELSE 0 END) ASC
      LIMIT 5
    `, [farmId]),
  ]);

  const recentAvg = Number(trendRes.rows[0]?.recent_avg || 0);
  const prevAvg = Number(trendRes.rows[0]?.prev_avg || 0);
  const dropPct = prevAvg > 0 ? ((prevAvg - recentAvg) / prevAvg) * 100 : 0;

  if (prevAvg <= 0) {
    return `There isn't enough milk-record history yet (need at least 14 days) to measure a production trend. Keep recording daily yields and ask me again in a week.`;
  }
  if (dropPct <= 2) {
    return `Milk production looks stable — this week's daily average is ${recentAvg.toFixed(0)} L vs ${prevAvg.toFixed(0)} L the previous week (${pct(-dropPct)}). No meaningful decline detected.`;
  }

  const sick = Number(headcountRes.rows[0]?.sick || 0);
  const underTreatment = Number(headcountRes.rows[0]?.under_treatment || 0);
  const milking = Number(headcountRes.rows[0]?.milking || 0);
  const stock = Number(feedRes.rows[0]?.stock || 0);
  const dailyNeed = Number(feedRes.rows[0]?.milking || 0) * 25 + Number(feedRes.rows[0]?.pregnant || 0) * 5;
  const daysOfFeed = dailyNeed > 0 ? stock / dailyNeed : 999;
  const temp = Number(weatherRes.rows[0]?.temp || 25);
  const humidity = Number(weatherRes.rows[0]?.humidity || 60);
  const thi = computeThi(temp, humidity);
  const decliningCows = anomalyRes.rows.filter((r: any) => Number(r.z_score) < -1.0);

  let answer = `Based on your current farm records, milk production is down ${pct(-dropPct)}: ${recentAvg.toFixed(0)} L/day this week vs ${prevAvg.toFixed(0)} L/day the week before (${milking} milking cows).\n\nLikely contributing factors, ranked by evidence:\n`;
  const causes: string[] = [];
  if (sick > 0 || underTreatment > 0) causes.push(`• Herd health: ${sick} sick and ${underTreatment} under treatment right now — sick cows produce less and can drag down the average.`);
  if (decliningCows.length > 0) causes.push(`• Individual cows declining sharply: ${decliningCows.map((c: any) => `${c.cow_code} (${Number(c.recent_avg).toFixed(1)} L/day vs its own ${Number(c.avg_yield).toFixed(1)} L/day average)`).join(', ')}.`);
  if (thi > 72) causes.push(`• Heat stress: THI is ${thi.toFixed(1)} (above the 72 threshold) — this alone can cut yield 10-20%.`);
  if (daysOfFeed < 10) causes.push(`• Feed supply is tight — only ${daysOfFeed.toFixed(1)} days of stock remaining, which can force ration cuts.`);
  if (causes.length === 0) causes.push(`• No single obvious cause found in health, feed stock, weather, or individual-cow data — check for milking routine changes, water access, or recent feed formula changes.`);
  answer += causes.join('\n');
  answer += `\n\nRecommended next steps: physically check the cows listed above first, then review ration consistency and confirm milking routine hasn't changed.`;

  const indicators: SourceIndicator[] = [
    farmSource('🐄 Animal records', milking + sick + underTreatment, 'cows'),
    farmSource('🥛 Milk records', Math.max(milking, 1), 'milk'),
  ];
  if (sick > 0 || underTreatment > 0) indicators.push(farmSource('❤️ Health alerts', sick + underTreatment, 'health'));
  if (stock > 0 && daysOfFeed < 14) indicators.push(farmSource('🌾 Feed inventory', 1, 'feed'));
  if (thi > 72) indicators.push(farmSource('🌤️ Weather data', 1, 'cows'));

  answer += sourceLine(indicators);
  return answer;
}

// ---------- Which cow needs attention today? ----------
export async function answerCowsNeedingAttention(farmId: string): Promise<string> {
  const r = await query(`
    SELECT c.id, c.cow_code, c.name, c.health,
      (SELECT count(*)::int FROM vaccinations v WHERE v.cow_id=c.id AND v.administered_on IS NULL AND v.due_on <= CURRENT_DATE) AS overdue_vacc,
      (SELECT max(temperature_c) FROM milk_records mr WHERE mr.cow_id=c.id AND mr.recorded_on=CURRENT_DATE) AS temp_today,
      (SELECT lameness_score FROM health_records hr WHERE hr.cow_id=c.id ORDER BY recorded_on DESC LIMIT 1) AS lameness_score,
      (SELECT body_condition_score FROM health_records hr WHERE hr.cow_id=c.id ORDER BY recorded_on DESC LIMIT 1) AS bcs
    FROM cows c WHERE c.farm_id=$1 AND c.status='active'
  `, [farmId]);

  const flagged = r.rows.map((c: any) => {
    const reasons: string[] = [];
    if (c.health === 'sick') reasons.push('currently sick');
    else if (c.health === 'under_treatment') reasons.push('under active treatment');
    if (Number(c.overdue_vacc) > 0) reasons.push(`${c.overdue_vacc} overdue vaccination(s)`);
    if (c.temp_today != null && Number(c.temp_today) > 39.0) reasons.push(`fever today (${Number(c.temp_today).toFixed(1)}°C — possible mastitis)`);
    if (c.lameness_score != null && Number(c.lameness_score) >= 3) reasons.push(`severe lameness (score ${c.lameness_score}/5)`);
    if (c.bcs != null && Number(c.bcs) <= 2) reasons.push(`low body condition (score ${c.bcs}/9)`);
    return { cow_code: c.cow_code, name: c.name, reasons };
  }).filter((c: any) => c.reasons.length > 0)
    .sort((a: any, b: any) => b.reasons.length - a.reasons.length)
    .slice(0, 5);

  if (flagged.length === 0) {
    return `No cows are flagged for attention right now — health, vaccinations, temperature, lameness, and body condition all look normal today. Good day to focus on routine checks and preventive care.`;
  }

  let answer = `${flagged.length} cow(s) need attention today, ranked by urgency:\n\n`;
  flagged.forEach((c: any, i: number) => {
    answer += `${i + 1}. ${c.name || c.cow_code} (${c.cow_code}): ${c.reasons.join('; ')}\n`;
  });
  answer += `\nStart with #1 — it has the most concurrent issues.`;

  const indicators: SourceIndicator[] = [
    farmSource('🐄 Animal records', flagged.length, 'cows'),
  ];
  const healthFlagged = flagged.filter((c: any) => c.reasons.some((r: string) => /sick|treatment|lameness|body condition/.test(r)));
  if (healthFlagged.length) indicators.push(farmSource('❤️ Health alerts', healthFlagged.length, 'health'));
  const vaccFlagged = flagged.filter((c: any) => c.reasons.some((r: string) => r.includes('overdue vaccination')));
  if (vaccFlagged.length) indicators.push(farmSource('💉 Vaccination records', vaccFlagged.length, 'health'));

  answer += sourceLine(indicators);
  return answer;
}

// ---------- What should I do tomorrow? ----------
export async function answerTomorrowPlan(farmId: string): Promise<string> {
  const [vaccRes, taskRes, calvingRes, ongoingRes] = await Promise.all([
    query(`SELECT c.cow_code, v.vaccine_name FROM vaccinations v JOIN cows c ON c.id=v.cow_id WHERE c.farm_id=$1 AND v.administered_on IS NULL AND v.due_on = CURRENT_DATE + 1`, [farmId]),
    query(`SELECT title FROM tasks WHERE farm_id=$1 AND status NOT IN ('completed','cancelled') AND due_date = CURRENT_DATE + 1`, [farmId]),
    query(`SELECT c.cow_code, br.expected_calving_on FROM breeding_records br JOIN cows c ON c.id=br.cow_id WHERE c.farm_id=$1 AND br.expected_calving_on BETWEEN CURRENT_DATE + 1 AND CURRENT_DATE + 3 ORDER BY br.expected_calving_on ASC`, [farmId]),
    query(`SELECT count(*) FILTER (WHERE health='sick') AS sick, count(*) FILTER (WHERE health='under_treatment') AS under_treatment FROM cows WHERE farm_id=$1 AND status='active'`, [farmId]),
  ]);

  const sick = Number(ongoingRes.rows[0]?.sick || 0);
  const underTreatment = Number(ongoingRes.rows[0]?.under_treatment || 0);

  const lines: string[] = [];
  if (calvingRes.rows.length) {
    calvingRes.rows.forEach((c: any) => {
      const daysOut = Math.round((new Date(c.expected_calving_on).getTime() - Date.now()) / 86400000);
      lines.push(`• ${daysOut <= 1 ? 'Calving expected TOMORROW' : `Calving expected in ${daysOut} days`} for ${c.cow_code} — prepare the calving pen, colostrum, and vet standby.`);
    });
  }
  if (vaccRes.rows.length) lines.push(`• Vaccinations due: ${vaccRes.rows.map((v: any) => `${v.cow_code} (${v.vaccine_name})`).join(', ')}.`);
  if (taskRes.rows.length) lines.push(`• Scheduled task(s): ${taskRes.rows.map((t: any) => t.title).join(', ')}.`);
  if (sick > 0 || underTreatment > 0) lines.push(`• Ongoing care: ${sick} sick and ${underTreatment} under-treatment cow(s) still need daily monitoring.`);

  if (lines.length === 0) {
    return `Nothing time-critical is scheduled for tomorrow — no vaccinations due, no tasks, and no calvings expected in the next 3 days. Good time for routine herd checks, equipment maintenance, or catching up on record-keeping.`;
  }

  const indicators: SourceIndicator[] = [];
  if (calvingRes.rows.length) indicators.push(farmSource('🤰 Pregnancy records', calvingRes.rows.length, 'breeding'));
  if (vaccRes.rows.length) indicators.push(farmSource('💉 Vaccination records', vaccRes.rows.length, 'health'));
  if (taskRes.rows.length) indicators.push(farmSource('📋 Tasks', taskRes.rows.length, 'tasks'));
  if (sick > 0 || underTreatment > 0) indicators.push(farmSource('❤️ Health alerts', sick + underTreatment, 'health'));
  return `Tomorrow's plan:\n\n${lines.join('\n')}${sourceLine(indicators)}`;
}

// ---------- Which cows are costing me money? ----------
export async function answerCowProfitability(farmId: string): Promise<string> {
  const [priceRes, feedCostRes, milkRes, treatmentRes, namesRes] = await Promise.all([
    query(`
      SELECT
        (SELECT COALESCE(SUM(amount),0) FROM income WHERE farm_id=$1 AND category ILIKE '%milk%' AND received_on >= CURRENT_DATE - INTERVAL '90 days') AS income,
        (SELECT COALESCE(SUM(morning_liters+afternoon_liters+evening_liters),0) FROM milk_records WHERE farm_id=$1 AND recorded_on >= CURRENT_DATE - INTERVAL '90 days') AS liters
    `, [farmId]),
    query(`
      WITH type_cost AS (SELECT feed_type_id, AVG(unit_cost) AS avg_cost FROM feed_inventory GROUP BY feed_type_id)
      SELECT fc.cow_id, SUM(fc.quantity * COALESCE(tc.avg_cost, 0)) AS feed_cost
      FROM feed_consumption fc LEFT JOIN type_cost tc ON tc.feed_type_id = fc.feed_type_id
      WHERE fc.consumed_on >= CURRENT_DATE - INTERVAL '90 days' AND fc.cow_id IN (SELECT id FROM cows WHERE farm_id=$1)
      GROUP BY fc.cow_id
    `, [farmId]),
    query(`SELECT cow_id, SUM(morning_liters+afternoon_liters+evening_liters) AS liters FROM milk_records WHERE farm_id=$1 AND recorded_on >= CURRENT_DATE - INTERVAL '90 days' GROUP BY cow_id`, [farmId]),
    query(`SELECT cow_id, count(*)::int AS n FROM treatments WHERE cow_id IN (SELECT id FROM cows WHERE farm_id=$1) AND diagnosed_on >= CURRENT_DATE - INTERVAL '90 days' GROUP BY cow_id`, [farmId]),
    query(`SELECT id, cow_code, name FROM cows WHERE farm_id=$1 AND status='active' AND is_milking`, [farmId]),
  ]);

  const income = Number(priceRes.rows[0]?.income || 0);
  const liters = Number(priceRes.rows[0]?.liters || 0);
  const pricePerLiter = liters > 0 ? income / liters : null;

  const feedCostByCow = new Map(feedCostRes.rows.map((r: any) => [r.cow_id, Number(r.feed_cost || 0)]));
  const litersByCow = new Map(milkRes.rows.map((r: any) => [r.cow_id, Number(r.liters || 0)]));
  const treatmentsByCow = new Map(treatmentRes.rows.map((r: any) => [r.cow_id, Number(r.n || 0)]));

  if (pricePerLiter == null) {
    const worstFeed = namesRes.rows
      .map((c: any) => ({ ...c, feedCost: feedCostByCow.get(c.id) || 0, treatments: treatmentsByCow.get(c.id) || 0 }))
      .sort((a: any, b: any) => b.feedCost - a.feedCost)
      .slice(0, 5);
    let answer = `No "milk sales" income has been recorded in the last 90 days, so I can't compute per-cow revenue precisely. Based on feed cost alone, the highest feed-cost cows over 90 days are:\n\n`;
    worstFeed.forEach((c: any, i: number) => { answer += `${i + 1}. ${c.name || c.cow_code} (${c.cow_code}): ${c.feedCost.toFixed(2)} feed cost, ${c.treatments} treatment(s)\n`; });
    answer += `\nRecord milk sales income by cow-level pricing to get a full profitability ranking.`;
    const indicators: SourceIndicator[] = [
      farmSource('🐄 Animal records', worstFeed.length, 'cows'),
      farmSource('🌾 Feed consumption', worstFeed.length, 'feed'),
    ];
    if (worstFeed.some((c: any) => c.treatments > 0)) indicators.push(farmSource('❤️ Treatment records', worstFeed.filter((c: any) => c.treatments > 0).length, 'health'));
    answer += sourceLine(indicators);
    return answer;
  }

  const rows = namesRes.rows.map((c: any) => {
    const cowLiters = litersByCow.get(c.id) || 0;
    const feedCost = feedCostByCow.get(c.id) || 0;
    const revenue = cowLiters * pricePerLiter!;
    const treatments = treatmentsByCow.get(c.id) || 0;
    return { cow_code: c.cow_code, name: c.name, revenue, feedCost, margin: revenue - feedCost, treatments };
  }).sort((a: any, b: any) => a.margin - b.margin).slice(0, 5);

  let answer = `Based on your current farm records, over the last 90 days (realized milk price: ${pricePerLiter.toFixed(2)}/L from recorded milk sales), the cows with the lowest feed-cost margin are:\n\n`;
  rows.forEach((c: any, i: number) => {
    answer += `${i + 1}. ${c.name || c.cow_code} (${c.cow_code}): revenue ${c.revenue.toFixed(0)}, feed cost ${c.feedCost.toFixed(0)}, margin ${c.margin.toFixed(0)}${c.margin < 0 ? ' (losing money)' : ''}${c.treatments > 0 ? `, ${c.treatments} treatment(s) in this period` : ''}\n`;
  });
  answer += `\nNote: this margin covers feed cost only — it doesn't include vet, labor, or overhead costs, which aren't tracked per-cow in the system. Cows with both a low margin and treatments are the strongest culling/review candidates.`;

  const indicators: SourceIndicator[] = [
    farmSource('🐄 Animal records', rows.length, 'cows'),
    farmSource('🥛 Milk records', rows.length, 'milk'),
    farmSource('🌾 Feed consumption', rows.filter((r: any) => r.feedCost > 0).length, 'feed'),
  ];
  if (rows.some((r: any) => r.treatments > 0)) indicators.push(farmSource('❤️ Treatment records', rows.filter((r: any) => r.treatments > 0).length, 'health'));
  answer += sourceLine(indicators);
  return answer;
}

// ---------- How can I increase profit? ----------
export async function answerIncreaseProfit(farmId: string): Promise<string> {
  const [farmScore, expenseRes] = await Promise.all([
    computeFarmScore(farmId),
    query(`SELECT category, SUM(amount) AS total FROM expenses WHERE farm_id=$1 AND incurred_on >= date_trunc('month', current_date) GROUP BY category ORDER BY total DESC LIMIT 3`, [farmId]),
  ]);

  const finance = farmScore.categories.finance;
  const totalExpenses = expenseRes.rows.reduce((s: number, r: any) => s + Number(r.total), 0);

  let answer = `Based on your current farm records, finance score: ${finance.score}/100.\n\n`;
  if (finance.deductions.length === 0) {
    answer += `No specific financial red flags detected this month — margin and expense growth are both within healthy range.\n\n`;
  } else {
    answer += `What's holding profit back right now:\n`;
    finance.deductions.forEach((d) => { answer += `• ${d.reason} — ${d.recommendation}\n`; });
    answer += `\n`;
  }
  if (expenseRes.rows.length) {
    answer += `Top expense categories this month:\n`;
    expenseRes.rows.forEach((r: any) => {
      const share = totalExpenses > 0 ? (Number(r.total) / totalExpenses) * 100 : 0;
      answer += `• ${r.category}: ${Number(r.total).toFixed(0)} (${share.toFixed(0)}% of this month's expenses)\n`;
    });
  }

  const indicators: SourceIndicator[] = [
    farmSource('💰 Finance records', 1, 'finance'),
  ];
  if (expenseRes.rows.length) indicators.push(farmSource('📊 Expense categories', expenseRes.rows.length, 'finance'));
  answer += sourceLine(indicators);
  return answer;
}

// ---------- Which cows are likely pregnant? ----------
export async function answerPregnancyCandidates(farmId: string): Promise<string> {
  const [confirmedRes, candidateRes, rateRes] = await Promise.all([
    query(`SELECT cow_code, name FROM cows WHERE farm_id=$1 AND is_pregnant AND status='active'`, [farmId]),
    query(`
      SELECT c.cow_code, c.name, br.breeding_date, br.method, (CURRENT_DATE - br.breeding_date) AS days_since
      FROM breeding_records br JOIN cows c ON c.id=br.cow_id
      WHERE c.farm_id=$1 AND br.result IS NULL
        AND br.breeding_date BETWEEN CURRENT_DATE - INTERVAL '90 days' AND CURRENT_DATE - INTERVAL '30 days'
        AND NOT EXISTS (SELECT 1 FROM breeding_records br2 WHERE br2.cow_id=br.cow_id AND br2.breeding_date > br.breeding_date)
      ORDER BY br.breeding_date ASC
    `, [farmId]),
    query(`SELECT count(*) FILTER (WHERE lower(result)='pregnant') AS pregnant, count(*) AS total FROM breeding_records br JOIN cows c ON c.id=br.cow_id WHERE c.farm_id=$1 AND br.breeding_date >= CURRENT_DATE - INTERVAL '180 days'`, [farmId]),
  ]);

  const pregnant = Number(rateRes.rows[0]?.pregnant || 0);
  const total = Number(rateRes.rows[0]?.total || 0);
  const rate = total > 0 ? (pregnant / total) * 100 : null;

  let answer = '';
  if (confirmedRes.rows.length) {
    answer += `Based on your current farm records, ${confirmedRes.rows.length} cow(s) confirmed pregnant: ${confirmedRes.rows.map((c: any) => c.name || c.cow_code).join(', ')}.\n\n`;
  }
  if (candidateRes.rows.length) {
    answer += `${candidateRes.rows.length} cow(s) are likely pregnant but awaiting confirmation (bred 30-90 days ago with no result recorded):\n`;
    candidateRes.rows.forEach((c: any) => { answer += `• ${c.name || c.cow_code}: bred ${c.days_since} days ago via ${c.method}\n`; });
    answer += `\nSchedule pregnancy checks (ultrasound) for this list to confirm.\n`;
  } else if (!confirmedRes.rows.length) {
    answer += `No confirmed or likely-pregnant cows found right now.\n`;
  }
  if (rate != null) answer += `\nFarm-wide conception rate over the last 180 days: ${rate.toFixed(0)}% (${pregnant} of ${total} services).`;

  const indicators: SourceIndicator[] = [];
  if (confirmedRes.rows.length) indicators.push(farmSource('🤰 Pregnancy records', confirmedRes.rows.length, 'breeding'));
  if (candidateRes.rows.length) indicators.push(farmSource('📋 Breeding records', candidateRes.rows.length, 'breeding'));
  if (total > 0) indicators.push(farmSource('📊 Conception rate', 1, 'breeding'));
  answer += sourceLine(indicators);
  return answer;
}

// ---------- Generate a financial report ----------
export async function answerFinancialReport(farmId: string): Promise<string> {
  const [summaryRes, expenseByCategory, incomeByCategory, trendRes] = await Promise.all([
    query(`
      SELECT
        (SELECT COALESCE(SUM(amount),0) FROM income WHERE farm_id=$1 AND received_on >= date_trunc('month', current_date)) AS income,
        (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE farm_id=$1 AND incurred_on >= date_trunc('month', current_date)) AS expenses
    `, [farmId]),
    query(`SELECT category, SUM(amount) AS total FROM expenses WHERE farm_id=$1 AND incurred_on >= date_trunc('month', current_date) GROUP BY category ORDER BY total DESC`, [farmId]),
    query(`SELECT category, SUM(amount) AS total FROM income WHERE farm_id=$1 AND received_on >= date_trunc('month', current_date) GROUP BY category ORDER BY total DESC`, [farmId]),
    query(`
      WITH monthly_income AS (SELECT date_trunc('month', received_on) AS m, SUM(amount) AS inc FROM income WHERE farm_id=$1 AND received_on >= CURRENT_DATE - INTERVAL '6 months' GROUP BY 1),
           monthly_expense AS (SELECT date_trunc('month', incurred_on) AS m, SUM(amount) AS exp FROM expenses WHERE farm_id=$1 AND incurred_on >= CURRENT_DATE - INTERVAL '6 months' GROUP BY 1)
      SELECT COALESCE(mi.m, me.m) AS m, COALESCE(mi.inc,0) AS inc, COALESCE(me.exp,0) AS exp
      FROM monthly_income mi FULL OUTER JOIN monthly_expense me ON mi.m = me.m
      ORDER BY 1
    `, [farmId]),
  ]);

  const income = Number(summaryRes.rows[0]?.income || 0);
  const expenses = Number(summaryRes.rows[0]?.expenses || 0);
  const profit = income - expenses;
  const margin = income > 0 ? (profit / income) * 100 : 0;
  const totalExpenses = expenseByCategory.rows.reduce((s: number, r: any) => s + Number(r.total), 0);

  let answer = `Based on your current farm records, financial report — this month\n\n`;
  answer += `Income: ${income.toFixed(0)} | Expenses: ${expenses.toFixed(0)} | Net profit: ${profit.toFixed(0)} | Margin: ${margin.toFixed(1)}%\n\n`;
  if (incomeByCategory.rows.length) {
    answer += `Income by category:\n`;
    incomeByCategory.rows.forEach((r: any) => { answer += `• ${r.category}: ${Number(r.total).toFixed(0)}\n`; });
    answer += `\n`;
  }
  if (expenseByCategory.rows.length) {
    answer += `Expenses by category:\n`;
    expenseByCategory.rows.forEach((r: any) => {
      const share = totalExpenses > 0 ? (Number(r.total) / totalExpenses) * 100 : 0;
      answer += `• ${r.category}: ${Number(r.total).toFixed(0)} (${share.toFixed(0)}%)\n`;
    });
    answer += `\n`;
  }
  if (trendRes.rows.length) {
    answer += `Last ${trendRes.rows.length} month(s): `;
    answer += trendRes.rows.map((r: any) => `${new Date(r.m).toLocaleDateString(undefined, { month: 'short' })} (net ${(Number(r.inc) - Number(r.exp)).toFixed(0)})`).join(', ');
  }

  const indicators: SourceIndicator[] = [
    farmSource('💰 Income records', incomeByCategory.rows.length || 1, 'finance'),
    farmSource('📊 Expense records', expenseByCategory.rows.length || 1, 'finance'),
  ];
  if (trendRes.rows.length) indicators.push(farmSource('📈 Trend data', trendRes.rows.length, 'finance'));
  answer += sourceLine(indicators);
  return answer;
}

// ---------- Explain why feed costs increased ----------
export async function answerFeedCostIncrease(farmId: string): Promise<string> {
  const [expenseRes, qtyRes, milkingRes, unitCostRes] = await Promise.all([
    query(`
      SELECT
        (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE farm_id=$1 AND category ILIKE '%feed%' AND incurred_on >= date_trunc('month', current_date)) AS this_month,
        (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE farm_id=$1 AND category ILIKE '%feed%' AND incurred_on >= date_trunc('month', current_date - interval '1 month') AND incurred_on < date_trunc('month', current_date)) AS last_month
    `, [farmId]),
    query(`
      SELECT
        (SELECT COALESCE(SUM(quantity),0) FROM feed_consumption WHERE consumed_on >= date_trunc('month', current_date) AND cow_id IN (SELECT id FROM cows WHERE farm_id=$1)) AS this_month,
        (SELECT COALESCE(SUM(quantity),0) FROM feed_consumption WHERE consumed_on >= date_trunc('month', current_date - interval '1 month') AND consumed_on < date_trunc('month', current_date) AND cow_id IN (SELECT id FROM cows WHERE farm_id=$1)) AS last_month
    `, [farmId]),
    query(`SELECT count(*)::int AS n FROM cows WHERE farm_id=$1 AND is_milking AND status='active'`, [farmId]),
    query(`SELECT ft.name, AVG(fi.unit_cost) AS avg_cost FROM feed_types ft JOIN feed_inventory fi ON fi.feed_type_id = ft.id WHERE ft.farm_id=$1 GROUP BY ft.name ORDER BY avg_cost DESC LIMIT 5`, [farmId]),
  ]);

  const thisMonthCost = Number(expenseRes.rows[0]?.this_month || 0);
  const lastMonthCost = Number(expenseRes.rows[0]?.last_month || 0);
  const thisMonthQty = Number(qtyRes.rows[0]?.this_month || 0);
  const lastMonthQty = Number(qtyRes.rows[0]?.last_month || 0);
  const milking = Number(milkingRes.rows[0]?.n || 0);

  if (lastMonthCost <= 0) {
    return `There's no feed expense recorded for last month to compare against, so I can't measure a month-over-month change. This month's feed spend so far is ${thisMonthCost.toFixed(0)}, across a milking herd of ${milking} cows.`;
  }

  const costChangePct = ((thisMonthCost - lastMonthCost) / lastMonthCost) * 100;
  const qtyChangePct = lastMonthQty > 0 ? ((thisMonthQty - lastMonthQty) / lastMonthQty) * 100 : 0;

  let answer = `Based on your current farm records, feed expenses ${costChangePct >= 0 ? 'rose' : 'fell'} ${Math.abs(costChangePct).toFixed(0)}%: ${lastMonthCost.toFixed(0)} last month → ${thisMonthCost.toFixed(0)} this month.\n\n`;
  answer += `Likely drivers:\n`;
  if (lastMonthQty > 0 && Math.abs(qtyChangePct) > 5) {
    answer += `• Consumption volume ${qtyChangePct >= 0 ? 'increased' : 'decreased'} ${Math.abs(qtyChangePct).toFixed(0)}% (${lastMonthQty.toFixed(0)} → ${thisMonthQty.toFixed(0)} units), which ${qtyChangePct >= 0 ? 'accounts for at least part of' : "doesn't explain"} the cost increase.\n`;
  } else {
    answer += `• Consumption volume is roughly flat month over month, so the change is more likely driven by per-unit pricing than by how much feed is being used.\n`;
  }
  answer += `• Current milking herd: ${milking} cows — more milking cows directly means more ration consumed.\n`;
  if (unitCostRes.rows.length) {
    answer += `\nCurrent cost per unit by feed type (highest first):\n`;
    unitCostRes.rows.forEach((r: any) => { answer += `• ${r.name}: ${Number(r.avg_cost).toFixed(2)}/unit\n`; });
  }

  const indicators: SourceIndicator[] = [
    farmSource('💰 Expense records', 1, 'finance'),
    farmSource('🌾 Feed consumption', 1, 'feed'),
    farmSource('🐄 Animal records', milking, 'cows'),
  ];
  if (unitCostRes.rows.length) indicators.push(farmSource('📊 Feed pricing', unitCostRes.rows.length, 'feed'));
  answer += sourceLine(indicators);
  return answer;
}

// ---------- Pedigree / family questions ----------
export async function answerPedigree(farmId: string, cowId: string, relation?: string): Promise<string> {
  const cowRes = await query(`SELECT id, cow_code, name, breed, gender, date_of_birth, status, health, mother_id, father_id FROM cows WHERE id=$1`, [cowId]);
  if (!cowRes.rows.length) return 'Cow not found.';
  const cow = cowRes.rows[0];

  const parts: string[] = [];
  parts.push(`${cow.name || cow.cow_code} (${cow.breed}, ${cow.gender})`);

  if (relation === 'mother' || relation === 'dam') {
    if (!cow.mother_id) return parts[0] + ' has no mother recorded.';
    const m = await query(`SELECT cow_code, name, breed FROM cows WHERE id=$1`, [cow.mother_id]);
    return parts[0] + ` mother is ${m.rows[0]?.name || m.rows[0]?.cow_code || 'unknown'} (${m.rows[0]?.breed || 'unknown breed'}).`;
  }
  if (relation === 'father' || relation === 'sire') {
    if (!cow.father_id) return parts[0] + ' has no father recorded.';
    const f = await query(`SELECT cow_code, name, breed FROM cows WHERE id=$1`, [cow.father_id]);
    return parts[0] + ` father is ${f.rows[0]?.name || f.rows[0]?.cow_code || 'unknown'} (${f.rows[0]?.breed || 'unknown breed'}).`;
  }

  const [mother, father, offspringCount, breedingsCount] = await Promise.all([
    cow.mother_id ? query(`SELECT cow_code, name, breed FROM cows WHERE id=$1`, [cow.mother_id]) : Promise.resolve({ rows: [] }),
    cow.father_id ? query(`SELECT cow_code, name, breed FROM cows WHERE id=$1`, [cow.father_id]) : Promise.resolve({ rows: [] }),
    query(`SELECT count(*)::int AS n FROM offspring WHERE mother_id=$1 OR father_id=$1`, [cowId]),
    query(`SELECT count(*)::int AS n FROM breeding_records WHERE cow_id=$1`, [cowId]),
  ]);

  parts.push(`Mother: ${mother.rows[0] ? `${mother.rows[0].name || mother.rows[0].cow_code} (${mother.rows[0].breed})` : 'Unknown'}`);
  parts.push(`Father: ${father.rows[0] ? `${father.rows[0].name || father.rows[0].cow_code} (${father.rows[0].breed})` : 'Unknown'}`);
  parts.push(`Offspring: ${offspringCount.rows[0]?.n || 0}`);
  parts.push(`Breeding records: ${breedingsCount.rows[0]?.n || 0}`);

  const answer = parts.join('. ') + '.';
  const indicators: SourceIndicator[] = [
    farmSource('🐄 Animal records', 1, 'cow', cow.cow_code),
    farmSource('📋 Breeding records', breedingsCount.rows[0]?.n || 0, 'breeding'),
  ];
  if (offspringCount.rows[0]?.n > 0) indicators.push(farmSource('👶 Offspring records', offspringCount.rows[0]?.n || 0, 'breeding'));
  return `${answer}${sourceLine(indicators)}`;
}

export async function answerOffspringCount(farmId: string, cowId: string): Promise<string> {
  const [cowRes, countRes] = await Promise.all([
    query(`SELECT cow_code, name FROM cows WHERE id=$1`, [cowId]),
    query(`SELECT count(*)::int AS n FROM offspring WHERE mother_id=$1 OR father_id=$1`, [cowId]),
  ]);
  const cow = cowRes.rows[0];
  if (!cow) return 'Cow not found.';
  const n = countRes.rows[0]?.n || 0;
  const answer = `${cow.name || cow.cow_code} has ${n} offspring on record.`;
  const indicators: SourceIndicator[] = [
    farmSource('🐄 Animal records', 1, 'cow', cow.cow_code),
    farmSource('👶 Offspring records', n, 'breeding'),
  ];
  return `${answer}${sourceLine(indicators)}`;
}

export async function answerExpectedCalving(farmId: string, cowId: string): Promise<string> {
  const [cowRes, pregRes] = await Promise.all([
    query(`SELECT cow_code, name FROM cows WHERE id=$1`, [cowId]),
    query(`SELECT expected_calving_date, status FROM pregnancies WHERE cow_id=$1 AND status NOT IN ('failed','completed') ORDER BY expected_calving_date ASC LIMIT 1`, [cowId]),
  ]);
  const cow = cowRes.rows[0];
  if (!cow) return 'Cow not found.';
  if (!pregRes.rows.length) return `${cow.name || cow.cow_code} has no active pregnancy on record.`;
  const p = pregRes.rows[0];
  const days = Math.max(0, Math.round((new Date(p.expected_calving_date).getTime() - Date.now()) / 86400000));
  const answer = `${cow.name || cow.cow_code} is expected to calve in ${days} day(s) (${p.expected_calving_date}). Status: ${p.status}.`;
  const indicators: SourceIndicator[] = [
    farmSource('🐄 Animal records', 1, 'cow', cow.cow_code),
    farmSource('🤰 Pregnancy records', 1, 'breeding'),
  ];
  return `${answer}${sourceLine(indicators)}`;
}

export async function answerBreedingCount(farmId: string, cowId: string): Promise<string> {
  const [cowRes, countRes] = await Promise.all([
    query(`SELECT cow_code, name FROM cows WHERE id=$1`, [cowId]),
    query(`SELECT count(*)::int AS n FROM breeding_records WHERE cow_id=$1`, [cowId]),
  ]);
  const cow = cowRes.rows[0];
  if (!cow) return 'Cow not found.';
  const n = countRes.rows[0]?.n || 0;
  const answer = `${cow.name || cow.cow_code} has ${n} breeding record(s).`;
  const indicators: SourceIndicator[] = [
    farmSource('🐄 Animal records', 1, 'cow', cow.cow_code),
    farmSource('📋 Breeding records', n, 'breeding'),
  ];
  return `${answer}${sourceLine(indicators)}`;
}

export async function answerNonConceivers(farmId: string): Promise<string> {
  const { rows } = await query(`
    SELECT c.cow_code, c.name, COUNT(br.id) AS failed_services
    FROM cows c
    JOIN breeding_records br ON br.cow_id = c.id
    WHERE c.farm_id=$1 AND lower(coalesce(br.result, '')) <> 'pregnant'
      AND br.breeding_date >= CURRENT_DATE - INTERVAL '180 days'
    GROUP BY c.id, c.cow_code, c.name
    HAVING COUNT(br.id) >= 2
    ORDER BY failed_services DESC
  `, [farmId]);
  if (!rows.length) return 'No cows found with 2+ non-conception services in the last 180 days.';
  const answer = `Based on your current farm records, cows with multiple non-conception services:\n${rows.map((r: any) => `• ${r.name || r.cow_code}: ${r.failed_services} failed services`).join('\n')}`;
  const indicators: SourceIndicator[] = [
    farmSource('🐄 Animal records', rows.length, 'cows'),
    farmSource('📋 Breeding records', rows.length, 'breeding'),
  ];
  return `${answer}${sourceLine(indicators)}`;
}

export async function answerTopSires(farmId: string): Promise<string> {
  const { rows } = await query(`
    SELECT s.cow_code, s.name, COUNT(p.id) AS pregnancies, COUNT(p.id)::float / NULLIF(COUNT(br.id), 0) AS rate
    FROM breeding_records br
    JOIN cows s ON s.id = br.sire_id
    LEFT JOIN pregnancies p ON p.breeding_id = br.id
    WHERE br.cow_id IN (SELECT id FROM cows WHERE farm_id=$1)
      AND br.sire_id IS NOT NULL
      AND br.breeding_date >= CURRENT_DATE - INTERVAL '365 days'
    GROUP BY s.id, s.cow_code, s.name
    ORDER BY pregnancies DESC
    LIMIT 5
  `, [farmId]);
  if (!rows.length) return 'No sire conception data available yet.';
  const answer = `Based on your current farm records, top bulls by conception count (last 12 months):\n${rows.map((r: any) => `• ${r.name || r.cow_code}: ${r.pregnancies} pregnancies (rate ${r.rate ? (r.rate * 100).toFixed(0) : 'N/A'}%)`).join('\n')}`;
  const indicators: SourceIndicator[] = [
    farmSource('🐄 Animal records', rows.length, 'cows'),
    farmSource('🤰 Pregnancy records', rows.length, 'breeding'),
  ];
  return `${answer}${sourceLine(indicators)}`;
}

export async function answerCowsDueThisMonth(farmId: string): Promise<string> {
  const { rows } = await query(`
    SELECT c.cow_code, c.name, p.expected_calving_date
    FROM pregnancies p
    JOIN cows c ON c.id = p.cow_id
    WHERE p.farm_id=$1 AND date_trunc('month', p.expected_calving_date) = date_trunc('month', CURRENT_DATE)
      AND p.status NOT IN ('failed', 'completed')
  `, [farmId]);
  if (!rows.length) return 'No cows are due to calve this month.';
  const answer = `Based on your current farm records, cows due to calve this month:\n${rows.map((r: any) => `• ${r.name || r.cow_code}: ${r.expected_calving_date}`).join('\n')}`;
  const indicators: SourceIndicator[] = [
    farmSource('🐄 Animal records', rows.length, 'cows'),
    farmSource('🤰 Pregnancy records', rows.length, 'breeding'),
  ];
  return `${answer}${sourceLine(indicators)}`;
}

export async function answerReproductiveHistory(farmId: string, cowId: string): Promise<string> {
  const cowRes = await query(`SELECT cow_code, name, breed, gender FROM cows WHERE id=$1`, [cowId]);
  if (!cowRes.rows.length) return 'Cow not found.';
  const cow = cowRes.rows[0];
  const [breedings, pregnancies, calvings] = await Promise.all([
    query(`SELECT method, breeding_date, result FROM breeding_records WHERE cow_id=$1 ORDER BY breeding_date DESC LIMIT 10`, [cowId]),
    query(`SELECT status, confirmation_date, expected_calving_date FROM pregnancies WHERE cow_id=$1 ORDER BY confirmation_date DESC LIMIT 5`, [cowId]),
    query(`SELECT calving_date, difficulty_score, assistance_required FROM calving_records WHERE cow_id=$1 ORDER BY calving_date DESC LIMIT 5`, [cowId]),
  ]);
  const parts: string[] = [`Based on your current farm records, reproductive history for ${cow.name || cow.cow_code} (${cow.breed}, ${cow.gender}):`];
  if (breedings.rows.length) {
    parts.push(`Breedings (${breedings.rows.length}):`);
    breedings.rows.forEach((b: any) => parts.push(`• ${b.breeding_date} — ${b.method} — ${b.result || 'no result'}`));
  } else {
    parts.push('No breeding records.');
  }
  if (pregnancies.rows.length) {
    parts.push(`Pregnancies (${pregnancies.rows.length}):`);
    pregnancies.rows.forEach((p: any) => parts.push(`• Confirmed ${p.confirmation_date} — expected ${p.expected_calving_date} — ${p.status}`));
  }
  if (calvings.rows.length) {
    parts.push(`Calvings (${calvings.rows.length}):`);
    calvings.rows.forEach((c: any) => parts.push(`• ${c.calving_date} — difficulty ${c.difficulty_score}/5 — assisted: ${c.assistance_required ? 'yes' : 'no'}`));
  }
  const answer = parts.join('\n');
  const indicators: SourceIndicator[] = [
    farmSource('🐄 Animal records', 1, 'cow', cow.cow_code),
  ];
  if (breedings.rows.length) indicators.push(farmSource('📋 Breeding records', breedings.rows.length, 'breeding'));
  if (pregnancies.rows.length) indicators.push(farmSource('🤰 Pregnancy records', pregnancies.rows.length, 'breeding'));
  if (calvings.rows.length) indicators.push(farmSource('👶 Calving records', calvings.rows.length, 'breeding'));
  return `${answer}${sourceLine(indicators)}`;
}

export async function answerAreRelated(farmId: string, cowIdA: string, cowIdB: string): Promise<string> {
  const [aRes, bRes] = await Promise.all([
    query(`SELECT cow_code, name, mother_id, father_id FROM cows WHERE id=$1`, [cowIdA]),
    query(`SELECT cow_code, name, mother_id, father_id FROM cows WHERE id=$1`, [cowIdB]),
  ]);
  const a = aRes.rows[0];
  const b = bRes.rows[0];
  if (!a || !b) return 'One or both cows not found.';

  const ancestorA = new Set<string>();
  const ancestorB = new Set<string>();

  async function collect(cid: string, set: Set<string>) {
    if (!cid || set.has(cid)) return;
    set.add(cid);
    const r = await query(`SELECT mother_id, father_id FROM cows WHERE id=$1`, [cid]);
    const row = r.rows[0];
    if (row) {
      await collect(row.mother_id, set);
      await collect(row.father_id, set);
    }
  }

  await collect(a.mother_id, ancestorA);
  await collect(a.father_id, ancestorA);
  await collect(b.mother_id, ancestorB);
  await collect(b.father_id, ancestorB);

  const shared = [...ancestorA].filter((id) => ancestorB.has(id));
  if (shared.length) {
    const names = await query(`SELECT cow_code, name FROM cows WHERE id = ANY($1::uuid[])`, [shared]);
    const nameList = names.rows.map((r: any) => r.name || r.cow_code).join(', ');
    const answer = `Yes, ${a.name || a.cow_code} and ${b.name || b.cow_code} are related. Shared ancestors: ${nameList}.`;
    const indicators: SourceIndicator[] = [
      farmSource('🐄 Animal records', 2, 'cows'),
      farmSource('📋 Breeding records', shared.length, 'breeding'),
    ];
    return `${answer}${sourceLine(indicators)}`;
  }
  const answer = `No, ${a.name || a.cow_code} and ${b.name || b.cow_code} do not appear to share ancestors within the available pedigree depth.`;
  const indicators: SourceIndicator[] = [
    farmSource('🐄 Animal records', 2, 'cows'),
    farmSource('📋 Breeding records', 0, 'breeding'),
  ];
  return `${answer}${sourceLine(indicators)}`;
}

// ---------- Farm overview ----------
export async function answerFarmOverview(farmId: string): Promise<string> {
  const [overview, health, breeding, milk] = await Promise.all([
    query(`SELECT count(*) FILTER (WHERE status='active') AS total, count(*) FILTER (WHERE status='active' AND is_milking) AS milking, count(*) FILTER (WHERE status='active' AND is_pregnant) AS pregnant FROM cows WHERE farm_id=$1`, [farmId]),
    query(`SELECT count(*)::int AS sick, count(*) FILTER (WHERE health='under_treatment') AS treatment FROM cows WHERE farm_id=$1 AND status='active' AND health <> 'healthy'`, [farmId]),
    query(`SELECT count(*)::int AS calving_soon FROM breeding_records br JOIN cows c ON c.id=br.cow_id WHERE c.farm_id=$1 AND br.expected_calving_on BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days'`, [farmId]),
    query(`SELECT COALESCE(SUM(morning_liters+afternoon_liters+evening_liters),0) AS today_liters FROM milk_records WHERE farm_id=$1 AND recorded_on=CURRENT_DATE`, [farmId]),
  ]);

  const total = Number(overview.rows[0]?.total || 0);
  const milking = Number(overview.rows[0]?.milking || 0);
  const pregnant = Number(overview.rows[0]?.pregnant || 0);
  const sick = Number(health.rows[0]?.sick || 0);
  const treatment = Number(health.rows[0]?.treatment || 0);
  const calvingSoon = Number(breeding.rows[0]?.calving_soon || 0);
  const todayLiters = Number(milk.rows[0]?.today_liters || 0);

  const parts: string[] = [];
  parts.push(`Based on your current farm records, your herd: ${total} total cows (${milking} milking, ${pregnant} pregnant).`);
  parts.push(`Today's milk: ${todayLiters.toFixed(1)} L.`);
  if (sick > 0 || treatment > 0) parts.push(`Health: ${sick} sick, ${treatment} under treatment — needs attention.`);
  if (calvingSoon > 0) parts.push(`Breeding: ${calvingSoon} cow(s) expected to calve within 14 days.`);
  if (sick === 0 && treatment === 0 && calvingSoon === 0) parts.push('No urgent health or breeding issues right now.');

  const indicators: SourceIndicator[] = [
    farmSource('🐄 Animal records', total, 'cows'),
    farmSource('🥛 Milk records', 1, 'milk'),
  ];
  if (sick > 0 || treatment > 0) indicators.push(farmSource('❤️ Health alerts', sick + treatment, 'health'));
  if (calvingSoon > 0) indicators.push(farmSource('🤰 Pregnancy records', calvingSoon, 'breeding'));

  parts.push(sourceLine(indicators));
  return parts.join(' ');
}

// ---------- Today's priorities ----------
interface PriorityItem {
  level: 'CRITICAL' | 'IMPORTANT' | 'MONITOR';
  title: string;
  resource: string;
  whatHappened: string;
  whyItMatters: string;
  recommendedAction: string;
  dateTime: string;
  link: string;
  source: 'recorded' | 'ai_observation' | 'vet_referral';
}

export async function answerTodayPriorities(farmId: string): Promise<string> {
  const [
    sickCows,
    underTreatmentCows,
    overdueVaccinations,
    upcomingVaccinations,
    calvingSoon,
    calvingThisWeek,
    overdueTasks,
    upcomingTasks,
    criticalNotifications,
    unreadNotifications,
    lowFeedInventory,
    lowMedicineInventory,
    expiringMedicine,
    lowEquipmentInventory,
    milkAnomalies,
    recentHealthFlags,
    pregnancyChecksDue,
    monthlyFinance,
  ] = await Promise.all([
    query(`SELECT c.cow_code, c.name, c.id, hr.recorded_on, hr.health_status, hr.ai_detected_disease, hr.body_condition_score, hr.lameness_score, hr.notes FROM cows c JOIN health_records hr ON hr.cow_id=c.id WHERE c.farm_id=$1 AND c.status='active' AND c.health='sick' ORDER BY hr.recorded_on DESC LIMIT 20`, [farmId]),
    query(`SELECT c.cow_code, c.name, c.id, hr.recorded_on, hr.health_status, hr.ai_detected_disease, hr.body_condition_score, hr.lameness_score, hr.notes FROM cows c JOIN health_records hr ON hr.cow_id=c.id WHERE c.farm_id=$1 AND c.status='active' AND c.health='under_treatment' ORDER BY hr.recorded_on DESC LIMIT 20`, [farmId]),
    query(`SELECT v.id, v.cow_id, v.vaccine_name, v.due_on, c.cow_code, c.name FROM vaccinations v JOIN cows c ON c.id=v.cow_id WHERE c.farm_id=$1 AND v.administered_on IS NULL AND v.due_on < CURRENT_DATE ORDER BY v.due_on ASC LIMIT 20`, [farmId]),
    query(`SELECT v.id, v.cow_id, v.vaccine_name, v.due_on, c.cow_code, c.name FROM vaccinations v JOIN cows c ON c.id=v.cow_id WHERE c.farm_id=$1 AND v.administered_on IS NULL AND v.due_on BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' ORDER BY v.due_on ASC LIMIT 20`, [farmId]),
    query(`SELECT br.id, br.cow_id, br.expected_calving_on, br.breeding_date, c.cow_code, c.name FROM breeding_records br JOIN cows c ON c.id=br.cow_id WHERE c.farm_id=$1 AND br.expected_calving_on BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days' ORDER BY br.expected_calving_on ASC LIMIT 10`, [farmId]),
    query(`SELECT br.id, br.cow_id, br.expected_calving_on, br.breeding_date, c.cow_code, c.name FROM breeding_records br JOIN cows c ON c.id=br.cow_id WHERE c.farm_id=$1 AND br.expected_calving_on BETWEEN CURRENT_DATE + INTERVAL '4 days' AND CURRENT_DATE + INTERVAL '7 days' ORDER BY br.expected_calving_on ASC LIMIT 10`, [farmId]),
    query(`SELECT t.id, t.title, t.priority, t.due_date, t.category, u.name AS assigned_to FROM tasks t LEFT JOIN employees e ON e.id=t.assigned_to LEFT JOIN users u ON u.id=e.user_id WHERE t.farm_id=$1 AND t.due_date < CURRENT_DATE AND t.status NOT IN ('completed','cancelled') ORDER BY t.priority DESC, t.due_date ASC LIMIT 20`, [farmId]),
    query(`SELECT t.id, t.title, t.priority, t.due_date, t.category, u.name AS assigned_to FROM tasks t LEFT JOIN employees e ON e.id=t.assigned_to LEFT JOIN users u ON u.id=e.user_id WHERE t.farm_id=$1 AND t.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' AND t.status NOT IN ('completed','cancelled') ORDER BY t.priority DESC, t.due_date ASC LIMIT 20`, [farmId]),
    query(`SELECT id, type, title, body, created_at FROM notifications WHERE farm_id=$1 AND type IN ('critical','emergency','alert') ORDER BY created_at DESC LIMIT 10`, [farmId]),
    query(`SELECT id, type, title, body, created_at FROM notifications WHERE farm_id=$1 AND read_at IS NULL ORDER BY created_at DESC LIMIT 20`, [farmId]),
    query(`SELECT ft.name, fi.quantity, ft.reorder_level FROM feed_inventory fi JOIN feed_types ft ON ft.id=fi.feed_type_id WHERE ft.farm_id=$1 AND fi.quantity <= ft.reorder_level ORDER BY fi.quantity ASC LIMIT 10`, [farmId]),
    query(`SELECT name, quantity_on_hand, reorder_level, expiry_date FROM medicine_inventory WHERE farm_id=$1 AND quantity_on_hand <= reorder_level ORDER BY quantity_on_hand ASC LIMIT 20`, [farmId]),
    query(`SELECT name, quantity_on_hand, reorder_level, expiry_date FROM medicine_inventory WHERE farm_id=$1 AND expiry_date <= CURRENT_DATE + INTERVAL '30 days' ORDER BY expiry_date ASC LIMIT 20`, [farmId]),
    query(`SELECT item_name, category, quantity, reorder_level, expiry_date FROM inventory WHERE farm_id=$1 AND quantity <= reorder_level ORDER BY quantity ASC LIMIT 20`, [farmId]),
    query(`SELECT c.cow_code, c.name, c.id, AVG(mr.morning_liters+mr.afternoon_liters+mr.evening_liters) AS avg_30d, AVG(mr.morning_liters+mr.afternoon_liters+mr.evening_liters) FILTER (WHERE mr.recorded_on >= CURRENT_DATE - INTERVAL '7 days') AS avg_7d FROM cows c JOIN milk_records mr ON mr.cow_id=c.id WHERE c.farm_id=$1 AND c.status='active' AND c.is_milking GROUP BY c.id HAVING AVG(mr.morning_liters+mr.afternoon_liters+mr.evening_liters) FILTER (WHERE mr.recorded_on >= CURRENT_DATE - INTERVAL '7 days') < AVG(mr.morning_liters+mr.afternoon_liters+mr.evening_liters) - 2 ORDER BY avg_7d ASC LIMIT 10`, [farmId]),
    query(`SELECT c.cow_code, c.name, c.id, hr.recorded_on, hr.body_condition_score, hr.lameness_score, hr.ai_detected_disease FROM cows c JOIN health_records hr ON hr.cow_id=c.id WHERE c.farm_id=$1 AND c.status='active' AND (hr.body_condition_score <= 2 OR hr.lameness_score >= 3 OR hr.ai_detected_disease IS NOT NULL) AND hr.recorded_on >= CURRENT_DATE - INTERVAL '14 days' ORDER BY hr.recorded_on DESC LIMIT 20`, [farmId]),
    query(`SELECT c.cow_code, c.name, c.id, br.expected_calving_on, br.breeding_date FROM breeding_records br JOIN cows c ON c.id=br.cow_id WHERE c.farm_id=$1 AND br.expected_calving_on < CURRENT_DATE AND br.result IS NULL ORDER BY br.expected_calving_on ASC LIMIT 10`, [farmId]),
    query(`SELECT (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE farm_id=$1 AND incurred_on >= date_trunc('month', current_date)) AS expenses, (SELECT COALESCE(SUM(amount),0) FROM income WHERE farm_id=$1 AND received_on >= date_trunc('month', current_date)) AS income, (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (SELECT category, SUM(amount) AS total FROM expenses WHERE farm_id=$1 AND incurred_on >= date_trunc('month', current_date) GROUP BY category ORDER BY total DESC LIMIT 3) t) AS top_expenses`, [farmId]),
  ]);

  const items: PriorityItem[] = [];

  const cowLink = (cowCode: string, cowId: string) => `/app/cow/${encodeURIComponent(cowCode)}`;

  const vetNote = (source: PriorityItem['source']) => source === 'vet_referral' ? ' This is not a diagnosis. A veterinarian should examine the animal.' : '';

  // CRITICAL items
  sickCows.rows.forEach((r: any) => {
    items.push({
      level: 'CRITICAL',
      title: `Sick cow: ${r.cow_code || r.name || 'Unknown'}`,
      resource: r.cow_code || r.name || 'Unknown',
      whatHappened: `Cow recorded as sick on ${r.recorded_on}.${r.ai_detected_disease ? ` AI observation: ${r.ai_detected_disease} detected in health records (confidence recorded in system).` : ''}`,
      whyItMatters: 'A sick cow requires prompt attention to prevent deterioration, spread of illness, and milk production loss.',
      recommendedAction: 'Review the health record, isolate if indicated, and contact a veterinarian for examination.',
      dateTime: r.recorded_on,
      link: cowLink(r.cow_code, r.id),
      source: r.ai_detected_disease ? 'ai_observation' : 'recorded',
    });
  });

  underTreatmentCows.rows.forEach((r: any) => {
    items.push({
      level: 'CRITICAL',
      title: `Under treatment: ${r.cow_code || r.name || 'Unknown'}`,
      resource: r.cow_code || r.name || 'Unknown',
      whatHappened: `Cow is currently under treatment. Health status recorded as under_treatment on ${r.recorded_on}.`,
      whyItMatters: 'Treatment protocols require monitoring to ensure recovery and prevent complications.',
      recommendedAction: 'Check treatment progress, monitor symptoms, and follow up with the veterinarian if no improvement.',
      dateTime: r.recorded_on,
      link: cowLink(r.cow_code, r.id),
      source: 'recorded',
    });
  });

  overdueVaccinations.rows.forEach((r: any) => {
    items.push({
      level: 'CRITICAL',
      title: `Overdue vaccination: ${r.vaccine_name}`,
      resource: r.cow_code || r.name || 'Unknown',
      whatHappened: `Vaccination was due on ${r.due_on} and has not been recorded as administered.`,
      whyItMatters: 'Missing vaccinations leave the animal unprotected against preventable diseases.',
      recommendedAction: 'Schedule the vaccination as soon as possible and record the administration.',
      dateTime: r.due_on,
      link: '/app/health',
      source: 'recorded',
    });
  });

  overdueTasks.rows.forEach((r: any) => {
    const isHigh = r.priority === 'high';
    items.push({
      level: isHigh ? 'CRITICAL' : 'IMPORTANT',
      title: `Overdue task: ${r.title}`,
      resource: r.assigned_to || 'Unassigned',
      whatHappened: `Task was due on ${r.due_date} and is still ${r.status}.`,
      whyItMatters: isHigh ? 'High-priority overdue tasks may impact animal welfare, milk quality, or farm operations.' : 'Overdue tasks accumulate and can delay important farm activities.',
      recommendedAction: isHigh ? 'Address this task immediately or reassign if necessary.' : 'Review and reschedule the task.',
      dateTime: r.due_date,
      link: '/app/tasks',
      source: 'recorded',
    });
  });

  criticalNotifications.rows.forEach((r: any) => {
    items.push({
      level: 'CRITICAL',
      title: `Critical alert: ${r.title}`,
      resource: 'Farm system',
      whatHappened: r.body || r.title,
      whyItMatters: 'Critical notifications indicate conditions requiring immediate attention.',
      recommendedAction: 'Review the alert details and take appropriate action.',
      dateTime: r.created_at,
      link: '/app/alerts',
      source: 'recorded',
    });
  });

  lowFeedInventory.rows.forEach((r: any) => {
    const days = r.quantity > 0 ? 'below reorder level' : 'empty';
    items.push({
      level: 'CRITICAL',
      title: `Feed shortage: ${r.name}`,
      resource: r.name,
      whatHappened: `Feed inventory is ${days} (${Number(r.quantity).toFixed(1)} units, reorder at ${Number(r.reorder_level).toFixed(1)}).`,
      whyItMatters: 'Feed shortages directly affect milk production, animal health, and breeding success.',
      recommendedAction: 'Order replenishment immediately and review feeding schedules.',
      dateTime: new Date().toISOString(),
      link: '/app/management',
      source: 'recorded',
    });
  });

  lowMedicineInventory.rows.forEach((r: any) => {
    const days = r.expiry_date ? ` expires ${r.expiry_date}` : '';
    items.push({
      level: 'CRITICAL',
      title: `Medicine shortage: ${r.name}`,
      resource: r.name,
      whatHappened: `Medicine stock is at or below reorder level (${Number(r.quantity_on_hand).toFixed(1)} units, reorder at ${Number(r.reorder_level).toFixed(1)}).${days ? ` Next expiry: ${r.expiry_date}.` : ''}`,
      whyItMatters: 'Medicine shortages can prevent timely treatment of sick animals and routine health procedures.',
      recommendedAction: 'Reorder medicines and check storage requirements.',
      dateTime: r.expiry_date || new Date().toISOString(),
      link: '/app/health',
      source: 'recorded',
    });
  });

  // IMPORTANT items
  upcomingVaccinations.rows.forEach((r: any) => {
    const days = Math.max(0, Math.ceil((new Date(r.due_on).getTime() - new Date().setHours(0,0,0,0)) / 86400000));
    items.push({
      level: 'IMPORTANT',
      title: `Upcoming vaccination: ${r.vaccine_name}`,
      resource: r.cow_code || r.name || 'Unknown',
      whatHappened: `Vaccination is due on ${r.due_on} (in ${days} day(s)).`,
      whyItMatters: 'Proactive vaccination prevents disease outbreaks and maintains herd immunity.',
      recommendedAction: 'Schedule the vaccination within the next few days.',
      dateTime: r.due_on,
      link: '/app/health',
      source: 'recorded',
    });
  });

  calvingThisWeek.rows.forEach((r: any) => {
    const days = Math.max(0, Math.ceil((new Date(r.expected_calving_on).getTime() - new Date().setHours(0,0,0,0)) / 86400000));
    items.push({
      level: 'IMPORTANT',
      title: `Calving expected: ${r.cow_code || r.name || 'Unknown'}`,
      resource: r.cow_code || r.name || 'Unknown',
      whatHappened: `Expected calving on ${r.expected_calving_on} (in ${days} day(s)). Breeding recorded on ${r.breeding_date}.`,
      whyItMatters: 'Proper preparation reduces calving complications and improves calf survival.',
      recommendedAction: 'Prepare the calving pen, ensure colostrum is available, and monitor the cow.',
      dateTime: r.expected_calving_on,
      link: '/app/breeding',
      source: 'recorded',
    });
  });

  upcomingTasks.rows.forEach((r: any) => {
    const days = Math.max(0, Math.ceil((new Date(r.due_date).getTime() - new Date().setHours(0,0,0,0)) / 86400000));
    items.push({
      level: 'IMPORTANT',
      title: `Upcoming task: ${r.title}`,
      resource: r.assigned_to || 'Unassigned',
      whatHappened: `Task is due on ${r.due_date} (in ${days} day(s)). Priority: ${r.priority}.`,
      whyItMatters: 'Timely task completion maintains farm operations and animal care schedules.',
      recommendedAction: 'Ensure the assigned person is aware and prepared.',
      dateTime: r.due_date,
      link: '/app/tasks',
      source: 'recorded',
    });
  });

  recentHealthFlags.rows.forEach((r: any) => {
    const flags: string[] = [];
    if (r.body_condition_score !== null && r.body_condition_score <= 2) flags.push(`body condition score ${r.body_condition_score}/9 (low)`);
    if (r.lameness_score !== null && r.lameness_score >= 3) flags.push(`lameness score ${r.lameness_score}/5 (elevated)`);
    if (r.ai_detected_disease) flags.push(`AI observation: ${r.ai_detected_disease}`);

    if (flags.length === 0) return;

    items.push({
      level: 'IMPORTANT',
      title: `Health flag: ${r.cow_code || r.name || 'Unknown'}`,
      resource: r.cow_code || r.name || 'Unknown',
      whatHappened: `Health record from ${r.recorded_on} shows: ${flags.join('; ')}.`,
      whyItMatters: 'These indicators may suggest welfare or health concerns that need monitoring.',
      recommendedAction: 'Monitor the cow closely. Consult a veterinarian for professional assessment.',
      dateTime: r.recorded_on,
      link: cowLink(r.cow_code, r.id),
      source: r.ai_detected_disease ? 'ai_observation' : 'recorded',
    });
  });

  // MONITOR items
  calvingSoon.rows.forEach((r: any) => {
    const days = Math.max(0, Math.ceil((new Date(r.expected_calving_on).getTime() - new Date().setHours(0,0,0,0)) / 86400000));
    items.push({
      level: 'MONITOR',
      title: `Calving soon: ${r.cow_code || r.name || 'Unknown'}`,
      resource: r.cow_code || r.name || 'Unknown',
      whatHappened: `Expected calving on ${r.expected_calving_on} (in ${days} day(s)).`,
      whyItMatters: 'Calving events require preparation but are not immediately urgent if more than 3 days away.',
      recommendedAction: 'Ensure calving area is ready and monitor for signs of labor.',
      dateTime: r.expected_calving_on,
      link: '/app/breeding',
      source: 'recorded',
    });
  });

  pregnancyChecksDue.rows.forEach((r: any) => {
    const daysOverdue = Math.max(0, Math.ceil((new Date().setHours(0,0,0,0) - new Date(r.expected_calving_on).getTime()) / 86400000));
    items.push({
      level: daysOverdue > 0 ? 'CRITICAL' : 'IMPORTANT',
      title: `Pregnancy check needed: ${r.cow_code || r.name || 'Unknown'}`,
      resource: r.cow_code || r.name || 'Unknown',
      whatHappened: `Expected calving date was ${r.expected_calving_on}.${daysOverdue > 0 ? ` This date has passed by ${daysOverdue} day(s) without a recorded calving.` : ' No calving record found yet.'}`,
      whyItMatters: 'Missed calving dates may indicate pregnancy loss, breeding failure, or data recording gaps.',
      recommendedAction: daysOverdue > 0 ? 'Contact a veterinarian immediately for examination.' : 'Monitor closely and prepare for calving.',
      dateTime: r.expected_calving_on,
      link: '/app/breeding',
      source: 'recorded',
    });
  });

  expiringMedicine.rows.forEach((r: any) => {
    if (!r.expiry_date) return;
    const days = Math.max(0, Math.ceil((new Date(r.expiry_date).getTime() - new Date().setHours(0,0,0,0)) / 86400000));
    items.push({
      level: days <= 7 ? 'IMPORTANT' : 'MONITOR',
      title: `Medicine expiring: ${r.name}`,
      resource: r.name,
      whatHappened: `Medicine expires on ${r.expiry_date} (in ${days} day(s)). Current stock: ${Number(r.quantity_on_hand).toFixed(1)}.`,
      whyItMatters: 'Expired medicines may be ineffective or unsafe to use.',
      recommendedAction: 'Use before expiry or dispose of according to regulations. Reorder if needed.',
      dateTime: r.expiry_date,
      link: '/app/health',
      source: 'recorded',
    });
  });

  const monthlyExpenses = Number(monthlyFinance.rows[0]?.expenses || 0);
  const monthlyIncome = Number(monthlyFinance.rows[0]?.income || 0);
  const topExpenses = monthlyFinance.rows[0]?.top_expenses || [];
  if (monthlyExpenses > 0 && monthlyIncome > 0 && monthlyExpenses > monthlyIncome * 2) {
    items.push({
      level: 'IMPORTANT',
      title: 'Expenses exceed income significantly',
      resource: 'Farm finances',
      whatHappened: `This month's expenses (${monthlyExpenses.toFixed(0)}) are more than double income (${monthlyIncome.toFixed(0)}).`,
      whyItMatters: 'A significant expense-to-income gap may threaten farm sustainability.',
      recommendedAction: 'Review top expense categories and identify cost-saving opportunities.',
      dateTime: new Date().toISOString(),
      link: '/app/customers',
      source: 'recorded',
    });
  } else if (topExpenses.length > 0) {
    const top = topExpenses[0];
    items.push({
      level: 'MONITOR',
      title: `Top expense category: ${top.category}`,
      resource: 'Farm finances',
      whatHappened: `Highest expense this month: ${top.category} at ${Number(top.total).toFixed(0)}.`,
      whyItMatters: 'Tracking top expenses helps identify cost drivers.',
      recommendedAction: 'Review this category for potential savings.',
      dateTime: new Date().toISOString(),
      link: '/app/customers',
      source: 'recorded',
    });
  }

  lowEquipmentInventory.rows.forEach((r: any) => {
    items.push({
      level: 'MONITOR',
      title: `Low inventory: ${r.item_name}`,
      resource: r.item_name,
      whatHappened: `Item stock is at or below reorder level (${Number(r.quantity).toFixed(1)} units, reorder at ${Number(r.reorder_level).toFixed(1)}).`,
      whyItMatters: 'Low equipment or supply inventory may delay routine maintenance or procedures.',
      recommendedAction: 'Plan replenishment to avoid operational delays.',
      dateTime: r.expiry_date || new Date().toISOString(),
      link: '/app/management',
      source: 'recorded',
    });
  });

  milkAnomalies.rows.forEach((r: any) => {
    const drop = Number(r.avg_30d || 0) - Number(r.avg_7d || 0);
    items.push({
      level: 'IMPORTANT',
      title: `Milk decline: ${r.cow_code || r.name || 'Unknown'}`,
      resource: r.cow_code || r.name || 'Unknown',
      whatHappened: `30-day average: ${Number(r.avg_30d || 0).toFixed(1)} L/day. Recent 7-day average: ${Number(r.avg_7d || 0).toFixed(1)} L/day. Drop: ${drop.toFixed(1)} L/day.`,
      whyItMatters: 'Sudden milk decline can indicate health issues, feed problems, or environmental stress.',
      recommendedAction: 'Review cow health, feed intake, and recent records. Consult a veterinarian if decline continues.',
      dateTime: new Date().toISOString(),
      link: cowLink(r.cow_code, r.id),
      source: 'ai_observation',
    });
  });

  unreadNotifications.rows.forEach((r: any) => {
    if (items.some(i => i.title === `Critical alert: ${r.title}`)) return;
    items.push({
      level: 'MONITOR',
      title: `Notification: ${r.title}`,
      resource: 'Farm system',
      whatHappened: r.body || r.title,
      whyItMatters: 'Unread notifications may contain information requiring attention.',
      recommendedAction: 'Review the notification and take action if needed.',
      dateTime: r.created_at,
      link: '/app/alerts',
      source: 'recorded',
    });
  });

  // Sort by level priority, then by date
  const levelOrder = { CRITICAL: 0, IMPORTANT: 1, MONITOR: 2 };
  items.sort((a, b) => {
    if (levelOrder[a.level] !== levelOrder[b.level]) return levelOrder[a.level] - levelOrder[b.level];
    return new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime();
  });

  if (items.length === 0) {
    return 'Nothing urgent on the horizon today. Good time for routine herd checks, equipment maintenance, and record-keeping.';
  }

  const parts: string[] = [];
  let currentLevel: string | null = null;

  for (const item of items) {
    if (item.level !== currentLevel) {
      currentLevel = item.level;
      parts.push(`\n${currentLevel}\n`);
    }

    const sourceLabel = item.source === 'ai_observation' ? '\n*Source: AI-generated observation based on farm data trends.*' :
                       item.source === 'vet_referral' ? '\n*Source: Professional veterinary advice required.*' : '';

    parts.push(`${item.title}\n`);
    parts.push(`${item.whatHappened}\n`);
    parts.push(`\nWhy it matters:\n${item.whyItMatters}${vetNote(item.source)}\n`);
    parts.push(`\nRecommended action:\n${item.recommendedAction}${sourceLabel}\n`);
    parts.push(`\nRecorded: ${item.dateTime}\n`);
    parts.push(`[Open ${item.resource}](${item.link})\n`);
    parts.push('---\n');
  }

  const sourceCounts: Record<string, { label: string; count: number; link: string }> = {};
  for (const item of items) {
    const key = item.link;
    if (!sourceCounts[key]) {
      const label = item.link.includes('/health') ? '❤️ Health' :
                    item.link.includes('/breeding') ? '🤰 Breeding' :
                    item.link.includes('/tasks') ? '📋 Tasks' :
                    item.link.includes('/management') ? '🌾 Feed / Inventory' :
                    item.link.includes('/customers') ? '💰 Finance' :
                    item.link.includes('/alerts') ? '🔔 Notifications' :
                    item.link.includes('/cow') ? '🐄 Animals' : '📋 Records';
      sourceCounts[key] = { label, count: 0, link: item.link };
    }
    sourceCounts[key].count += 1;
  }
  const uniqueSources = Object.values(sourceCounts).sort((a, b) => b.count - a.count);
  parts.push(`\n\n---\nSources: ${uniqueSources.map((s) => `${s.label} [${s.count}](${s.link})`).join(' · ')}\n`);

  return parts.join('\n');
}

// ---------- Herd count ----------
export async function answerHerdCount(farmId: string): Promise<string> {
  const r = await query(`SELECT count(*) FILTER (WHERE status='active') AS total, count(*) FILTER (WHERE status='active' AND is_milking) AS milking, count(*) FILTER (WHERE status='active' AND is_pregnant) AS pregnant, count(*) FILTER (WHERE status='active' AND health <> 'healthy') AS sick FROM cows WHERE farm_id=$1`, [farmId]);
  const row = r.rows[0];
  const answer = `Based on your current farm records, herd summary: ${Number(row.total)} total cows (${Number(row.milking)} milking, ${Number(row.pregnant)} pregnant, ${Number(row.sick)} with health issues).`;
  const indicators: SourceIndicator[] = [
    farmSource('🐄 Animal records', Number(row.total), 'cows'),
  ];
  return `${answer}${sourceLine(indicators)}`;
}

// ---------- Calves born this month ----------
export async function answerCalvesBornThisMonth(farmId: string): Promise<string> {
  const r = await query(`SELECT cr.calving_date, c.cow_code, c.name AS mother_name, cr.difficulty_score, cr.assistance_required FROM calving_records cr JOIN cows c ON c.id=cr.cow_id WHERE cr.farm_id=$1 AND date_trunc('month', cr.calving_date) = date_trunc('month', CURRENT_DATE) ORDER BY cr.calving_date DESC`, [farmId]);
  if (!r.rows.length) return 'No calves were recorded as born this month.';
  const lines = r.rows.map((row: any) => `• ${row.calving_date}: ${row.mother_name || row.cow_code} — difficulty ${row.difficulty_score}/5${row.assistance_required ? ' (assistance required)' : ''}`);
  const answer = `Based on your current farm records, calves born this month (${r.rows.length}):\n\n${lines.join('\n')}`;
  const indicators: SourceIndicator[] = [
    farmSource('🐄 Animal records', r.rows.length, 'cows'),
    farmSource('🤰 Calving records', r.rows.length, 'breeding'),
  ];
  return `${answer}${sourceLine(indicators)}`;
}

// ---------- Today's milk production ----------
export async function answerTodayMilk(farmId: string): Promise<string> {
  const [today, topCow, avg] = await Promise.all([
    query(`SELECT COALESCE(SUM(morning_liters+afternoon_liters+evening_liters),0) AS liters, count(*)::int AS records FROM milk_records WHERE farm_id=$1 AND recorded_on=CURRENT_DATE`, [farmId]),
    query(`SELECT c.cow_code, c.name, (mr.morning_liters+mr.afternoon_liters+mr.evening_liters) AS total FROM milk_records mr JOIN cows c ON c.id=mr.cow_id WHERE mr.farm_id=$1 AND mr.recorded_on=CURRENT_DATE ORDER BY total DESC LIMIT 1`, [farmId]),
    query(`SELECT COALESCE(AVG(morning_liters+afternoon_liters+evening_liters),0) AS avg FROM milk_records WHERE farm_id=$1 AND recorded_on >= CURRENT_DATE - INTERVAL '7 days'`, [farmId]),
  ]);

  const liters = Number(today.rows[0]?.liters || 0);
  const records = Number(today.rows[0]?.records || 0);
  const avgLiters = Number(avg.rows[0]?.avg || 0);
  const top = topCow.rows[0];

  let answer = `Based on your current farm records, today's milk production: ${liters.toFixed(1)} L from ${records} milking session(s).`;
  if (avgLiters > 0) answer += ` Farm average over the last 7 days: ${avgLiters.toFixed(1)} L/session.`;
  if (top) answer += ` Top performer today: ${top.name || top.cow_code} (${top.cow_code}) at ${Number(top.total).toFixed(1)} L.`;

  const indicators: SourceIndicator[] = [
    farmSource('🥛 Milk records', records || 1, 'milk'),
  ];
  if (top) indicators.push(farmSource('🐄 Animal records', 1, 'cows'));
  return `${answer}${sourceLine(indicators)}`;
}

// ---------- Top milk producers ----------
export async function answerTopProducers(farmId: string): Promise<string> {
  const r = await query(`SELECT c.cow_code, c.name, COALESCE(AVG(mr.morning_liters+mr.afternoon_liters+mr.evening_liters),0) AS avg_liters, count(*)::int AS sessions FROM milk_records mr JOIN cows c ON c.id=mr.cow_id WHERE c.farm_id=$1 AND c.is_milking AND mr.recorded_on >= CURRENT_DATE - INTERVAL '30 days' GROUP BY c.id ORDER BY avg_liters DESC LIMIT 10`, [farmId]);
  if (!r.rows.length) return 'No milk records available yet. Start recording daily yields to track top producers.';
  const lines = r.rows.map((row: any, i: number) => `${i + 1}. ${row.name || row.cow_code} (${row.cow_code}): ${Number(row.avg_liters).toFixed(1)} L/day average (${row.sessions} sessions)`);
  const answer = `Top milk producers (last 30 days):\n\n${lines.join('\n')}`;
  const indicators: SourceIndicator[] = [
    farmSource('🐄 Animal records', r.rows.length, 'cows'),
    farmSource('🥛 Milk records', r.rows.length, 'milk'),
  ];
  return `${answer}${sourceLine(indicators)}`;
}

// ---------- Feed / running low ----------
export async function answerFeedStatus(farmId: string): Promise<string> {
  const [stock, lowStock, daysRemaining] = await Promise.all([
    query(`SELECT ft.name, fi.quantity, fi.unit_cost FROM feed_inventory fi JOIN feed_types ft ON ft.id=fi.feed_type_id WHERE ft.farm_id=$1 ORDER BY fi.quantity ASC LIMIT 10`, [farmId]),
    query(`SELECT ft.name, fi.quantity, fi.unit_cost FROM feed_inventory fi JOIN feed_types ft ON ft.id=fi.feed_type_id WHERE ft.farm_id=$1 AND fi.quantity <= ft.reorder_level ORDER BY fi.quantity ASC`, [farmId]),
    query(`SELECT COALESCE(SUM(fi.quantity),0) AS stock, (SELECT count(*) FILTER (WHERE is_milking AND status='active') FROM cows WHERE farm_id=$1) AS milking, (SELECT count(*) FILTER (WHERE is_pregnant AND status='active') FROM cows WHERE farm_id=$1) AS pregnant FROM feed_inventory fi JOIN feed_types ft ON ft.id=fi.feed_type_id WHERE ft.farm_id=$1`, [farmId]),
  ]);

  const stockVal = Number(daysRemaining.rows[0]?.stock || 0);
  const milking = Number(daysRemaining.rows[0]?.milking || 0);
  const pregnant = Number(daysRemaining.rows[0]?.pregnant || 0);
  const dailyNeed = milking * 25 + pregnant * 5;
  const daysOfFeed = dailyNeed > 0 ? stockVal / dailyNeed : 999;

  const parts: string[] = [];
  parts.push(`Based on your current farm records, feed stock: ${stockVal.toFixed(0)} kg total.`);
  parts.push(`Daily need (approx): ${dailyNeed} kg (${milking} milking × 25 kg + ${pregnant} pregnant × 5 kg).`);
  parts.push(`Days of feed remaining: ${daysOfFeed < 999 ? daysOfFeed.toFixed(1) : 'unknown (no milking/pregnant cows or no data)'}.`);

  if (lowStock.rows.length) {
    parts.push(`\nRunning low:`);
    lowStock.rows.forEach((row: any) => parts.push(`• ${row.name}: ${Number(row.quantity).toFixed(0)} kg (at or below reorder level)`));
  } else if (stock.rows.length > 0) {
    parts.push(`\nAll feed types are currently above reorder levels.`);
  } else {
    parts.push(`\nNo feed inventory recorded yet.`);
  }

  const indicators: SourceIndicator[] = [
    farmSource('🌾 Feed inventory', lowStock.rows.length || stock.rows.length || 1, 'feed'),
    farmSource('🐄 Animal records', milking + pregnant, 'cows'),
  ];
  parts.push(sourceLine(indicators));
  return parts.join('\n');
}

// ---------- Yesterday's activities ----------
export async function answerYesterdayActivities(farmId: string): Promise<string> {
  const [activities, notifications, milk, health] = await Promise.all([
    query(`SELECT da.created_at, da.activity_type, da.description, c.cow_code FROM daily_activities da LEFT JOIN cows c ON c.id=da.related_cow_id WHERE da.farm_id=$1 AND da.activity_date = CURRENT_DATE - INTERVAL '1 day' ORDER BY da.created_at DESC LIMIT 20`, [farmId]),
    query(`SELECT type, title, body, created_at FROM notifications WHERE farm_id=$1 AND date(created_at) = CURRENT_DATE - INTERVAL '1 day' ORDER BY created_at DESC LIMIT 20`, [farmId]),
    query(`SELECT COALESCE(SUM(morning_liters+afternoon_liters+evening_liters),0) AS liters FROM milk_records WHERE farm_id=$1 AND recorded_on = CURRENT_DATE - INTERVAL '1 day'`, [farmId]),
    query(`SELECT count(*)::int AS n FROM health_records WHERE farm_id=$1 AND recorded_on = CURRENT_DATE - INTERVAL '1 day' AND health_status <> 'healthy'`, [farmId]),
  ]);

  const parts: string[] = [];
  parts.push(`Based on your current farm records, yesterday's milk production: ${Number(milk.rows[0]?.liters || 0).toFixed(1)} L.`);
  parts.push(`Health records logged: ${Number(health.rows[0]?.n || 0)}.`);

  if (activities.rows.length) {
    parts.push(`\nActivities:`);
    activities.rows.forEach((a: any) => parts.push(`• ${a.activity_type}: ${a.description}${a.cow_code ? ` (${a.cow_code})` : ''}`));
  }

  if (notifications.rows.length) {
    parts.push(`\nNotifications:`);
    notifications.rows.forEach((n: any) => parts.push(`• [${n.type}] ${n.title}: ${n.body}`));
  }

  if (!activities.rows.length && !notifications.rows.length) {
    parts.push('No specific activities or notifications logged for yesterday.');
  }

  const indicators: SourceIndicator[] = [
    farmSource('🥛 Milk records', 1, 'milk'),
    farmSource('📋 Activity records', activities.rows.length || 1, 'tasks'),
  ];
  if (notifications.rows.length) indicators.push(farmSource('🔔 Notifications', notifications.rows.length, 'notifications'));
  if (Number(health.rows[0]?.n || 0) > 0) indicators.push(farmSource('❤️ Health alerts', Number(health.rows[0]?.n || 0), 'health'));

  parts.push(sourceLine(indicators));
  return parts.join('\n');
}

// ---------- Biggest farm risks ----------
export async function answerFarmRisks(farmId: string): Promise<string> {
  const [health, feed, finance, breeding, tasks] = await Promise.all([
    query(`SELECT count(*)::int AS sick, count(*) FILTER (WHERE health='under_treatment') AS treatment FROM cows WHERE farm_id=$1 AND status='active' AND health <> 'healthy'`, [farmId]),
    query(`SELECT ft.name, fi.quantity, ft.reorder_level FROM feed_inventory fi JOIN feed_types ft ON ft.id=fi.feed_type_id WHERE ft.farm_id=$1 AND fi.quantity <= ft.reorder_level ORDER BY fi.quantity ASC LIMIT 5`, [farmId]),
    query(`SELECT (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE farm_id=$1 AND incurred_on >= date_trunc('month', current_date)) AS expenses, (SELECT COALESCE(SUM(amount),0) FROM income WHERE farm_id=$1 AND received_on >= date_trunc('month', current_date)) AS income`, [farmId]),
    query(`SELECT count(*)::int AS calving_soon FROM breeding_records br JOIN cows c ON c.id=br.cow_id WHERE c.farm_id=$1 AND br.expected_calving_on BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`, [farmId]),
    query(`SELECT count(*)::int AS overdue FROM tasks WHERE farm_id=$1 AND due_date < CURRENT_DATE AND status NOT IN ('completed','cancelled')`, [farmId]),
  ]);

  const sick = Number(health.rows[0]?.sick || 0);
  const treatment = Number(health.rows[0]?.treatment || 0);
  const lowFeed = feed.rows.length;
  const expenses = Number(finance.rows[0]?.expenses || 0);
  const income = Number(finance.rows[0]?.income || 0);
  const calvingSoon = Number(breeding.rows[0]?.calving_soon || 0);
  const overdueTasks = Number(tasks.rows[0]?.overdue || 0);

  const risks: string[] = [];
  if (sick > 0 || treatment > 0) risks.push(`Health: ${sick} sick and ${treatment} under treatment — disease spread risk.`);
  if (lowFeed > 0) risks.push(`Feed: ${lowFeed} feed type(s) at or below reorder level — risk of shortage.`);
  if (expenses > income && income > 0) risks.push(`Finance: expenses exceed income this month — cash flow pressure.`);
  if (calvingSoon > 0) risks.push(`Breeding: ${calvingSoon} calving(s) expected within 7 days — ensure facilities and vet support.`);
  if (overdueTasks > 0) risks.push(`Tasks: ${overdueTasks} overdue task(s) — operational delays.`);

  if (risks.length === 0) return 'No major risks detected right now. Herd health, feed stock, and finances look stable.';

  const indicators: SourceIndicator[] = [];
  if (sick > 0 || treatment > 0) indicators.push(farmSource('❤️ Health alerts', sick + treatment, 'health'));
  if (lowFeed > 0) indicators.push(farmSource('🌾 Feed inventory', lowFeed, 'feed'));
  if (expenses > income && income > 0) indicators.push(farmSource('💰 Finance records', 1, 'finance'));
  if (calvingSoon > 0) indicators.push(farmSource('🤰 Pregnancy records', calvingSoon, 'breeding'));
  if (overdueTasks > 0) indicators.push(farmSource('📋 Tasks', overdueTasks, 'tasks'));
  return `Based on your current farm records, biggest risks right now:\n\n${risks.map((r, i) => `${i + 1}. ${r}`).join('\n')}${sourceLine(indicators)}`;
}

// ---------- Unvaccinated cows ----------
export async function answerUnvaccinatedCows(farmId: string): Promise<string> {
  const r = await query(`SELECT c.cow_code, c.name, v.vaccine_name, v.due_on FROM vaccinations v JOIN cows c ON c.id=v.cow_id WHERE c.farm_id=$1 AND v.administered_on IS NULL AND v.due_on <= CURRENT_DATE ORDER BY v.due_on ASC LIMIT 50`, [farmId]);
  if (!r.rows.length) return 'All cows are up to date on vaccinations — no overdue shots found.';
  const lines = r.rows.map((row: any) => `• ${row.name || row.cow_code} (${row.cow_code}): ${row.vaccine_name} due ${row.due_on}`);
  const answer = `Based on your current farm records, overdue vaccinations (${r.rows.length}):\n\n${lines.join('\n')}`;
  const indicators: SourceIndicator[] = [
    farmSource('🐄 Animal records', r.rows.length, 'cows'),
    farmSource('💉 Vaccination records', r.rows.length, 'health'),
  ];
  return `${answer}${sourceLine(indicators)}`;
}

// ---------- Cows calving soon ----------
export async function answerCalvingSoon(farmId: string): Promise<string> {
  const r = await query(`SELECT c.cow_code, c.name, br.expected_calving_on, br.breeding_date, br.method FROM breeding_records br JOIN cows c ON c.id=br.cow_id WHERE c.farm_id=$1 AND br.expected_calving_on BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days' ORDER BY br.expected_calving_on ASC`, [farmId]);
  if (!r.rows.length) return 'No cows are expected to calve in the next 14 days.';
  const lines = r.rows.map((row: any) => {
    const days = Math.max(0, Math.round((new Date(row.expected_calving_on).getTime() - Date.now()) / 86400000));
    return `• ${row.name || row.cow_code} (${row.cow_code}): ${row.method}, due in ${days} day(s) (${row.expected_calving_on})`;
  });
  const answer = `Based on your current farm records, cows about to calve (${r.rows.length}):\n\n${lines.join('\n')}`;
  const indicators: SourceIndicator[] = [
    farmSource('🐄 Animal records', r.rows.length, 'cows'),
    farmSource('🤰 Pregnancy records', r.rows.length, 'breeding'),
  ];
  return `${answer}${sourceLine(indicators)}`;
}

// ---------- Monthly expenses ----------
export async function answerMonthlySpend(farmId: string): Promise<string> {
  const [summary, byCategory] = await Promise.all([
    query(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE farm_id=$1 AND incurred_on >= date_trunc('month', current_date)`, [farmId]),
    query(`SELECT category, SUM(amount) AS total FROM expenses WHERE farm_id=$1 AND incurred_on >= date_trunc('month', current_date) GROUP BY category ORDER BY total DESC LIMIT 10`, [farmId]),
  ]);

  const total = Number(summary.rows[0]?.total || 0);
  let answer = `Based on your current farm records, this month's spending: ${total.toFixed(0)}.\n\n`;
  if (byCategory.rows.length) {
    answer += `By category:\n`;
    byCategory.rows.forEach((r: any) => answer += `• ${r.category}: ${Number(r.total).toFixed(0)}\n`);
  }

  const indicators: SourceIndicator[] = [
    farmSource('💰 Expense records', byCategory.rows.length || 1, 'finance'),
  ];
  return `${answer}${sourceLine(indicators)}`;
}
