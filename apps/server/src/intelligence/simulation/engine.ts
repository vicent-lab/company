import { FarmKnowledgeEngine } from '../knowledge/farm-data.js';

export interface SimulationResult {
  scenario: string;
  current_state: Record<string, any>;
  projected_state: Record<string, any>;
  impacts: Array<{ metric: string; change: string; description: string }>;
  recommendations: string[];
  confidence: number;
}

export class SimulationEngine {
  constructor(private knowledge: FarmKnowledgeEngine) {}

  async simulate(scenario: string, params: Record<string, any>): Promise<SimulationResult> {
    const overview = await this.knowledge.getOverview();
    const finance = await this.knowledge.getFinancialAnalysis();

    switch (scenario) {
      case 'feed_reduction':
        return this.simulateFeedReduction(overview, finance, params);
      case 'heat_stress':
        return this.simulateHeatStress(overview, finance, params);
      case 'disease_outbreak':
        return this.simulateDiseaseOutbreak(overview, finance, params);
      case 'add_cows':
        return this.simulateAddCows(overview, finance, params);
      default:
        return this.simulateGeneric(overview, finance, params);
    }
  }

  private simulateFeedReduction(overview: any, finance: any, params: Record<string, any>): SimulationResult {
    const reduction = Number(params.reduction_pct || 10);
    const currentFeedCost = finance.expense_breakdown?.find((e: any) => e.category.toLowerCase().includes('feed'))?.total || finance.expenses * 0.4;
    const projectedFeedCost = currentFeedCost * (1 - reduction / 100);
    const milkLoss = overview.milking_cows * 0.5 * reduction / 100;
    const revenueLoss = milkLoss * 30 * 0.4;

    return {
      scenario: 'feed_reduction',
      current_state: { feed_cost: currentFeedCost, milk_production: overview.today_milk_liters },
      projected_state: { feed_cost: projectedFeedCost, milk_production: Math.max(0, overview.today_milk_liters - milkLoss) },
      impacts: [
        { metric: 'Monthly feed cost', change: `-${reduction}%`, description: `From ${currentFeedCost.toFixed(2)} to ${projectedFeedCost.toFixed(2)}` },
        { metric: 'Estimated milk loss', change: `-${milkLoss.toFixed(1)} L/day`, description: 'Reduced feed intake affects yield' },
        { metric: 'Revenue impact', change: `-${revenueLoss.toFixed(2)}/month`, description: 'Lost milk sales from reduced production' },
      ],
      recommendations: [
        'Gradually reduce expensive feed components',
        'Monitor milk yield closely during transition',
        'Ensure minimum nutritional requirements are met',
        'Consider alternative feed sources',
      ],
      confidence: 0.7,
    };
  }

  private simulateHeatStress(overview: any, finance: any, params: Record<string, any>): SimulationResult {
    const days = Number(params.days || 3);
    const milkLoss = overview.milking_cows * 2 * days;
    const revenueLoss = milkLoss * 30 * 0.4;
    const coolingCost = 500 * days;

    return {
      scenario: 'heat_stress',
      current_state: { milk_production: overview.today_milk_liters, thi: overview.current_thi },
      projected_state: { milk_production: Math.max(0, overview.today_milk_liters - milkLoss), cooling_cost: coolingCost },
      impacts: [
        { metric: 'Milk production loss', change: `-${milkLoss.toFixed(1)} L over ${days} days`, description: 'Heat stress reduces feed intake and milk yield' },
        { metric: 'Revenue loss', change: `-${revenueLoss.toFixed(2)}`, description: 'Lost milk sales during heat event' },
        { metric: 'Cooling costs', change: `+${coolingCost.toFixed(2)}`, description: 'Additional cooling measures' },
      ],
      recommendations: [
        'Install shade structures',
        'Increase water availability',
        'Feed during cooler hours',
        'Consider cooling systems for long-term',
      ],
      confidence: 0.8,
    };
  }

  private simulateDiseaseOutbreak(overview: any, finance: any, params: Record<string, any>): SimulationResult {
    const affected = Number(params.affected_cows || 5);
    const treatmentCost = affected * 150;
    const milkLoss = affected * 10 * 14;
    const revenueLoss = milkLoss * 30 * 0.4;

    return {
      scenario: 'disease_outbreak',
      current_state: { sick_cows: overview.sick_cows, milk_production: overview.today_milk_liters },
      projected_state: { sick_cows: overview.sick_cows + affected, milk_production: Math.max(0, overview.today_milk_liters - milkLoss / 14) },
      impacts: [
        { metric: 'Affected cows', change: `+${affected}`, description: 'Estimated number of cows affected' },
        { metric: 'Treatment cost', change: `+${treatmentCost.toFixed(2)}`, description: 'Vet visits, medication' },
        { metric: 'Milk loss', change: `-${milkLoss.toFixed(1)} L`, description: 'During 2-week outbreak' },
        { metric: 'Revenue loss', change: `-${revenueLoss.toFixed(2)}`, description: 'Lost milk sales' },
      ],
      recommendations: [
        'Isolate affected animals immediately',
        'Contact veterinarian for diagnosis',
        'Review biosecurity protocols',
        'Monitor all herd members for symptoms',
      ],
      confidence: 0.75,
    };
  }

  private simulateAddCows(overview: any, finance: any, params: Record<string, any>): SimulationResult {
    const newCows = Number(params.count || 10);
    const additionalFeed = newCows * 25;
    const additionalMilk = newCows * 15;
    const additionalRevenue = additionalMilk * 30 * 0.4;
    const additionalCost = additionalFeed * 0.3 + newCows * 500;

    return {
      scenario: 'add_cows',
      current_state: { total_cows: overview.total_cows, milk_production: overview.today_milk_liters },
      projected_state: { total_cows: overview.total_cows + newCows, milk_production: overview.today_milk_liters + additionalMilk },
      impacts: [
        { metric: 'Herd size', change: `+${newCows}`, description: `From ${overview.total_cows} to ${overview.total_cows + newCows}` },
        { metric: 'Additional milk', change: `+${additionalMilk.toFixed(1)} L/day`, description: 'At average 15 L/cow/day' },
        { metric: 'Additional revenue', change: `+${additionalRevenue.toFixed(2)}/month`, description: 'Estimated additional milk sales' },
        { metric: 'Additional cost', change: `+${additionalCost.toFixed(2)}/month`, description: 'Feed and infrastructure costs' },
      ],
      recommendations: [
        'Ensure barn capacity for additional cows',
        'Increase feed inventory',
        'Plan for additional labor needs',
        'Consider phased introduction to manage risk',
      ],
      confidence: 0.7,
    };
  }

  private simulateGeneric(overview: any, finance: any, params: Record<string, any>): SimulationResult {
    return {
      scenario: 'generic',
      current_state: { total_cows: overview.total_cows, milk_production: overview.today_milk_liters },
      projected_state: { total_cows: overview.total_cows, milk_production: overview.today_milk_liters },
      impacts: [
        { metric: 'Scenario', change: 'Custom', description: 'Run specific scenario for detailed analysis' },
      ],
      recommendations: ['Specify scenario parameters for accurate simulation'],
      confidence: 0.5,
    };
  }
}
