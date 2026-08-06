import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth, resolveFarmId } from '../middleware/auth.js';
import { asyncHandler } from '../lib/errors.js';
import {
  answerMilkDecline, answerCowsNeedingAttention, answerTomorrowPlan, answerCowProfitability,
  answerIncreaseProfit, answerPregnancyCandidates, answerFinancialReport, answerFeedCostIncrease,
} from '../ai/qa-answers.js';

const router = Router();
router.use(requireAuth);

function classifyIntent(q: string): { intent: string; confidence: number; entities: string[] } {
  const lower = q.toLowerCase();
  const entities: string[] = [];

  // Specific, data-grounded question patterns are checked first so they take priority
  // over the broader topic keywords below (e.g. "milk" alone routes to milk_production,
  // but "milk...falling" should route to the trend/decline analysis instead).
  if (/\b(milk|production|yield)\b/.test(lower) && /\b(fall|falling|fell|drop|dropp|declin|decreas|down|less|reduc)\b/.test(lower)) return { intent: 'milk_decline', confidence: 0.95, entities };
  if (/\bcow(s)?\b/.test(lower) && /\battention|priorit|watch|focus\b/.test(lower)) return { intent: 'attention_today', confidence: 0.9, entities };
  if (/\btomorrow\b/.test(lower)) return { intent: 'tomorrow_plan', confidence: 0.9, entities };
  if (/\bcow(s)?\b/.test(lower) && /\bmoney|costing|expensive|losing money|unprofitable|profitab/.test(lower)) return { intent: 'cow_profitability', confidence: 0.9, entities };
  if (/\bprofit\b/.test(lower) && /\bincreas|improve|boost|raise|more\b/.test(lower)) return { intent: 'increase_profit', confidence: 0.9, entities };
  if (/pregnan/.test(lower) && /\bwhich|likely|candidate|probably\b/.test(lower)) return { intent: 'pregnancy_candidates', confidence: 0.9, entities };
  if (/report/.test(lower) && /financ/.test(lower)) return { intent: 'financial_report', confidence: 0.9, entities };
  if (/feed/.test(lower) && /cost/.test(lower) && /(increas|rising|risen|rose|expensive|higher|up|why)/.test(lower)) return { intent: 'feed_cost_increase', confidence: 0.9, entities };

  if (/\b(vaccin|vaccination|booster|shot|injection|immune|antibody)\b/.test(lower)) return { intent: 'vaccination', confidence: 0.95, entities };
  if (/\b(milk|litre|liter|production|yield|milking|udder|mastitis|fat|snf|butterfat)\b/.test(lower)) return { intent: 'milk_production', confidence: 0.95, entities };
  if (/\b(low|worst|underperforming|poor|best|top|highest|lowest)\b/.test(lower) && /\b(perform|produc|yield|cow|herd)\b/.test(lower)) return { intent: 'performance', confidence: 0.9, entities };
  if (/\b(feed|fodder|silage|hay|concentrate|stock|inventory|ration|tdn|dnf|protein|energy)\b/.test(lower)) return { intent: 'feed_nutrition', confidence: 0.95, entities };
  if (/\b(sick|health|disease|ill|treatment|vet|veterinarian|medicine|antibiotic|lameness|foot|hoof|metritis|retained placenta|ketosis|acidosis)\b/.test(lower)) return { intent: 'health', confidence: 0.95, entities };
  if (/\b(pregnan|calving|breeding|ai|insemination|serviced|open|heat|estrus|bull|sire|dam|calf|heifer)\b/.test(lower)) return { intent: 'breeding', confidence: 0.95, entities };
  if (/\b(weather|rain|temperature|humidity|wind|grazing|pasture|heat stress|cold|frost)\b/.test(lower)) return { intent: 'weather', confidence: 0.9, entities };
  if (/\b(finance|money|income|expense|profit|cost|revenue|cash|budget|roi|return|investment|break even)\b/.test(lower)) return { intent: 'finance', confidence: 0.95, entities };
  if (/\b(analytics|report|trend|breed|performance|statistics|data|insight|kpi|metric)\b/.test(lower)) return { intent: 'analytics', confidence: 0.9, entities };
  if (/\b(employee|worker|staff|team|attendance|payroll|leave|shift|roster|hr|human resource)\b/.test(lower)) return { intent: 'employees', confidence: 0.9, entities };
  if (/\b(gallery|photo|image|picture|media|upload|camera)\b/.test(lower)) return { intent: 'gallery', confidence: 0.9, entities };
  if (/\b(cow|cattle|herd|animal|bovine|stock|animal welfare|body condition|bcs)\b/.test(lower)) return { intent: 'herd_management', confidence: 0.8, entities };
  if (/\b(barn|facility|equipment|map|location|building|infrastructure|fence|water|tank|milking parlor|parlour)\b/.test(lower)) return { intent: 'infrastructure', confidence: 0.8, entities };
  if (/\b(sustainability|water|carbon|manure|renewable|solar|environment|green|eco|emission)\b/.test(lower)) return { intent: 'sustainability', confidence: 0.9, entities };
  if (/\b(customer|client|buyer|order|invoice|payment|delivery|sales|sale|supplier)\b/.test(lower)) return { intent: 'customers', confidence: 0.9, entities };
  if (/\b(ai|assistant|bot|help|feature|how to|guide|tutorial|use|navigate|dashboard|page|screen)\b/.test(lower)) return { intent: 'project_help', confidence: 0.9, entities };
  if (/\b(predict|forecast|future|next month|estimate|trend)\b/.test(lower)) return { intent: 'predictions', confidence: 0.95, entities };
  if (/\b(password|login|register|account|sign in|auth|security|2fa|permission|role|access)\b/.test(lower)) return { intent: 'auth_support', confidence: 0.9, entities };
  if (/\b(export|pdf|excel|csv|download|report|print|share)\b/.test(lower)) return { intent: 'export', confidence: 0.9, entities };
  if (/\b(mobile|phone|tablet|app|ios|android|responsive|offline)\b/.test(lower)) return { intent: 'mobile', confidence: 0.85, entities };
  if (/\b(pricing|plan|subscription|cost|upgrade|starter|pro|enterprise|trial|free|payment)\b/.test(lower)) return { intent: 'pricing', confidence: 0.9, entities };
  if (/\b(hello|hi|hey|good morning|good afternoon|thanks|thank you|please|sorry)\b/.test(lower)) return { intent: 'greeting', confidence: 0.95, entities };
  if (/\b(bye|goodbye|see you|exit|quit)\b/.test(lower)) return { intent: 'goodbye', confidence: 0.95, entities };
  return { intent: 'general', confidence: 0.5, entities };
}

router.post('/ask', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const question = (req.body && req.body.question) || '';
  const { intent } = classifyIntent(question);

  const [
    summary,
    milkToday,
    feedStock,
    milkingCount,
    sickCount,
    pregnantCount,
    recentMilk,
    lowProducers,
    breedPerf,
    financeSummary,
    upcomingVacc,
    employeeCount,
    galleryCount,
    notificationsCount,
    totalCowsQuery,
    avgMilkQuery,
    healthIssuesQuery,
    feedConsumptionQuery,
    treatmentsQuery,
  ] = await Promise.all([
    query(`SELECT count(*)::int AS total_cows,
            (SELECT count(*)::int FROM cows WHERE farm_id=$1 AND is_pregnant) AS pregnant,
            (SELECT count(*)::int FROM cows WHERE farm_id=$1 AND health<>'healthy') AS sick,
            (SELECT count(*)::int FROM cows WHERE farm_id=$1 AND is_milking) AS milking
            FROM cows WHERE farm_id=$1`, [farmId]),
    query(`SELECT COALESCE(SUM(morning_liters+afternoon_liters+evening_liters),0) AS total
          FROM milk_records WHERE farm_id=$1 AND recorded_on=current_date`, [farmId]),
    query(`SELECT COALESCE(SUM(quantity),0) AS stock
          FROM feed_inventory fi JOIN feed_types ft ON ft.id=fi.feed_type_id WHERE ft.farm_id=$1`, [farmId]),
    query(`SELECT count(*)::int AS n FROM cows WHERE farm_id=$1 AND is_milking`, [farmId]),
    query(`SELECT count(*)::int AS n FROM cows WHERE farm_id=$1 AND health<>'healthy'`, [farmId]),
    query(`SELECT count(*)::int AS n FROM cows WHERE farm_id=$1 AND is_pregnant`, [farmId]),
    query(`SELECT c.cow_code, c.name, c.breed,
            COALESCE(AVG(mr.morning_liters+mr.afternoon_liters+mr.evening_liters),0) AS avg_daily_milk,
            (SELECT COALESCE(SUM(morning_liters+afternoon_liters+evening_liters),0) FROM milk_records WHERE cow_id=c.id AND recorded_on=current_date) AS today_liters
            FROM cows c LEFT JOIN milk_records mr ON mr.cow_id=c.id
            WHERE c.farm_id=$1 AND c.is_milking GROUP BY c.id ORDER BY avg_daily_milk DESC LIMIT 5`, [farmId]),
    query(`SELECT c.cow_code, c.name, c.breed,
            COALESCE(AVG(mr.morning_liters+mr.afternoon_liters+mr.evening_liters),0) AS avg_daily_milk, c.health
            FROM cows c LEFT JOIN milk_records mr ON mr.cow_id=c.id
            WHERE c.farm_id=$1 AND c.is_milking GROUP BY c.id ORDER BY avg_daily_milk ASC LIMIT 5`, [farmId]),
    query(`SELECT c.breed, AVG(mr.morning_liters+mr.afternoon_liters+mr.evening_liters) AS avg_daily_milk
            FROM cows c JOIN milk_records mr ON mr.cow_id=c.id
            WHERE c.farm_id=$1 AND c.is_milking GROUP BY c.breed ORDER BY avg_daily_milk DESC`, [farmId]),
    query(`SELECT 
            (SELECT COALESCE(SUM(amount),0) FROM income WHERE farm_id=$1 AND received_on >= date_trunc('month', current_date)) AS income,
            (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE farm_id=$1 AND incurred_on >= date_trunc('month', current_date)) AS expenses`,
      [farmId]),
    query(`SELECT count(*)::int AS n FROM vaccinations v
            JOIN cows c ON c.id=v.cow_id WHERE c.farm_id=$1 AND v.due_on <= current_date + interval '7 days' AND v.administered_on IS NULL`, [farmId]),
    query(`SELECT count(*)::int AS n FROM employees WHERE farm_id=$1`, [farmId]),
    query(`SELECT count(*)::int AS n FROM cow_images ci JOIN cows c ON c.id=ci.cow_id WHERE c.farm_id=$1`, [farmId]),
    query(`SELECT count(*)::int AS n FROM notifications WHERE farm_id=$1 AND read_at IS NULL`, [farmId]),
    query(`SELECT count(*)::int AS n FROM cows WHERE farm_id=$1`, [farmId]),
    query(`SELECT COALESCE(AVG(morning_liters+afternoon_liters+evening_liters),0) AS avg
            FROM milk_records mr JOIN cows c ON c.id=mr.cow_id WHERE c.farm_id=$1`, [farmId]),
    query(`SELECT count(*)::int AS n FROM cows WHERE farm_id=$1 AND health<>'healthy'`, [farmId]),
    query(`SELECT ft.name, SUM(fc.quantity) AS total
            FROM feed_consumption fc JOIN feed_types ft ON ft.id=fc.feed_type_id
            WHERE fc.cow_id IN (SELECT id FROM cows WHERE farm_id=$1)
            GROUP BY ft.name ORDER BY total DESC LIMIT 5`, [farmId]),
    query(`SELECT t.disease_id, t.diagnosis, t.diagnosed_on, c.name AS cow_name
            FROM treatments t JOIN cows c ON c.id=t.cow_id
            WHERE c.farm_id=$1 ORDER BY t.diagnosed_on DESC LIMIT 5`, [farmId]),
  ]);

  const s = summary.rows[0];
  const totalCows = Number(s.total_cows);
  const milk = Math.round(Number(milkToday.rows[0]?.total || 0));
  const stock = Math.round(Number(feedStock.rows[0]?.stock || 0));
  const milking = Number(milkingCount.rows[0]?.n || 0);
  const sick = Number(sickCount.rows[0]?.n || 0);
  const pregnant = Number(pregnantCount.rows[0]?.n || 0);
  const unreadAlerts = Number(notificationsCount.rows[0]?.n || 0);
  const inc = Math.round(Number(financeSummary.rows[0]?.income || 0));
  const exp = Math.round(Number(financeSummary.rows[0]?.expenses || 0));
  const profit = inc - exp;
  const vaccDue = Number(upcomingVacc.rows[0]?.n || 0);
  const empCount = Number(employeeCount.rows[0]?.n || 0);
  const galCount = Number(galleryCount.rows[0]?.n || 0);
  const farmAvg = Number(avgMilkQuery.rows[0]?.avg || 0);
  const healthIssues = Number(healthIssuesQuery.rows[0]?.n || 0);
  const topFeeds = feedConsumptionQuery.rows;
  const activeTreatments = treatmentsQuery.rows;

  const topProducers = recentMilk.rows.slice(0, 3);
  const bottomProducers = lowProducers.rows.slice(0, 3);
  const topBreed = breedPerf.rows[0];

  function projectContext(): string {
    const parts: string[] = [];
    parts.push(`DairyOS farm management system`);
    parts.push(`Currently tracking ${totalCows} total cows (${milking} milking, ${pregnant} pregnant, ${sick} needing attention)`);
    parts.push(`Today's milk: ${milk.toLocaleString()} L (farm average: ${farmAvg.toFixed(1)} L/cow)`);
    parts.push(`Feed stock: ${stock.toLocaleString()} kg`);
    parts.push(`This month: income ${inc.toLocaleString()}, expenses ${exp.toLocaleString()}, profit ${profit.toLocaleString()}`);
    parts.push(`${vaccDue} vaccinations due this week, ${unreadAlerts} unread alerts`);
    parts.push(`${empCount} employees, ${galCount} gallery images`);
    return parts.join('. ') + '.';
  }

  let answer = '';

  switch (intent) {
    case 'greeting':
      answer = `Hello! I'm your DairyOS AI assistant. ${projectContext()} How can I help you today?`;
      break;

    case 'goodbye':
      answer = 'Goodbye! Your farm data is always here when you need it. Have a great day!';
      break;

    case 'milk_decline':
      answer = await answerMilkDecline(farmId);
      break;

    case 'attention_today':
      answer = await answerCowsNeedingAttention(farmId);
      break;

    case 'tomorrow_plan':
      answer = await answerTomorrowPlan(farmId);
      break;

    case 'cow_profitability':
      answer = await answerCowProfitability(farmId);
      break;

    case 'increase_profit':
      answer = await answerIncreaseProfit(farmId);
      break;

    case 'pregnancy_candidates':
      answer = await answerPregnancyCandidates(farmId);
      break;

    case 'financial_report':
      answer = await answerFinancialReport(farmId);
      break;

    case 'feed_cost_increase':
      answer = await answerFeedCostIncrease(farmId);
      break;

    case 'vaccination': {
      if (vaccDue > 0) {
        answer = `You have ${vaccDue} vaccination(s) due this week. `;
        answer += `I recommend prioritizing: Leptospirosis boosters for lactating cows, BVD for calves, and IBR for breeding stock. `;
        answer += `Check the Alerts tab for exact due dates and cow IDs. Visit each cow's profile to mark vaccinations as complete. `;
        answer += `Tip: vaccinate in the morning when cows are calm and temperatures are cooler.`;
      } else {
        answer = 'Great news! No vaccinations are due this week. All cattle are up to date. ';
        answer += `Next steps: review your vaccination calendar, schedule upcoming boosters (typically every 6 months), and ensure cold chain storage for vaccines.`;
      }
      break;
    }

    case 'milk_production': {
      const top = topProducers[0];
      answer = `Today's production: ${milk.toLocaleString()} L from ${milking} milking cows (${totalCows} total). `;
      answer += `Farm average: ${farmAvg.toFixed(1)} L per milking cow. `;
      if (top) answer += `Top producer: ${top.name} (${top.cow_code}) at ${Number(top.today_liters).toFixed(1)} L today. `;
      answer += `\n\nAdvice:\n`;
      answer += `• Maintain consistent milking times (morning 4-6am, afternoon 4-6pm)\n`;
      answer += `• Monitor somatic cell count (SCC) — aim below 200,000 cells/mL\n`;
      answer += `• Check for mastitis signs: clots, watery milk, udder swelling\n`;
      answer += `• Ensure proper milking machine function and teat disinfection\n`;
      answer += `• Track individual cow yields to spot declines early`;
      break;
    }

    case 'performance': {
      if (bottomProducers.length) {
        answer = `Lowest-producing milking cows:\n`;
        bottomProducers.forEach((c: any) => {
          answer += `• ${c.name} (${c.cow_code}, ${c.breed}): ${Number(c.avg_daily_milk).toFixed(1)} L/day — ${c.health === 'healthy' ? 'Consider feed review or vet check' : 'Has health issues — prioritize treatment'}\n`;
        });
        answer += `\nAction plan:\n`;
        answer += `1. Check feed intake and body condition score (BCS)\n`;
        answer += `2. Review milk records for declining trend\n`;
        answer += `3. Schedule vet examination for persistent low yielders\n`;
        answer += `4. Consider culling cows with consistently poor performance after 2+ lactations\n`;
        answer += `5. Open Analytics tab for full rankings and trends`;
      } else {
        answer = 'All milking cows are performing well! No low producers detected. ';
        answer += `Top performers: ${topProducers.map((c: any) => `${c.name} (${c.cow_code})`).join(', ')}. `;
        answer += `Consider breeding from these high-yielders to improve herd genetics.`;
      }
      break;
    }

    case 'predictions': {
      const nextMonth = Math.round(milk * 30 * 1.03);
      answer = `Based on current data:\n\n`;
      answer += `• Next month projection: ~${nextMonth.toLocaleString()} L\n`;
      answer += `• Current momentum: ${milk > 0 ? '+' : ''}${((milk / (milking || 1) - 20) * 3).toFixed(1)}% vs baseline\n`;
      answer += `• ${pregnant} pregnancies may increase output in coming months\n\n`;
      answer += `Recommendations:\n`;
      answer += `• Monitor feed intake as lactation progresses\n`;
      answer += `• Prepare for dry period 60 days before expected calving\n`;
      answer += `• Maintain vaccination schedule to prevent disease outbreaks\n`;
      answer += `• Check Predictions tab for detailed 6-month forecasts and risk factors`;
      break;
    }

    case 'feed_nutrition': {
      answer = `Current feed stock: ${stock.toLocaleString()} kg. `;
      if (stock < 1000) answer += '⚠️ Stock is running low — order more soon. ';
      answer += `\n\nTop feed types consumed:\n`;
      topFeeds.forEach((f: any) => {
        answer += `• ${f.name}: ${Math.round(Number(f.total))} kg\n`;
      });
      answer += `\nNutrition advice:\n`;
      answer += `• Lactating cows need 18-22% crude protein, 70-80% TDN\n`;
      answer += `• Increase concentrate by 8% during peak lactation\n`;
      answer += `• Provide clean water: 80-150 L per cow per day\n`;
      answer += `• Monitor body condition score (BCS) monthly — target 2.5-3.5 for milking cows\n`;
      answer += `• Rotate pastures to prevent overgrazing and maintain forage quality\n`;
      answer += `• Store silage properly to prevent mold and nutrient loss`;
      break;
    }

    case 'health': {
      if (sick > 0) {
        answer = `Currently ${sick} cow(s) need attention. `;
        if (activeTreatments.length) {
          answer += `Active treatments:\n`;
          activeTreatments.forEach((t: any) => {
            answer += `• ${t.cow_name}: ${t.disease_id} — diagnosed ${t.diagnosed_on}\n`;
          });
        }
        answer += `\nAction items:\n`;
        answer += `1. Isolate sick animals to prevent spread\n`;
        answer += `2. Follow vet-prescribed treatment plans\n`;
        answer += `3. Monitor temperature, appetite, and milk yield daily\n`;
        answer += `4. Maintain clean bedding and ventilation\n`;
        answer += `5. Document all treatments in cow profiles\n`;
        answer += `6. Review biosecurity protocols to prevent future outbreaks`;
      } else {
        answer = 'All cows are currently healthy! ';
        answer += `\nPreventive measures:\n`;
        answer += `• Maintain regular vaccination schedule\n`;
        answer += `• Practice good milking hygiene to prevent mastitis\n`;
        answer += `• Provide balanced nutrition to support immune function\n`;
        answer += `• Monitor for early signs: reduced feed intake, lethargy, temperature changes\n`;
        answer += `• Schedule regular vet check-ups (quarterly herd health reviews)`;
      }
      break;
    }

    case 'breeding': {
      answer = `Breeding status: ${pregnant} cows confirmed pregnant out of ${totalCows} total. `;
      answer += `\n\nBreeding advice:\n`;
      answer += `• AI success rate: 60-70% for first service, 85-90% overall\n`;
      answer += `• Best time for AI: 12 hours after heat detection (stand-to-be-mount)\n`;
      answer += `• Use proven sires with high genetic merit for milk production\n`;
      answer += `• Maintain breeding records: date, method, sire, result\n`;
      answer += `• Schedule pregnancy checks 28-45 days after AI\n`;
      answer += `• Dry period: 45-60 days before expected calving\n`;
      answer += `• Monitor body condition — cows should be BCS 3.0-3.5 at breeding\n`;
      answer += `• Consider sexed semen for herd replacement or beef crossbreeding`;
      break;
    }

    case 'weather':
      answer = 'Open the Weather tab for live conditions and grazing recommendations. ';
      answer += `General guidance: ${stock > 0 ? 'Feed stock is adequate.' : 'Consider supplementary feeding during poor grazing conditions.'} `;
      answer += `Monitor temperature-humidity index (THI) for heat stress risk.`;
      break;

    case 'finance': {
      answer = `Financial snapshot (this month):\n\n`;
      answer += `• Income: ${inc.toLocaleString()}\n`;
      answer += `• Expenses: ${exp.toLocaleString()}\n`;
      answer += `• Net profit: ${profit.toLocaleString()}\n`;
      answer += `• Profit margin: ${inc > 0 ? ((profit / inc) * 100).toFixed(1) : 0}%\n\n`;
      answer += `Advice:\n`;
      if (profit > 0) {
        answer += `✓ Farm is profitable this month. Consider reinvesting in:\n`;
        answer += `  - Feed quality improvements\n`;
        answer += `  - Equipment upgrades\n`;
        answer += `  - Herd genetics (AI, bull semen)\n`;
        answer += `  - Employee training\n`;
      } else {
        answer += `⚠️ Expenses exceeded income. Action items:\n`;
        answer += `1. Review feed costs — negotiate bulk discounts or improve feed efficiency\n`;
        answer += `2. Check labor costs — optimize rosters and overtime\n`;
        answer += `3. Monitor vet expenses — focus on preventive care\n`;
        answer += `4. Analyze milk price per litre — ensure fair contracts\n`;
        answer += `5. Reduce waste: feed leftovers, energy, water\n`;
      }
      answer += `\nOpen the Finance tab for detailed cash flow, expense breakdown, and sales trends.`;
      break;
    }

    case 'analytics': {
      answer = `Herd analytics overview:\n\n`;
      answer += `• Total cows: ${totalCows}\n`;
      answer += `• Milking: ${milking}\n`;
      answer += `• Farm average milk yield: ${farmAvg.toFixed(1)} L/day\n`;
      if (topBreed) answer += `• Top breed: ${topBreed.breed} at ${Number(topBreed.avg_daily_milk).toFixed(1)} L/day average\n`;
      answer += `• Health issues: ${healthIssues}\n\n`;
      answer += `Key insights:\n`;
      answer += `• Track individual cow performance curves\n`;
      answer += `• Monitor breed trends for breeding decisions\n`;
      answer += `• Identify seasonal patterns in milk production\n`;
      answer += `• Use Analytics tab for detailed reports and exports`;
      break;
    }

    case 'employees': {
      answer = empCount > 0
        ? `You have ${empCount} employee(s) registered.\n\n`
        : 'No employees registered yet.\n\n';
      answer += `Employee management tips:\n`;
      answer += `• Track attendance to identify patterns and issues\n`;
      answer += `• Set clear job descriptions and performance metrics\n`;
      answer += `• Schedule regular training on milking procedures and animal welfare\n`;
      answer += `• Use the Employees tab for schedules, tasks, and reporting\n`;
      answer += `• Consider incentives for attendance and performance\n`;
      answer += `• Ensure compliance with labor laws and safety regulations`;
      break;
    }

    case 'gallery':
      answer = galCount > 0
        ? `Gallery contains ${galCount} image(s).\n\n`
        : 'Gallery is empty.\n\n';
      answer += `Gallery management:\n`;
      answer += `• Upload high-quality photos of cows, facilities, and equipment\n`;
      answer += `• Use images for marketing, reports, and customer communications\n`;
      answer += `• Tag images with cow IDs for easy lookup\n`;
      answer += `• Keep primary photos updated (profile pictures, facility shots)\n`;
      answer += `• Export gallery for external use via PDF or Excel`;
      break;

    case 'herd_management':
      answer = `Herd management encompasses all aspects of cow care:\n\n`;
      answer += `• Health: vaccinations, treatments, vet checks, disease prevention\n`;
      answer += `• Breeding: AI, natural service, pregnancy checks, calving management\n`;
      answer += `• Nutrition: feed rations, water access, body condition scoring\n`;
      answer += `• Milking: routine, equipment hygiene, milk quality testing\n`;
      answer += `• Record keeping: individual cow IDs, medical history, production data\n`;
      answer += `• Culling: remove chronically low producers or unhealthy animals\n\n`;
      answer += `Current herd: ${totalCows} cows, ${milking} milking, ${sick} health issues, ${pregnant} pregnant.`;
      break;

    case 'infrastructure':
      answer = 'Open the Farm Map tab to view barns, pastures, water points, milking stations, and feed storage. ';
      answer += `Infrastructure tips:\n`;
      answer += `• Maintain clean, dry barns with good ventilation\n`;
      answer += `• Ensure water points are accessible and clean\n`;
      answer += `• Regular equipment maintenance (milking machines, feeders)\n`;
      answer += `• Plan facility upgrades based on herd growth\n`;
      answer += `• Monitor feed storage for pests and moisture`;
      break;

    case 'sustainability':
      answer = `Sustainability practices for your farm:\n\n`;
      answer += `• Water conservation: efficient irrigation, rainwater harvesting\n`;
      answer += `• Manure management: composting, biogas, nutrient recycling\n`;
      answer += `• Renewable energy: solar panels for water pumps and lighting\n`;
      answer += `• Biodiversity: maintain pasture diversity, hedgerows, wildlife corridors\n`;
      answer += `• Soil health: regular testing, crop rotation, organic matter\n`;
      answer += `• Carbon footprint: track emissions, reduce fossil fuel use\n`;
      answer += `• Check the Sustainability tab for detailed metrics and trends`;
      break;

    case 'customers':
      answer = `Customer relationship management:\n\n`;
      answer += `• Maintain regular communication with buyers\n`;
      answer += `• Ensure consistent milk quality and delivery schedules\n`;
      answer += `• Offer flexible contract terms for loyal customers\n`;
      answer += `• Track orders and payments via the Customers tab\n`;
      answer += `• Use customer feedback to improve products and service\n`;
      answer += `• Expand reach through local markets, cooperatives, or direct sales`;
      break;

    case 'project_help':
      answer = `DairyOS feature guide:\n\n`;
      answer += `📊 Dashboard — Overview of farm KPIs, charts, quick actions\n`;
      answer += `🐄 Herd — Cow list, search, add/edit cows, view profiles\n`;
      answer += `🗺️ Farm Map — Interactive barn/pasture/water point map\n`;
      answer += `🤖 AI Assistant — Ask me anything about your farm (this page)\n`;
      answer += `🔔 Alerts — Vaccination, health, feed, and task reminders\n`;
      answer += `📈 Predictions — AI forecasts for milk, feed, pregnancy, disease risk\n`;
      answer += `📉 Analytics — Breed performance, disease trends, feed efficiency\n`;
      answer += `💰 Finance — Income, expenses, profit, cash flow, exports\n`;
      answer += `🌤️ Weather — Conditions and grazing recommendations\n`;
      answer += `🌱 Sustainability — Water, carbon, manure, renewable energy metrics\n`;
      answer += `🖼️ Gallery — Photo management for cows, calves, facilities\n`;
      answer += `👥 Customers — Orders, invoices, payments, deliveries\n`;
      answer += `👔 Employees — Attendance, schedules, tasks, reports\n`;
      answer += `🔍 Search — Advanced cow search by breed, health, pregnancy\n`;
      answer += `🏆 Goals — Badges, achievements, leaderboard\n\n`;
      answer += `Navigation tips:\n`;
      answer += `• Use the sidebar to switch between sections\n`;
      answer += `• Click any cow row to view its full profile\n`;
      answer += `• Export reports via PDF, Excel, or CSV buttons\n`;
      answer += `• Switch themes (light/dark/contrast) via the top-right toggle\n`;
      answer += `• Change farms via the farm selector dropdown\n`;
      answer += `• Access help anytime by asking me!`;
      break;

    case 'auth_support':
      answer = `Authentication & access:\n\n`;
      answer += `• Sign in with your email and password\n`;
      answer += `• Passwords must be at least 8 characters\n`;
      answer += `• Roles: administrator, farm_manager, veterinarian, worker, accountant\n`;
      answer += `• Permissions control what each role can access\n`;
      answer += `• Enable 2FA in Security settings for extra protection\n`;
      answer += `• Contact your farm administrator if you need access\n`;
      answer += `• Password reset: contact support or use the forgot password link`;
      break;

    case 'export':
      answer = `Export your farm data:\n\n`;
      answer += `• PDF: Print-friendly reports for vet, accountant, or meetings\n`;
      answer += `• Excel: Spreadsheet format for further analysis\n`;
      answer += `• CSV: Universal format for data interchange\n\n`;
      answer += `Available exports:\n`;
      answer += `• Financial summary (income, expenses, cash flow)\n`;
      answer += `• Customer invoices and payment history\n`;
      answer += `• Employee attendance reports\n`;
      answer += `• Cow inventory and performance data\n\n`;
      answer += `Look for export buttons (CSV, Excel, PDF) on relevant pages.`;
      break;

    case 'mobile':
      answer = `DairyOS works on:\n\n`;
      answer += `• Desktop browsers (Chrome, Firefox, Safari, Edge)\n`;
      answer += `• Tablets (iPad, Android tablets)\n`;
      answer += `• Mobile phones (responsive design)\n\n`;
      answer += `Features:\n`;
      answer += `• Fully responsive — adapts to any screen size\n`;
      answer += `• Offline mode: cache data on-device, sync when reconnected\n`;
      answer += `• Touch-friendly interface for field use\n`;
      answer += `• Fast loading with optimized assets\n\n`;
      answer += `Tip: Install as a PWA for app-like experience on mobile.`;
      break;

    case 'pricing':
      answer = `DairyOS pricing plans:\n\n`;
      answer += `🟢 Starter — $29/month\n`;
      answer += `  • Up to 50 cows\n`;
      answer += `  • Dashboard & KPIs\n`;
      answer += `  • QR cow profiles\n`;
      answer += `  • Email support\n\n`;
      answer += `🔵 Pro — $79/month (Most Popular)\n`;
      answer += `  • Up to 500 cows\n`;
      answer += `  • AI assistant & predictions\n`;
      answer += `  • Multi-farm management\n`;
      answer += `  • Financial & analytics\n`;
      answer += `  • Weather insights\n\n`;
      answer += `🟣 Enterprise — Custom pricing\n`;
      answer += `  • Unlimited cows\n`;
      answer += `  • RBAC & 2FA\n`;
      answer += `  • API & integrations\n`;
      answer += `  • Dedicated account manager\n\n`;
      answer += `All plans include 14-day free trial, no credit card required.`;
      break;

    case 'general':
    default: {
      const hasFarmData = totalCows > 0;
      answer = hasFarmData
        ? `I'm here to help with all aspects of your dairy farm and DairyOS. `
        : `I'm your comprehensive dairy and project assistant. `;
      answer += `\n\nI can advise on:\n`;
      answer += `• 🐄 Herd management (health, breeding, nutrition, milk quality)\n`;
      answer += `• 📊 Analytics and performance tracking\n`;
      answer += `• 💰 Finance, profitability, and ROI\n`;
      answer += `• 🌾 Feed strategies and nutrition planning\n`;
      answer += `• 🤖 Using DairyOS features effectively\n`;
      answer += `• 🌱 Sustainability and environmental practices\n`;
      answer += `• 👥 Employee management and HR\n`;
      answer += `• 🌤️ Weather and grazing strategies\n`;
      answer += `• 📈 Predictions and forecasting\n`;
      answer += `• 💡 General dairy industry best practices\n\n`;
      if (hasFarmData) {
        answer += `Your farm right now: ${totalCows} cows, ${milking} milking, ${milk.toLocaleString()} L today, `;
        answer += `${sick} health items, ${pregnant} pregnant, ${vaccDue} vaccinations due. `;
        answer += `Ask me anything specific!`;
      } else {
        answer += `Start by asking about dairy management, or use the Dashboard to explore your farm data.`;
      }
      break;
    }
  }

  res.json({ answer });
}));

export default router;
