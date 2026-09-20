-- Extend the existing bounded observation ledger; no historical rows change.
ALTER TABLE public.analytics_events DROP CONSTRAINT analytics_events_name_valid;
ALTER TABLE public.analytics_events ADD CONSTRAINT analytics_events_name_valid CHECK (name IN (
  'site_submitted','site_claimed','speed_test_started','speed_test_completed','speed_test_failed',
  'badge_verified','badge_awarded','weekly_entered','weekly_won','share_card_generated','ad_clicked','site_clicked',
  'checkout_started','payment_completed','subscription_changed','ad_approved','ranking_finalized'
));
