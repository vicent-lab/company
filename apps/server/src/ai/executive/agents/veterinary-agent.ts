import { query } from '../../../db/index.js';

export interface VeterinaryInsight {
  agent: 'veterinary';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  affectedCows: string[];
  actions: string[];
  evidence: Record<string, any>;
  reasoning?: string[];
}

export async function runVeterinaryAgent(farmId: string): Promise<VeterinaryInsight[]> {
  const [sickRes, tempRes, vaccRes, lamenessRes] = await Promise.all([
    query(`SELECT cow_code, health, id FROM cows WHERE farm_id=$1 AND status='active' AND health <> 'healthy' ORDER BY updated_at DESC LIMIT 20`, [farmId]),
    query(`SELECT c.cow_code, mr.temperature_c FROM cows c JOIN milk_records mr ON mr.cow_id=c.id AND mr.recorded_on=CURRENT_DATE WHERE c.farm_id=$1 AND c.status='active' AND c.is_milking AND mr.temperature_c > 39.0 LIMIT 10`, [farmId]),
    query(`SELECT c.cow_code, v.vaccine_name, v.due_on FROM vaccinations v JOIN cows c ON c.id=v.cow_id WHERE c.farm_id=$1 AND v.administered_on IS NULL AND v.due_on <= CURRENT_DATE ORDER BY v.due_on ASC LIMIT 20`, [farmId]),
    query(`SELECT c.cow_code, hr.lameness_score, hr.body_condition_score FROM health_records hr JOIN cows c ON c.id=hr.cow_id WHERE c.farm_id=$1 AND hr.recorded_on >= CURRENT_DATE - INTERVAL '60 days' AND hr.lameness_score >= 3 ORDER BY hr.recorded_on DESC LIMIT 10`, [farmId]),
  ]);

  const insights: VeterinaryInsight[] = [];

  if (sickRes.rows.length > 0) {
    const codes = sickRes.rows.map((r: any) => r.cow_code);
    insights.push({
      agent: 'veterinary',
      title: `${sickRes.rows.length} cow(s) currently sick or under treatment`,
      description: `Immediate veterinary attention may be needed for: ${codes.join(', ')}.`,
      severity: sickRes.rows.length > 3 ? 'critical' : sickRes.rows.length > 1 ? 'high' : 'medium',
      confidence: 0.95,
      affectedCows: codes,
      actions: ['Schedule veterinary examination', 'Isolate affected animals', 'Review treatment protocols'],
      evidence: { sick_count: sickRes.rows.length, cows: codes },
    });
  }

  if (tempRes.rows.length > 0) {
    const codes = tempRes.rows.map((r: any) => r.cow_code);
    insights.push({
      agent: 'veterinary',
      title: `Elevated temperature detected in ${tempRes.rows.length} milking cow(s)`,
      description: `Temperature >39.0°C indicates possible mastitis or systemic infection: ${codes.join(', ')}.`,
      severity: 'high',
      confidence: 0.85,
      affectedCows: codes,
      actions: ['Check for clinical mastitis signs', 'Collect milk sample for culture', 'Consider anti-inflammatory treatment'],
      evidence: { high_temp_count: tempRes.rows.length, threshold: '39.0°C', cows: codes },
    });
  }

  if (vaccRes.rows.length > 0) {
    const codes = vaccRes.rows.map((r: any) => r.cow_code);
    insights.push({
      agent: 'veterinary',
      title: `${vaccRes.rows.length} overdue vaccination(s)`,
      description: `The following vaccinations are past due: ${vaccRes.rows.map((r: any) => `${r.cow_code} (${r.vaccine_name}, due ${r.due_on})`).join(', ')}.`,
      severity: vaccRes.rows.length > 5 ? 'high' : 'medium',
      confidence: 0.9,
      affectedCows: codes,
      actions: ['Catch up on overdue vaccinations', 'Review vaccination schedule with vet', 'Log administered doses'],
      evidence: { overdue_count: vaccRes.rows.length, details: vaccRes.rows },
    });
  }

  if (lamenessRes.rows.length > 0) {
    const codes = lamenessRes.rows.map((r: any) => r.cow_code);
    insights.push({
      agent: 'veterinary',
      title: `Lameness detected in ${lamenessRes.rows.length} cow(s)`,
      description: `Recent health records show lameness score ≥3: ${codes.join(', ')}. Early intervention prevents worsening.`,
      severity: 'high',
      confidence: 0.8,
      affectedCows: codes,
      actions: ['Schedule hoof trimming', 'Review bedding quality', 'Footbath protocol check'],
      evidence: { lame_count: lamenessRes.rows.length, scores: lamenessRes.rows },
    });
  }

  return insights;
}
