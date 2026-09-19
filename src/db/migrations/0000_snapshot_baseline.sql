-- Data-free baseline reviewed against the 2026-09-19 public schema snapshot.
-- Preserve source UUIDs/history by adopting restored databases via scripts/db/migrate.ts.
-- No COPY, INSERT, original row values, ownership, credentials, or sequence state are included.

CREATE SCHEMA IF NOT EXISTS public;

CREATE TYPE public.ad_position AS ENUM (
    'left',
    'right'
);

CREATE TYPE public.category AS ENUM (
    'saas',
    'tool',
    'directory',
    'agency',
    'ecommerce',
    'blog',
    'portfolio',
    'other'
);

CREATE TYPE public.payment_status AS ENUM (
    'pending',
    'completed',
    'failed'
);

CREATE TYPE public.strategy AS ENUM (
    'mobile',
    'desktop'
);

CREATE TYPE public.tier AS ENUM (
    'free',
    'pro'
);

CREATE TABLE public.ad_clicks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ad_slot_id integer,
    ip text,
    user_agent text,
    referrer text,
    clicked_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ad_slots (
    id integer NOT NULL,
    "position" public.ad_position NOT NULL,
    order_index integer NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    tagline text NOT NULL,
    favicon_url text,
    user_id uuid,
    polar_subscription_id text,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

CREATE VIEW public.ad_clicks_with_names AS
 SELECT ac.id,
    ac.ad_slot_id,
    ads.name AS ad_name,
    ads.url AS ad_url,
    ads."position" AS ad_position,
    ac.ip,
    ac.user_agent,
    ac.referrer,
    ac.clicked_at
   FROM (public.ad_clicks ac
     LEFT JOIN public.ad_slots ads ON ((ads.id = ac.ad_slot_id)))
  ORDER BY ac.clicked_at DESC;

CREATE SEQUENCE public.ad_slots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.ad_slots_id_seq OWNED BY public.ad_slots.id;

CREATE TABLE public.cron_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    total_sites integer NOT NULL,
    tested_count integer NOT NULL,
    failed_count integer NOT NULL,
    duration_ms integer,
    results jsonb,
    error text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    site_id uuid,
    user_id uuid NOT NULL,
    polar_checkout_id text,
    amount_cents integer NOT NULL,
    status public.payment_status DEFAULT 'pending'::public.payment_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    description text NOT NULL,
    favicon_url text,
    owner_id uuid,
    owner_name text NOT NULL,
    twitter_handle text,
    tier public.tier DEFAULT 'free'::public.tier NOT NULL,
    is_listed boolean DEFAULT false NOT NULL,
    current_score integer DEFAULT 0 NOT NULL,
    current_load_time text,
    current_fcp text,
    current_lcp text,
    current_cls text,
    current_tbt text,
    current_tti text,
    current_si text,
    trend real DEFAULT 0,
    country_flag text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_tested_at timestamp with time zone,
    category public.category DEFAULT 'other'::public.category NOT NULL,
    monitoring_paused boolean DEFAULT false NOT NULL,
    requires_badge boolean DEFAULT false NOT NULL,
    badge_warning_sent_at timestamp with time zone
);

CREATE TABLE public.speed_checks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    url text NOT NULL,
    score integer,
    load_time_ms integer,
    ip text,
    user_agent text,
    strategy public.strategy DEFAULT 'mobile'::public.strategy NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.speed_tests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    site_id uuid NOT NULL,
    score integer NOT NULL,
    load_time_ms integer,
    fcp_ms integer,
    lcp_ms integer,
    cls real,
    tbt_ms integer,
    tti_ms integer,
    si_ms integer,
    raw_response jsonb,
    strategy public.strategy DEFAULT 'mobile'::public.strategy NOT NULL,
    tested_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    twitter_handle text,
    is_pro boolean DEFAULT false NOT NULL,
    last_active_at timestamp with time zone,
    grandfather_warning_sent_at timestamp with time zone
);

ALTER TABLE ONLY public.ad_slots ALTER COLUMN id SET DEFAULT nextval('public.ad_slots_id_seq'::regclass);

ALTER TABLE ONLY public.ad_clicks
    ADD CONSTRAINT ad_clicks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ad_slots
    ADD CONSTRAINT ad_slots_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.cron_logs
    ADD CONSTRAINT cron_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_slug_unique UNIQUE (slug);

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_url_unique UNIQUE (url);

ALTER TABLE ONLY public.speed_checks
    ADD CONSTRAINT speed_checks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.speed_tests
    ADD CONSTRAINT speed_tests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ad_clicks
    ADD CONSTRAINT ad_clicks_ad_slot_id_fkey FOREIGN KEY (ad_slot_id) REFERENCES public.ad_slots(id);

ALTER TABLE ONLY public.ad_slots
    ADD CONSTRAINT ad_slots_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_site_id_sites_id_fk FOREIGN KEY (site_id) REFERENCES public.sites(id);

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_owner_id_users_id_fk FOREIGN KEY (owner_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.speed_tests
    ADD CONSTRAINT speed_tests_site_id_sites_id_fk FOREIGN KEY (site_id) REFERENCES public.sites(id);

ALTER TABLE public.ad_clicks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ad_slots ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cron_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.speed_checks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.speed_tests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
