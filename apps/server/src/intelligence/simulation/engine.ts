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
      case 'milk_price_fall':
        return this.simulateMilkPriceFall(overview, finance, params);
      case 'feed_price_increase':
        return this.simulateFeedPriceIncrease(overview, finance, params);
      case 'rainfall_decrease':
        return this.simulateRainfallDecrease(overview, finance, params);
      case 'hire_workers':
        return this.simulateHireWorkers(overview, finance, params);
      case 'remove_cows':
        return this.simulateRemoveCows(overview, finance, params);
      case 'heat_wave':
        return this.simulateHeatWave(overview, finance, params);
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

  private simulateMilkPriceFall(overview: any, finance: any, params: Record<string, any>): SimulationResult {
    const priceDrop = Number(params.price_drop_pct || 20);
    const currentRevenue = finance.income;
    const projectedRevenue = currentRevenue * (1 - priceDrop / 100);
    const revenueLoss = currentRevenue - projectedRevenue;

    return {
      scenario: 'milk_price_fall',
      current_state: { revenue: currentRevenue, profit: finance.net_profit },
      projected_state: { revenue: projectedRevenue, profit: finance.net_profit - revenueLoss },
      impacts: [
        { metric: 'Monthly revenue', change: `-${priceDrop}%`, description: `From ${currentRevenue.toFixed(2)} to ${projectedRevenue.toFixed(2)}` },
        { metric: 'Profit impact', change: `-${revenueLoss.toFixed(2)}`, description: 'Direct impact on bottom line' },
        { metric: 'Margin impact', change: `-${(priceDrop * 0.5).toFixed(1)}%`, description: 'Estimated margin compression' },
      ],
      recommendations: [
        'Negotiate better prices or find premium markets',
        'Reduce variable costs to maintain margin',
        'Diversify income sources',
        'Review herd efficiency to lower production costs',
      ],
      confidence: 0.75,
    };
  }

  private simulateFeedPriceIncrease(overview: any, finance: any, params: Record<string, any>): SimulationResult {
    const priceIncrease = Number(params.price_increase_pct || 25);
    const currentFeedCost = finance.expense_breakdown?.find((e: any) => e.category.toLowerCase().includes('feed'))?.total || finance.expenses * 0.4;
    const projectedFeedCost = currentFeedCost * (1 + priceIncrease / 100);
    const costIncrease = projectedFeedCost - currentFeedCost;
    const profitImpact = finance.net_profit - costIncrease;

    return {
      scenario: 'feed_price_increase',
      current_state: { feed_cost: currentFeedCost, profit: finance.net_profit },
      projected_state: { feed_cost: projectedFeedCost, profit: profitImpact },
      impacts: [
        { metric: 'Monthly feed cost', change: `+${priceIncrease}%`, description: `From ${currentFeedCost.toFixed(2)} to ${projectedFeedCost.toFixed(2)}` },
        { metric: 'Profit impact', change: `-${costIncrease.toFixed(2)}`, description: 'Direct hit to profitability' },
        { metric: 'Margin compression', change: `-${(priceIncrease * 0.3).toFixed(1)}%`, description: 'Estimated margin reduction' },
      ],
      recommendations: [
        'Lock in feed prices with forward contracts',
        'Increase on-farm feed production',
        'Review feed efficiency and reduce wastage',
        'Consider alternative feed ingredients',
      ],
      confidence: 0.75,
    };
  }

  private simulateRainfallDecrease(overview: any, finance: any, params: Record<string, any>): SimulationResult {
    const decrease = Number(params.rainfall_decrease_pct || 30);
    const waterCostIncrease = finance.expenses * 0.02 * (decrease / 100);
    const feedCostIncrease = finance.expenses * 0.05 * (decrease / 100);
    const totalCostIncrease = waterCostIncrease + feedCostIncrease;

    return {
      scenario: 'rainfall_decrease',
      current_state: { water_availability: 'normal', feed_costs: finance.expenses * 0.4 },
      projected_state: { water_availability: 'reduced', feed_costs: finance.expenses * 0.4 + feedCostIncrease },
      impacts: [
        { metric: 'Water costs', change: `+${(waterCostIncrease / finance.expenses * 100).toFixed(1)}%`, description: 'Increased irrigation and water purchase' },
        { metric: 'Feed costs', change: `+${(feedCostIncrease / finance.expenses * 100).toFixed(1)}%`, description: 'Lower pasture availability increases feed needs' },
        { metric: 'Total cost increase', change: `+${totalCostIncrease.toFixed(2)}/month`, description: 'Combined impact of drought conditions' },
      ],
      recommendations: [
        'Invest in water storage and rain harvesting',
        'Diversify feed sources and increase inventory',
        'Review grazing rotation for drought resilience',
        'Consider drought-resistant pasture varieties',
      ],
      confidence: 0.7,
    };
  }

  private simulateHireWorkers(overview: any, finance: any, params: Record<string, any>): SimulationResult {
    const workers = Number(params.worker_count || 2);
    const monthlySalary = 300;
    const additionalCost = workers * monthlySalary;
    const laborImprovement = 0.1;
    const efficiencyGain = overview.today_milk_liters * laborImprovement;
    const revenueGain = efficiencyGain * 30 * 0.4;

    return {
      scenario: 'hire_workers',
      current_state: { labor_count: 'current', milk_production: overview.today_milk_liters },
      projected_state: { labor_count: `+${workers}`, milk_production: overview.today_milk_liters + efficiencyGain },
      impacts: [
        { metric: 'Labor cost', change: `+${additionalCost.toFixed(2)}/month`, description: `${workers} new workers at ${monthlySalary}/month each` },
        { metric: 'Efficiency gain', change: `+${(laborImprovement * 100).toFixed(0)}%`, description: 'Improved task completion and care' },
        { metric: 'Revenue gain', change: `+${revenueGain.toFixed(2)}/month`, description: 'From improved milk production' },
        { metric: 'Net impact', change: `${(revenueGain - additionalCost) >= 0 ? '+' : ''}${(revenueGain - additionalCost).toFixed(2)}`, description: revenueGain > additionalCost ? 'Positive ROI expected' : 'Evaluate ROI carefully' },
      ],
      recommendations: [
        'Hire experienced dairy workers',
        'Invest in training for new staff',
        'Ensure adequate supervision and tools',
        'Track productivity to validate ROI',
      ],
      confidence: 0.7,
    };
  }

  private simulateRemoveCows(overview: any, finance: any, params: Record<string, any>): SimulationResult {
    const removeCount = Number(params.count || 5);
    const removedFeed = removeCount * 25;
    const removedMilk = removeCount * 15;
    const costSavings = removedFeed * 0.3;
    const revenueLoss = removedMilk * 30 * 0.4;
    const netImpact = costSavings - revenueLoss;

    return {
      scenario: 'remove_cows',
      current_state: { total_cows: overview.total_cows, milk_production: overview.today_milk_liters },
      projected_state: { total_cows: overview.total_cows - removeCount, milk_production: Math.max(0, overview.today_milk_liters - removedMilk) },
      impacts: [
        { metric: 'Herd size', change: `-${removeCount}`, description: `From ${overview.total_cows} to ${overview.total_cows - removeCount}` },
        { metric: 'Feed savings', change: `-${costSavings.toFixed(2)}/month`, description: 'Reduced feed costs' },
        { metric: 'Revenue loss', change: `-${revenueLoss.toFixed(2)}/month`, description: 'Lost milk production' },
        { metric: 'Net impact', change: `${netImpact >= 0 ? '+' : ''}${netImpact.toFixed(2)}`, description: netImpact >= 0 ? 'Cost savings exceed revenue loss' : 'Revenue loss exceeds savings' },
      ],
      recommendations: [
        'Remove low-producing or sick cows first',
        'Review culling criteria with veterinarian',
        'Consider selling vs. culling for value',
        'Monitor remaining herd performance',
      ],
      confidence: 0.7,
    };
  }

  private simulateHeatWave(overview: any, finance: any, params: Record<string, any>): SimulationResult {
    const days = Number(params.days || 7);
    const milkLoss = overview.milking_cows * 3 * days;
    const revenueLoss = milkLoss * 30 * 0.4;
    const coolingCost = 2000;
    const mortalityRisk = overview.total_cows * 0.01;

    return {
      scenario: 'heat_wave',
      current_state: { milk_production: overview.today_milk_liters, herd_health: 'normal' },
      projected_state: { milk_production: Math.max(0, overview.today_milk_liters - milkLoss / days), herd_health: 'stressed' },
      impacts: [
        { metric: 'Milk production loss', change: `-${milkLoss.toFixed(1)} L over ${days} days`, description: 'Severe heat reduces feed intake and milk yield' },
        { metric: 'Revenue loss', change: `-${revenueLoss.toFixed(2)}`, description: 'Lost milk sales during heat wave' },
        { metric: 'Cooling investment', change: `+${coolingCost.toFixed(2)}`, description: 'Emergency cooling measures' },
        { metric: 'Mortality risk', change: `${(mortalityRisk * 100).toFixed(1)}%`, description: 'Extreme heat can cause fatalities' },
      ],
      recommendations: [
        'Activate emergency cooling protocols immediately',
        'Increase water points and cooling systems',
        'Cancel non-essential outdoor activities',
        'Monitor for heat stroke and provide veterinary standby',
        'Consider temporary herd relocation if possible',
      ],
      confidence: 0.85,
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
