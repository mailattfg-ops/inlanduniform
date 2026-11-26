-- In-app notifications (bell icon). Written only by the backend (service role).
-- recipient_id / actor_id hold the session user id as text: a user_profiles UUID or "branch_user_<n>".

CREATE TABLE IF NOT EXISTS public.notifications (
  id           BIGSERIAL PRIMARY KEY,
  recipient_id TEXT        NOT NULL,
  type         TEXT        NOT NULL,          -- e.g. quote_submitted_bm, quote_bm_approved, deal_corp_rejected
  title        TEXT        NOT NULL,
  message      TEXT,
  link         TEXT,                          -- frontend path to open, e.g. /marketing/quotations?id=12&action=view
  entity_type  TEXT,                          -- quotation | order
  entity_id    TEXT,
  actor_id     TEXT,
  actor_name   TEXT,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bell list (newest first per user) and unread count
CREATE INDEX IF NOT EXISTS notifications_recipient_created ON public.notifications (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_recipient_unread  ON public.notifications (recipient_id) WHERE read_at IS NULL;
-- Cleanup of old read notifications
CREATE INDEX IF NOT EXISTS notifications_read_at           ON public.notifications (read_at) WHERE read_at IS NOT NULL;

-- No public policy: only the backend's service-role key can read/write
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.notifications TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.notifications_id_seq TO service_role;

NOTIFY pgrst, 'reload schema';
