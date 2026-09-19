-- M2 adds an authoritative PostgreSQL ledger that also serves as the transactional outbox.
-- Existing rows, IDs, canonical keys, measurements and M1 migration checksums are unchanged.
CREATE TABLE public.background_jobs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    queue text NOT NULL,
    kind text NOT NULL,
    job_key text NOT NULL,
    payload jsonb NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    attempts integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 3,
    available_at timestamp with time zone NOT NULL DEFAULT now(),
    lease_token uuid,
    leased_until timestamp with time zone,
    result jsonb,
    last_error_code text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    site_id uuid,
    correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
    CONSTRAINT background_jobs_job_key_unique UNIQUE (job_key),
    CONSTRAINT background_jobs_site_id_sites_id_fk FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE SET NULL,
    CONSTRAINT background_jobs_status_valid CHECK (status IN ('pending', 'queued', 'running', 'succeeded', 'failed', 'cancelled')),
    CONSTRAINT background_jobs_attempts_valid CHECK (attempts >= 0 AND max_attempts >= 1),
    CONSTRAINT background_jobs_lease_pair CHECK ((lease_token IS NULL) = (leased_until IS NULL)),
    CONSTRAINT background_jobs_payload_object CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT background_jobs_result_object CHECK (result IS NULL OR jsonb_typeof(result) = 'object')
);

CREATE TABLE public.job_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id uuid NOT NULL,
    event text NOT NULL,
    actor text NOT NULL,
    attempt integer NOT NULL DEFAULT 0,
    error_code text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT job_events_job_id_background_jobs_id_fk FOREIGN KEY (job_id) REFERENCES public.background_jobs(id) ON DELETE CASCADE,
    CONSTRAINT job_events_attempt_valid CHECK (attempt >= 0)
);

CREATE INDEX background_jobs_status_available_idx ON public.background_jobs (status, available_at);
CREATE INDEX background_jobs_leased_until_idx ON public.background_jobs (leased_until);
CREATE INDEX background_jobs_site_id_idx ON public.background_jobs (site_id);
CREATE INDEX job_events_job_created_idx ON public.job_events (job_id, created_at);

CREATE TABLE public.provider_usage (
    day date NOT NULL,
    provider text NOT NULL,
    used integer NOT NULL DEFAULT 0,
    CONSTRAINT provider_usage_day_provider_pk PRIMARY KEY (day, provider),
    CONSTRAINT provider_usage_used_valid CHECK (used >= 0)
);

ALTER TABLE public.speed_tests ADD COLUMN background_job_id uuid;
ALTER TABLE public.speed_tests ADD CONSTRAINT speed_tests_background_job_id_unique UNIQUE (background_job_id);
ALTER TABLE public.speed_tests ADD CONSTRAINT speed_tests_background_job_id_background_jobs_id_fk
    FOREIGN KEY (background_job_id) REFERENCES public.background_jobs(id);

REVOKE ALL ON public.background_jobs, public.job_events, public.provider_usage FROM PUBLIC;
