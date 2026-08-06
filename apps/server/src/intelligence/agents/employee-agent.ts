import { query } from '../../db/index.js';
import { FarmKnowledgeEngine } from '../knowledge/farm-data.js';
import { type AgentResult } from './types.js';

export class EmployeeAgent {
  constructor(private knowledge: FarmKnowledgeEngine) {}

  async analyze(question: string): Promise<AgentResult> {
    const [attendance, taskStats] = await Promise.all([
      this.knowledge.getEmployeeAnalysis(),
      query(`SELECT count(*)::int AS total FROM tasks WHERE farm_id=$1 AND status='pending'`, [this.knowledge['farmId']]),
    ]);

    const evidence: string[] = [];
    const reasoning: string[] = [];
    const recommendedActions: string[] = [];
    const risks: string[] = [];

    evidence.push(`Attendance records (7 days): ${attendance.attendance?.length || 0}`);
    evidence.push(`Task completions (7 days): ${taskStats.rows[0]?.total || 0} pending`);

    const taskLeaders = (attendance.tasks || []).slice(0, 3);
    if (taskLeaders.length > 0) {
      evidence.push(`Top performers: ${taskLeaders.map((t: any) => `${t.name} (${t.task_count} tasks, ${t.completed} completed)`).join(', ')}`);
    }

    const absentRecent = (attendance.attendance || []).filter((a: any) => a.status === 'absent' || a.status === 'late');
    if (absentRecent.length > 0) {
      risks.push(`${absentRecent.length} absence/late records in last 7 days`);
      reasoning.push('Attendance issues may affect farm operations');
      recommendedActions.push('Review attendance patterns');
      recommendedActions.push('Address attendance concerns with team');
    }

    if ((taskStats.rows[0]?.total || 0) > 10) {
      risks.push(`High pending task count: ${taskStats.rows[0]?.total}`);
      recommendedActions.push('Prioritize and redistribute pending tasks');
      recommendedActions.push('Review workload allocation');
    }

    const severity = absentRecent.length > 3 ? 'high' : absentRecent.length > 0 ? 'medium' : 'low';
    const confidence = Math.min(0.9, 0.7 + (attendance.attendance?.length || 0) * 0.01);

    return {
      agent: 'employee',
      title: `Team performance: ${attendance.attendance?.length || 0} attendance records, ${taskStats.rows[0]?.total || 0} pending tasks`,
      summary: absentRecent.length > 0
        ? `${absentRecent.length} attendance issues detected. Review team workload.`
        : `Team performance stable. ${taskStats.rows[0]?.total || 0} tasks pending.`,
      severity,
      confidence,
      evidence,
      reasoning,
      risks,
      recommended_actions: recommendedActions.length ? recommendedActions : ['Continue current team management'],
      expected_outcome: 'Effective team management ensures consistent farm operations and task completion.',
      data: { attendance, taskStats: taskStats.rows[0] },
    };
  }
}
