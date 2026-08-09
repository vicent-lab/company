import { query } from '../../db/index.js';
import { FarmKnowledgeEngine } from '../knowledge/farm-data.js';
import { type AgentResult } from './types.js';

export class EmployeeAgent {
  constructor(private knowledge: FarmKnowledgeEngine) {}

  async analyze(question: string): Promise<AgentResult> {
    const [attendance, taskStats, performance] = await Promise.all([
      this.knowledge.getEmployeeAnalysis(),
      query(`SELECT count(*)::int AS pending FROM tasks WHERE farm_id=$1 AND status='pending'`, [this.knowledge['farmId']]),
      query(`SELECT e.user_id, u.name, COUNT(t.id) AS tasks_assigned, COUNT(t.id) FILTER (WHERE t.status='completed') AS tasks_completed FROM employees e JOIN users u ON u.id=e.user_id LEFT JOIN tasks t ON t.assigned_to=e.id AND t.created_at >= CURRENT_DATE - INTERVAL '30 days' WHERE e.farm_id=$1 GROUP BY e.user_id, u.name ORDER BY tasks_completed DESC LIMIT 10`, [this.knowledge['farmId']]),
    ]);

    const evidence: string[] = [];
    const reasoning: string[] = [];
    const recommendedActions: string[] = [];
    const risksList: string[] = [];

    evidence.push(`Attendance records (7 days): ${attendance.attendance?.length || 0}`);
    evidence.push(`Task completions (7 days): ${taskStats.rows[0]?.pending || 0} pending`);
    evidence.push(`Performance tracked: ${performance.rows.length} employees`);

    const taskLeaders = performance.rows.slice(0, 3);
    if (taskLeaders.length > 0) {
      evidence.push(`Top performers: ${taskLeaders.map((t: any) => `${t.name} (${t.tasks_completed}/${t.tasks_assigned})`).join(', ')}`);
    }

    const absentRecent = (attendance.attendance || []).filter((a: any) => a.status === 'absent' || a.status === 'late');
    if (absentRecent.length > 0) {
      risksList.push(`${absentRecent.length} absence/late records in last 7 days`);
      reasoning.push('Attendance issues may affect farm operations');
      recommendedActions.push('Review attendance patterns');
      recommendedActions.push('Address attendance concerns with team');
    }

    if ((taskStats.rows[0]?.pending || 0) > 10) {
      risksList.push(`High pending task count: ${taskStats.rows[0]?.pending}`);
      recommendedActions.push('Prioritize and redistribute pending tasks');
      recommendedActions.push('Review workload allocation');
    }

    const lowPerformers = performance.rows.filter((p: any) => p.tasks_assigned > 0 && p.tasks_completed / p.tasks_assigned < 0.5);
    if (lowPerformers.length > 0) {
      risksList.push(`${lowPerformers.length} employee(s) with low task completion rate`);
      recommendedActions.push('Review workload and support for low-performing employees');
    }

    const severity = absentRecent.length > 3 ? 'high' : absentRecent.length > 0 ? 'medium' : lowPerformers.length > 2 ? 'medium' : 'low';
    const confidence = Math.min(0.9, 0.7 + (attendance.attendance?.length || 0) * 0.01);

    return {
      agent: 'employee',
      title: `Team performance: ${attendance.attendance?.length || 0} attendance records, ${taskStats.rows[0]?.pending || 0} pending tasks`,
      summary: absentRecent.length > 0
        ? `${absentRecent.length} attendance issues detected. Review team workload.`
        : `Team performance stable. ${taskStats.rows[0]?.pending || 0} tasks pending.`,
      severity,
      confidence,
      evidence,
      reasoning,
      risks: risksList,
      recommended_actions: recommendedActions.length ? recommendedActions : ['Continue current team management'],
      expected_outcome: 'Effective team management ensures consistent farm operations and task completion.',
      data: { attendance, taskStats: taskStats.rows[0], performance: performance.rows },
    };
  }
}
