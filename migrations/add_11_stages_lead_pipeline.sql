-- ==============================================================================
-- FORMA APPARELS CRM: 11-STAGE LEAD PIPELINE & RELATIONAL ACTIVITY SYSTEM
-- Target: PostgreSQL / Supabase
-- Safety: Completely Idempotent (IF NOT EXISTS), Zero Data Loss
-- ==============================================================================

-- 1. Extend public.leads table with stage attributes
ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS area TEXT,
    ADD COLUMN IF NOT EXISTS google_maps_link TEXT,
    ADD COLUMN IF NOT EXISTS is_cold BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS response TEXT,
    ADD COLUMN IF NOT EXISTS response_type TEXT,
    ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'BRANCH', -- 'HQ' or 'BRANCH'
    ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES public.organizations(id) ON DELETE SET NULL;

-- 2. Performance indexes for lead stage filtering
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_branch_id ON public.leads(branch_id);
CREATE INDEX IF NOT EXISTS idx_leads_organization_id ON public.leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_leads_is_cold ON public.leads(is_cold);

-- 3. Create public.lead_stage_history table (Tracks every stage entered and exited)
CREATE TABLE IF NOT EXISTS public.lead_stage_history (
    id BIGSERIAL PRIMARY KEY,
    lead_id BIGINT REFERENCES public.leads(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    exited_at TIMESTAMPTZ,
    transition_reason TEXT,
    performed_by BIGINT REFERENCES public.employees(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_lead_stage_history_lead ON public.lead_stage_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_stage_history_stage ON public.lead_stage_history(stage);
CREATE INDEX IF NOT EXISTS idx_lead_stage_history_entered ON public.lead_stage_history(entered_at DESC);

-- 4. Create public.lead_activities table (Relational stage-specific logs)
CREATE TABLE IF NOT EXISTS public.lead_activities (
    id BIGSERIAL PRIMARY KEY,
    lead_id BIGINT REFERENCES public.leads(id) ON DELETE CASCADE,
    stage TEXT NOT NULL, -- Canonical stage at the moment this activity happened
    activity_type TEXT NOT NULL, -- 'contact_note', 'feed_outcome', 'followup_log', 'meeting_outcome', 'stage_change'
    performed_by BIGINT REFERENCES public.employees(id) ON DELETE SET NULL,
    performed_by_name TEXT,
    performed_by_emp_id TEXT,
    performed_by_designation TEXT,
    performed_by_dept TEXT,
    notes TEXT,
    response_type TEXT, -- 'positive', 'negative', 'hold', 'approved', 'rejected'
    outcome TEXT,
    metadata JSONB DEFAULT '{}'::jsonb, -- Explicitly sanitized, no plain passwords
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON public.lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_stage ON public.lead_activities(lead_id, stage);
CREATE INDEX IF NOT EXISTS idx_lead_activities_created ON public.lead_activities(created_at DESC);

-- 5. Enable Row Level Security (RLS) & Policies
ALTER TABLE public.lead_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read for lead_stage_history" ON public.lead_stage_history;
CREATE POLICY "Allow public read for lead_stage_history" ON public.lead_stage_history FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all operations for lead_stage_history" ON public.lead_stage_history;
CREATE POLICY "Allow all operations for lead_stage_history" ON public.lead_stage_history FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read for lead_activities" ON public.lead_activities;
CREATE POLICY "Allow public read for lead_activities" ON public.lead_activities FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all operations for lead_activities" ON public.lead_activities;
CREATE POLICY "Allow all operations for lead_activities" ON public.lead_activities FOR ALL USING (true);

-- 6. Grant Permissions
GRANT ALL ON TABLE public.lead_stage_history TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.lead_activities TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 7. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
