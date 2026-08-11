import { query } from '../db/index.js';
import { computeFarmScore } from './farm-score.js';
import { getWeatherObservation, computeThi } from './weather-station.js';

function pct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

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

  let answer = `Milk production is down ${pct(-dropPct)}: ${recentAvg.toFixed(0)} L/day this week vs ${prevAvg.toFixed(0)} L/day the week before (${milking} milking cows).\n\nLikely contributing factors, ranked by evidence:\n`;
  const causes: string[] = [];
  if (sick > 0 || underTreatment > 0) causes.push(`• Herd health: ${sick} sick and ${underTreatment} under treatment right now — sick cows produce less and can drag down the average.`);
  if (decliningCows.length > 0) causes.push(`• Individual cows declining sharply: ${decliningCows.map((c: any) => `${c.cow_code} (${Number(c.recent_avg).toFixed(1)} L/day vs its own ${Number(c.avg_yield).toFixed(1)} L/day average)`).join(', ')}.`);
  if (thi > 72) causes.push(`• Heat stress: THI is ${thi.toFixed(1)} (above the 72 threshold) — this alone can cut yield 10-20%.`);
  if (daysOfFeed < 10) causes.push(`• Feed supply is tight — only ${daysOfFeed.toFixed(1)} days of stock remaining, which can force ration cuts.`);
  if (causes.length === 0) causes.push(`• No single obvious cause found in health, feed stock, weather, or individual-cow data — check for milking routine changes, water access, or recent feed formula changes.`);
  answer += causes.join('\n');
  answer += `\n\nRecommended next steps: physically check the cows listed above first, then review ration consistency and confirm milking routine hasn't changed.`;
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
  return `Tomorrow's plan:\n\n${lines.join('\n')}`;
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
    return answer;
  }

  const rows = namesRes.rows.map((c: any) => {
    const cowLiters = litersByCow.get(c.id) || 0;
    const feedCost = feedCostByCow.get(c.id) || 0;
    const revenue = cowLiters * pricePerLiter!;
    const treatments = treatmentsByCow.get(c.id) || 0;
    return { cow_code: c.cow_code, name: c.name, revenue, feedCost, margin: revenue - feedCost, treatments };
  }).sort((a: any, b: any) => a.margin - b.margin).slice(0, 5);

  let answer = `Over the last 90 days (realized milk price: ${pricePerLiter.toFixed(2)}/L from recorded milk sales), the cows with the lowest feed-cost margin are:\n\n`;
  rows.forEach((c: any, i: number) => {
    answer += `${i + 1}. ${c.name || c.cow_code} (${c.cow_code}): revenue ${c.revenue.toFixed(0)}, feed cost ${c.feedCost.toFixed(0)}, margin ${c.margin.toFixed(0)}${c.margin < 0 ? ' (losing money)' : ''}${c.treatments > 0 ? `, ${c.treatments} treatment(s) in this period` : ''}\n`;
  });
  answer += `\nNote: this margin covers feed cost only — it doesn't include vet, labor, or overhead costs, which aren't tracked per-cow in the system. Cows with both a low margin and treatments are the strongest culling/review candidates.`;
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

  let answer = `Finance score: ${finance.score}/100.\n\n`;
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
  return answer;
}

// ---------- Which cows are likely pregnant? ----------
export async function answerPregnancyCandidates(farmId: string): Promise<string> {
  const [confirmedRes, candidateRes, rateRes] = await Promise.all([
    query(`SELECT cow_code, name FROM cows WHERE farm_id=$1 AND is_pregnant AND status='active'`, [farmId]),
    query(`
      SELECT c.cow_code, c.name, br.serviced_on, br.method, (CURRENT_DATE - br.serviced_on) AS days_since
      FROM breeding_records br JOIN cows c ON c.id=br.cow_id
      WHERE c.farm_id=$1 AND br.result IS NULL
        AND br.serviced_on BETWEEN CURRENT_DATE - INTERVAL '90 days' AND CURRENT_DATE - INTERVAL '30 days'
        AND NOT EXISTS (SELECT 1 FROM breeding_records br2 WHERE br2.cow_id=br.cow_id AND br2.serviced_on > br.serviced_on)
      ORDER BY br.serviced_on ASC
    `, [farmId]),
    query(`SELECT count(*) FILTER (WHERE lower(result)='pregnant') AS pregnant, count(*) AS total FROM breeding_records br JOIN cows c ON c.id=br.cow_id WHERE c.farm_id=$1 AND br.serviced_on >= CURRENT_DATE - INTERVAL '180 days'`, [farmId]),
  ]);

  const pregnant = Number(rateRes.rows[0]?.pregnant || 0);
  const total = Number(rateRes.rows[0]?.total || 0);
  const rate = total > 0 ? (pregnant / total) * 100 : null;

  let answer = '';
  if (confirmedRes.rows.length) {
    answer += `${confirmedRes.rows.length} cow(s) confirmed pregnant: ${confirmedRes.rows.map((c: any) => c.name || c.cow_code).join(', ')}.\n\n`;
  }
  if (candidateRes.rows.length) {
    answer += `${candidateRes.rows.length} cow(s) are likely pregnant but awaiting confirmation (serviced 30-90 days ago with no result recorded):\n`;
    candidateRes.rows.forEach((c: any) => { answer += `• ${c.name || c.cow_code}: serviced ${c.days_since} days ago via ${c.method}\n`; });
    answer += `\nSchedule pregnancy checks (ultrasound) for this list to confirm.\n`;
  } else if (!confirmedRes.rows.length) {
    answer += `No confirmed or likely-pregnant cows found right now.\n`;
  }
  if (rate != null) answer += `\nFarm-wide conception rate over the last 180 days: ${rate.toFixed(0)}% (${pregnant} of ${total} services).`;
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

  let answer = `Financial report — this month\n\n`;
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

  let answer = `Feed expenses ${costChangePct >= 0 ? 'rose' : 'fell'} ${Math.abs(costChangePct).toFixed(0)}%: ${lastMonthCost.toFixed(0)} last month → ${thisMonthCost.toFixed(0)} this month.\n\n`;
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

  return parts.join('. ') + '.';
}

export async function answerOffspringCount(farmId: string, cowId: string): Promise<string> {
  const [cowRes, countRes] = await Promise.all([
    query(`SELECT cow_code, name FROM cows WHERE id=$1`, [cowId]),
    query(`SELECT count(*)::int AS n FROM offspring WHERE mother_id=$1 OR father_id=$1`, [cowId]),
  ]);
  const cow = cowRes.rows[0];
  if (!cow) return 'Cow not found.';
  const n = countRes.rows[0]?.n || 0;
  return `${cow.name || cow.cow_code} has ${n} offspring on record.`;
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
  return `${cow.name || cow.cow_code} is expected to calve in ${days} day(s) (${p.expected_calving_date}). Status: ${p.status}.`;
}

export async function answerBreedingCount(farmId: string, cowId: string): Promise<string> {
  const [cowRes, countRes] = await Promise.all([
    query(`SELECT cow_code, name FROM cows WHERE id=$1`, [cowId]),
    query(`SELECT count(*)::int AS n FROM breeding_records WHERE cow_id=$1`, [cowId]),
  ]);
  const cow = cowRes.rows[0];
  if (!cow) return 'Cow not found.';
  const n = countRes.rows[0]?.n || 0;
  return `${cow.name || cow.cow_code} has ${n} breeding record(s).`;
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
  return `Cows with multiple non-conception services:\n${rows.map((r: any) => `• ${r.name || r.cow_code}: ${r.failed_services} failed services`).join('\n')}`;
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
  return `Top bulls by conception count (last 12 months):\n${rows.map((r: any) => `• ${r.name || r.cow_code}: ${r.pregnancies} pregnancies (rate ${r.rate ? (r.rate * 100).toFixed(0) : 'N/A'}%)`).join('\n')}`;
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
  return `Cows due to calve this month:\n${rows.map((r: any) => `• ${r.name || r.cow_code}: ${r.expected_calving_date}`).join('\n')}`;
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
  const parts: string[] = [`Reproductive history for ${cow.name || cow.cow_code} (${cow.breed}, ${cow.gender}):`];
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
  return parts.join('\n');
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
    return `Yes, ${a.name || a.cow_code} and ${b.name || b.cow_code} are related. Shared ancestors: ${nameList}.`;
  }
  return `No, ${a.name || a.cow_code} and ${b.name || b.cow_code} do not appear to share ancestors within the available pedigree depth.`;
}
