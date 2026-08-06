-- AI Farm Advisor: Intelligent insights engine for proactive dairy management
-- This module transforms raw farm data into actionable recommendations, warnings, and predictions.

-- Core insights table: stores every AI-generated piece of intelligence
CREATE TABLE ai_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('recommendation', 'warning', 'prediction', 'action_plan', 'alert')),
    category TEXT NOT NULL CHECK (category IN ('health', 'milk_production', 'feed_nutrition', 'breeding', 'financial', 'infrastructure', 'team_management', 'sustainability', 'general')),
    severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    priority INTEGER NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 5),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    action_items JSONB DEFAULT '[]'::jsonb,
    related_cow_id UUID REFERENCES cows(id) ON DELETE SET NULL,
    confidence_score NUMERIC(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'in_progress', 'resolved', 'dismissed')),
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Actionable tasks derived from insights, assignable to team members
CREATE TABLE ai_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    insight_id UUID NOT NULL REFERENCES ai_insights(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    assigned_to UUID REFERENCES employees(id) ON DELETE SET NULL,
    due_date DATE,
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tracks each AI analysis run for debugging, auditing, and performance optimization
CREATE TABLE ai_analysis_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    analysis_type TEXT NOT NULL CHECK (analysis_type IN ('full_analysis', 'daily_action_plan', 'chat', 'manual')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    insights_generated INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    error TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX ai_insights_farm_created_idx ON ai_insights(farm_id, created_at DESC);
CREATE INDEX ai_insights_status_idx ON ai_insights(farm_id, status);
CREATE INDEX ai_insights_category_idx ON ai_insights(farm_id, category);
CREATE INDEX ai_insights_severity_idx ON ai_insights(farm_id, severity);
CREATE INDEX ai_insights_type_idx ON ai_insights(farm_id, type);

CREATE INDEX ai_actions_farm_status_idx ON ai_actions(farm_id, status);
CREATE INDEX ai_actions_insight_idx ON ai_actions(insight_id);
CREATE INDEX ai_actions_due_date_idx ON ai_actions(farm_id, due_date);

CREATE INDEX ai_analysis_logs_farm_started_idx ON ai_analysis_logs(farm_id, started_at DESC);
