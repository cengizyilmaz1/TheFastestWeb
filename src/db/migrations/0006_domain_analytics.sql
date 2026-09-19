-- Server-owned events only. Never store identities, IPs, raw URLs or provider payloads.
CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  name text NOT NULL,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT analytics_events_name_valid CHECK (name IN (
    'site_submitted','site_claimed','speed_test_started','speed_test_completed','speed_test_failed',
    'badge_verified','badge_awarded','weekly_entered','weekly_won','share_card_generated','ad_clicked',
    'checkout_started','payment_completed','subscription_changed','ad_approved','ranking_finalized')),
  CONSTRAINT analytics_events_properties_object CHECK (jsonb_typeof(properties)='object')
);
CREATE INDEX analytics_events_name_occurred_idx ON public.analytics_events(name,occurred_at DESC);
REVOKE ALL ON public.analytics_events FROM PUBLIC;
