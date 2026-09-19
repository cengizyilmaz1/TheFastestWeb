-- M1 preserves every historical ID, URL, ownership link and measurement.
ALTER TABLE public.sites ADD COLUMN normalized_url text;
-- The guarded runner preserves legacy duplicates, backfills canonical URLs, then sets NOT NULL.
-- New submissions serialize on the canonical URL advisory lock before checking this index.
ALTER TABLE public.speed_tests
    ADD COLUMN methodology_version text NOT NULL DEFAULT 'legacy-unspecified';

CREATE TABLE public.verified_speed_tests (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    normalized_url text NOT NULL,
    strategy public.strategy NOT NULL,
    job_id uuid NOT NULL,
    result jsonb NOT NULL,
    methodology_version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    site_id uuid,
    CONSTRAINT verified_speed_tests_job_id_unique UNIQUE (job_id),
    CONSTRAINT verified_speed_tests_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id),
    CONSTRAINT verified_speed_tests_site_id_sites_id_fk FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE SET NULL,
    CONSTRAINT verified_speed_tests_result_object CHECK (jsonb_typeof(result) = 'object'),
    CONSTRAINT verified_speed_tests_expiry_order CHECK (expires_at > created_at)
);

CREATE TABLE public.request_rate_limits (
    key text PRIMARY KEY,
    window_started_at timestamp with time zone NOT NULL,
    count integer NOT NULL,
    CONSTRAINT request_rate_limits_positive_count CHECK (count > 0)
);

CREATE INDEX sites_owner_id_idx ON public.sites (owner_id);
CREATE INDEX sites_normalized_url_idx ON public.sites (normalized_url);
CREATE INDEX sites_leaderboard_idx ON public.sites (is_listed, current_score DESC, created_at);
CREATE INDEX speed_tests_site_tested_idx ON public.speed_tests (site_id, tested_at DESC);
CREATE INDEX payments_user_id_idx ON public.payments (user_id);
CREATE INDEX payments_site_id_idx ON public.payments (site_id);
CREATE INDEX ad_slots_user_id_idx ON public.ad_slots (user_id);
CREATE INDEX ad_clicks_slot_clicked_idx ON public.ad_clicks (ad_slot_id, clicked_at DESC);
CREATE INDEX verified_speed_tests_user_created_idx ON public.verified_speed_tests (user_id, created_at DESC);
CREATE INDEX verified_speed_tests_expires_idx ON public.verified_speed_tests (expires_at);
CREATE INDEX verified_speed_tests_site_id_idx ON public.verified_speed_tests (site_id);
CREATE INDEX request_rate_limits_window_idx ON public.request_rate_limits (window_started_at);

-- Auth.js and server authorization own access checks. This database is never public-facing.
-- The imported RLS-enabled tables have no policies; a non-owner app role otherwise sees no rows.
ALTER TABLE public.ad_clicks DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_slots DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cron_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.speed_checks DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.speed_tests DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- Named role grants are deployment-specific and documented in docs/DATABASE.md.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
