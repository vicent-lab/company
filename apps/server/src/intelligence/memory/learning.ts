import { query } from '../../db/index.js';

export interface FeedbackRecord {
  insightId: string;
  helpful: boolean | null;
  accurate: boolean | null;
  urgent: boolean | null;
  note: string;
  timestamp: string;
}

export class LearningEngine {
  constructor(private farmId: string) {}

  async recordFeedback(insightId: string, feedback: Omit<FeedbackRecord, 'insightId' | 'timestamp'>) {
    await query(
      `INSERT INTO ai_feedback (farm_id, insight_id, user_id, helpful, accurate, urgent, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (farm_id, insight_id, user_id) DO UPDATE SET helpful=$4, accurate=$5, urgent=$6, note=$7, created_at=now()`,
      [this.farmId, insightId, null, feedback.helpful, feedback.accurate, feedback.urgent, feedback.note]
    );
  }

  async getLearningStats(): Promise<{ total_feedback: number; accuracy_rate: number; improvement_areas: string[] }> {
    const feedback = await query(`SELECT helpful, accurate, urgent, note FROM ai_feedback WHERE farm_id=$1 ORDER BY created_at DESC LIMIT 100`, [this.farmId]);
    const rows = feedback.rows;
    const total = rows.length;
    const accurate = rows.filter((r: any) => r.accurate === true).length;
    const accuracyRate = total > 0 ? (accurate / total) * 100 : 0;

    const improvementAreas = rows
      .filter((r: any) => r.accurate === false)
      .map((r: any) => r.note)
      .filter(Boolean);

    return { total_feedback: total, accuracy_rate: accuracyRate, improvement_areas: improvementAreas.slice(0, 10) };
  }

  async getAccuracyByCategory(): Promise<Record<string, { total: number; accurate: number; rate: number }>> {
    const result = await query(
      `SELECT i.category, f.accurate FROM ai_feedback f JOIN ai_insights i ON i.id = f.insight_id WHERE f.farm_id=$1 AND f.accurate IS NOT NULL`,
      [this.farmId]
    );

    const byCategory: Record<string, { total: number; accurate: number }> = {};
    result.rows.forEach((r: any) => {
      const cat = r.category || 'unknown';
      if (!byCategory[cat]) byCategory[cat] = { total: 0, accurate: 0 };
      byCategory[cat].total++;
      if (r.accurate) byCategory[cat].accurate++;
    });

    const output: Record<string, { total: number; accurate: number; rate: number }> = {};
    Object.entries(byCategory).forEach(([cat, stats]) => {
      output[cat] = { ...stats, rate: (stats.accurate / stats.total) * 100 };
    });

    return output;
  }
}
