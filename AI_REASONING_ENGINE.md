# AI Reasoning Engine

This is not a chatbot. The `/chat` and `/ai/ask` endpoints only summarize or answer
questions from data this engine already produced — they never generate a recommendation
themselves. The actual reasoning happens in the pipeline below, and it runs whether or
not anyone ever opens a chat window.

Nine things this engine has to do, and where each one lives in the code:

1. **Observe** farm data — §1
2. **Detect** patterns — §2
3. **Explain why patterns matter** — §4
4. **Predict** future events — §2.3
5. **Estimate confidence** — §3
6. **Recommend** actions — §5
7. **Rank** recommendations by urgency — §4.4
8. **Learn** from farmer feedback — §6
9. **Explain its reasoning in simple language** — §4

---

## 1. Observe: nine intelligence sources

`fuseIntelligence(farmId)` (`apps/server/src/ai/fusion-engine.ts`) fans nine analyzers
out in parallel, each running real SQL against the farm's own data — nothing here is
mocked or templated:

| Source | What it looks at |
|---|---|
| `rule_based` | Vaccination compliance, dry-period minimums, milk-withdrawal windows — explicit veterinary/regulatory protocols |
| `machine_learning` | Per-cow yield anomalies (z-score vs. the cow's own 30-day baseline), herd-wide declining-pattern detection |
| `predictive` | 30-day milk-production forecast (linear regression on the daily trend), feed-shortage days-remaining projection |
| `statistical` | Control-chart limits (3-sigma) on daily production, body-condition-score distribution |
| `business` | Milk-per-worker efficiency, feed cost per liter, conception rate vs. benchmark |
| `veterinary` | Fever-based mastitis risk, lameness prevalence, ketosis/acidosis detection |
| `weather` | Temperature-humidity index (heat stress), cold-stress energy demand |
| `financial` | Cash-flow margin trend, vet-spend ROI, cost per cow |
| `risk` | Composite disease-outbreak probability, cash runway, key-person dependency |

Each analyzer returns `IntelligenceSignal[]` — typed, with `source`, `signal_type`,
`confidence`, `metrics` (the real numbers), and `evidence` (the raw rows), never a bare
string.

## 2. Detect & predict

**Pattern detection** happens inside each analyzer: z-scores, control-chart breaches,
benchmark comparisons, distribution skew. **Prediction** is a distinct sub-category —
`analyzePredictive()` doesn't just flag today's state, it projects forward: a regression
slope on 30 days of milk records gives a 30-day forecast; herd composition times
per-class feed requirements, divided into current stock, gives days-until-shortage. A
signal only fires when the *projected* deviation crosses a threshold, not the current one.

Signals are grouped by the entity they concern (`groupSignals` — same cow, or
farm-wide by signal type) so that four different sources flagging the same cow become
one fused recommendation, not four separate alerts.

## 3. Confidence

`fuseGroup()` computes a weighted confidence per recommendation:

```
weighted_confidence = Σ(signal.confidence × source_weight) / Σ(source_weight)
                     + diversity_bonus × agreement_score
```

- **`source_weight`** (`getSourceWeight`) blends a fixed per-source base trust (vet
  knowledge starts higher than weather, for instance) with a *learned* override — see §6.
  A farm with little feedback history on a rule leans on the rule's accuracy across every
  other farm (a shrinkage prior); a farm with a long track record dominates its own signal.
- **`diversity_bonus`** rewards agreement across independent sources — three sources
  independently pointing at the same cow is stronger evidence than one.
- **`agreement_score`** checks whether the signals are directionally consistent (all
  "low"/"declining" vs. a mix of "low" and "high") and discounts confidence when they
  conflict.

Severity (`low`/`medium`/`high`/`critical`) is derived from this adjusted confidence,
amplified when multiple `risk`-source signals stack (`risk_amplification`).

## 4. Explain: why it matters, in simple language

This is the layer most reasoning engines skip, and it's implemented in
`apps/server/src/ai/plain-language.ts`. Every recommendation answers four questions, in
this order, with zero LLM involvement — every sentence is a template filled with real
numbers pulled from the evidence, so nothing here can state a fact the SQL didn't produce:

1. **What's happening** (`PLAIN_STATE`) — a plain-English sentence per signal type, e.g.
   *"Cow 214 produced 14.3L today, well below her usual 22.1L average."* — not
   `z_score: -2.30`.
2. **Why it matters** (`WHY_IT_MATTERS`) — the consequence if ignored, e.g. *"A sudden
   drop like this is usually an early sign of illness, heat stress, or a feed problem —
   catching it now is far cheaper than treating it once it becomes visible."*
3. **How confident** (`describeConfidence`) — *"Very confident — 3 independent checks
   agree,"* vs. *"An early signal, not yet fully confirmed."*
4. **How urgent** (§4.4) — a distinct dimension from severity.

These three (state, why-it-matters, confidence) are joined into the insight's
`description` — what the farmer actually reads. The old technical dump
(`[machine_learning] yield_anomaly_detected: z_score: -2.30, …`) still exists, but as
`metadata.technical_evidence` for anyone who wants the audit trail, not as the headline.

### 4.4 Urgency ≠ severity

A margin trending down over a quarter is `high` severity but not urgent *today*. Feed
running out in two days might only be `medium` severity but is extremely urgent.
`estimateUrgency()` scores these independently:

```
score = severity_base[severity]                              // 15–70
      + deadline_bonus                                        // scans every signal's
                                                                // metrics/evidence for a
                                                                // days_remaining / runway_days /
                                                                // days_to_* countdown; closer
                                                                // deadline = bigger bonus
      + irreversibility_bonus (+15)                            // welfare/veterinary signals,
                                                                // where delay compounds harm
```

`fuseIntelligence()`'s final sort ranks by `urgency_score` first, confidence-weighted
severity as the tie-breaker — so the top of the list is "what needs a decision soonest,"
not "what was generated most recently" or "what looks worst in isolation." The urgency
score also sets `priority` (1–5), which is what `GET /ai-advisor/insights` orders by.

## 5. Recommend actions

`buildFusedActions()` maps each `signal_type` to a curated action list (e.g.
`mastitis_risk_elevated` → *"Conduct CMT test," "Review milking hygiene protocol,"
"Isolate suspected cases"*). Actions come from a fixed library keyed by signal type, not
generated free-form — this is deliberate: it means a recommendation can never suggest
something that isn't a real, reviewed action for that situation.

## 6. Learn from farmer feedback

Two feedback paths, both persisted to `ai_calibration` / `ai_learning_events`
(`apps/server/src/ai/learning-engine.ts`):

- **Explicit** — `POST /ai-advisor/insights/:id/feedback` (👍/👎, accurate/inaccurate,
  urgent/not, free-text note) and `POST /ai-advisor/insights/:id/outcome` (did it turn
  out to be a real success/failure). Inaccurate or failed insights shrink that rule's
  weight override and can suppress it for a cooldown period.
- **Implicit** — `runContinuousLearningCycle()` (`outcome-verifier.ts`), run on a
  scheduled interval for every farm (`index.ts`): re-checks whether past predictions
  actually came true (did the forecasted decline happen? did the disease risk
  materialize?), and whether insights the farmer fully acted on (all action items
  completed) actually improved things after a follow-up window.

Both paths feed `getSourceWeight()` (§3), so a rule that's wrong often on a given farm
quietly loses influence there, and a rule that's wrong everywhere loses influence
network-wide — without anyone hand-tuning a threshold.

---

## Where this is NOT an LLM

`POST /ai-advisor/chat` and `GET /ai/ask` (`apps/server/src/routes/ai.ts`,
`apps/server/src/ai/qa-answers.ts`) are regex-based intent classifiers that either
summarize existing `ai_insights` rows or run a real DB query and return the number —
there is no LLM call anywhere in this codebase. If a "why does this matter" or "what
should I do" question ever needs a model, it should call into `plain-language.ts` and
`fusion-engine.ts` for the actual answer and, at most, use a model to rephrase — never to
originate — the recommendation. See the "ideas we killed" list from the design review:
a chat model as the source of recommendations was explicitly rejected.
