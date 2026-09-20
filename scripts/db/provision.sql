-- Run as the cluster administrator against the explicitly named application DB.
-- psql -X -v ON_ERROR_STOP=1 -v expected_database=thefastestweb -v phase=roles -f provision.sql
-- Set role passwords privately; make tfw_migrator the EMPTY database owner; restore/migrate as it.
-- Then repeat with phase=grants. No password, ownership takeover or migration occurs here.
\set ON_ERROR_STOP on
\if :{?expected_database}
\else
  \echo 'expected_database is required; refusing implicit target.'
  \quit 1
\endif
\if :{?phase}
\else
  \echo 'phase must be roles or grants.'
  \quit 1
\endif
SELECT :'phase' IN ('roles','grants') AS valid_phase, :'phase'='grants' AS grant_phase \gset
\if :valid_phase
\else
  \echo 'Invalid phase.'
  \quit 1
\endif
BEGIN;
SELECT set_config('tfw.provision_expected_database', :'expected_database', true);
DO $guard$
DECLARE candidate record;
BEGIN
  IF current_database() <> current_setting('tfw.provision_expected_database')
    OR current_database() IN ('postgres','template0','template1') THEN
    RAISE EXCEPTION 'Wrong provisioning database; no changes applied';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='tfw_migrator') THEN
    CREATE ROLE tfw_migrator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='tfw_app') THEN
    CREATE ROLE tfw_app LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  FOR candidate IN SELECT * FROM pg_roles WHERE rolname IN ('tfw_migrator','tfw_app') LOOP
    IF candidate.rolsuper OR candidate.rolcreatedb OR candidate.rolcreaterole OR candidate.rolreplication
      OR candidate.rolbypassrls OR NOT candidate.rolcanlogin
      OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=candidate.oid) THEN
      RAISE EXCEPTION 'Unsafe existing application/migration role; review explicitly before provisioning';
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_database WHERE datdba='tfw_app'::regrole)
    OR EXISTS(SELECT 1 FROM pg_class WHERE relowner='tfw_app'::regrole)
    OR has_schema_privilege('tfw_app','public','CREATE')
    OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND (has_table_privilege('tfw_app',c.oid,'TRUNCATE') OR has_table_privilege('tfw_app',c.oid,'TRIGGER')))
    OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='app_meta' AND has_schema_privilege('tfw_app',oid,'USAGE'))
    OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('ranking_snapshots','audit_logs')
      AND (has_table_privilege('tfw_app',c.oid,'UPDATE') OR has_table_privilege('tfw_app',c.oid,'DELETE'))) THEN
    RAISE EXCEPTION 'App role owns objects or has DDL privileges; no privileges silently removed';
  END IF;
  EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC',current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO tfw_migrator,tfw_app',current_database());
END
$guard$;
\if :grant_phase
DO $ownership$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_database WHERE datname=current_database() AND datdba='tfw_migrator'::regrole)
    OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p','v','S') AND c.relowner<>'tfw_migrator'::regrole) THEN
    RAISE EXCEPTION 'Restore/migrate as tfw_migrator first; ownership is never reassigned by this script';
  END IF;
  IF to_regclass('app_meta.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'Run the guarded migration runner before runtime grants';
  END IF;
END
$ownership$;
GRANT USAGE ON SCHEMA public TO tfw_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON
  public.users,public.sites,public.speed_tests,public.speed_checks,public.payments,
  public.ad_slots,public.ad_clicks,public.cron_logs,public.verified_speed_tests,
  public.request_rate_limits,public.background_jobs,public.job_events,public.provider_usage,
  public.products,public.checkout_orders,public.payment_ledger,public.payment_events,
  public.subscriptions,public.entitlements,public.notification_preferences,public.notifications,
  public.email_deliveries,public.categories,public.site_categories,public.technologies,
  public.site_technologies,public.founders,public.founder_sites,public.founder_social_links,
  public.site_social_links,public.site_claims,public.competition_periods,public.achievements,
  public.site_awards,public.site_screenshots,public.admin_roles,public.ad_inventory,
  public.ad_reservations,public.analytics_events,public.founder_site_invitations,
  public.founder_slug_aliases,public.redirect_rules,
  public.redirect_rule_daily_stats,public.founder_redirect_daily_stats TO tfw_app;
GRANT SELECT,INSERT ON public.ranking_snapshots,public.audit_logs TO tfw_app;
GRANT SELECT ON public.countries,public.ad_clicks_with_names TO tfw_app;
GRANT USAGE,SELECT ON SEQUENCE public.ad_slots_id_seq TO tfw_app;
\endif
COMMIT;
