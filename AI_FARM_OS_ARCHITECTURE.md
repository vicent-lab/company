# AI Farm OS — Complete Architecture

## Current State Audit
- Existing AI: `apps/server/src/ai/` — farm-score, predictions, weather, fusion, qa-answers, daily-advice, learning
- New intelligence layer: `apps/server/src/intelligence/` — knowledge engine, reasoning, conversation, alerts, briefing
- Chat route: `apps/server/src/routes/ai-advisor.ts` `/chat` fallback now delegates to `IntelligenceConversationEngine`
- Frontend intelligence page: `apps/web/src/pages/intelligence.tsx` currently calls `/intelligence/chat` (needs alignment)

## Design Principles
1. Specialized agents over one generalist
2. Real farm data first, domain knowledge second
3. Explain everything: evidence, confidence, reasoning, risks, expected outcome
4. Every answer must help the farmer make a better decision today
5. Proactive over reactive
6. Multi-modal output: text + structured cards + charts

## Target Architecture

```
IntelligenceGateway
  ├── MasterOrchestrator
  │     ├── HealthAgent
  │     ├── NutritionAgent
  │     ├── MilkProductionAgent
  │     ├── BreedingAgent
  │     ├── FinanceAgent
  │     ├── WeatherAgent
  │     ├── InventoryAgent
  │     ├── EmployeeAgent
  │     ├── EquipmentAgent
  │     ├── SustainabilityAgent
  │     ├── ComplianceAgent
  │     └── EmergencyResponseAgent
  ├── ReasoningEngine (10-step)
  ├── MemoryEngine
  ├── PredictionEngine
  ├── SimulationEngine
  ├── LearningEngine
  └── ConversationEngine
```

## Implementation Plan
- Phase 1: Master orchestrator + specialized agents
- Phase 2: Enhanced reasoning + memory
- Phase 3: Prediction + simulation
- Phase 4: Learning + feedback loops
- Phase 5: Rich UI with cards, charts, gauges
- Phase 6: Proactive daily briefing + alerts
- Phase 7: Voice + image analysis
- Phase 8: Offline support + sync
