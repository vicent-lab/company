-- Continuous learning: close the loop between "farmer followed advice" and outcomes

ALTER TABLE ai_learning_events ADD COLUMN advice_followed BOOLEAN;

ALTER TABLE ai_insights ADD COLUMN actions_completed_at TIMESTAMPTZ;
ALTER TABLE ai_insights ADD COLUMN follow_up_due_at TIMESTAMPTZ;
ALTER TABLE ai_insights ADD COLUMN follow_up_checked_at TIMESTAMPTZ;

CREATE INDEX ai_insights_follow_up_due_idx ON ai_insights(follow_up_due_at) WHERE follow_up_checked_at IS NULL;

-- Widen analysis_type: 'multi_intelligence_fusion' is already inserted by the fusion analyze
-- route but was missing from this constraint; 'continuous_learning_cycle' backs the new
-- scheduled learning job.
ALTER TABLE ai_analysis_logs DROP CONSTRAINT ai_analysis_logs_analysis_type_check;
ALTER TABLE ai_analysis_logs ADD CONSTRAINT ai_analysis_logs_analysis_type_check
  CHECK (analysis_type IN ('full_analysis', 'daily_action_plan', 'chat', 'manual', 'multi_intelligence_fusion', 'continuous_learning_cycle'));
