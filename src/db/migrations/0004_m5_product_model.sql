-- Additive reviewed schema. No original columns, keys or history are removed.
-- Countries are explicit ISO assignments only. Existing country flags are retained
-- verbatim and are not guessed into the new nullable country_code field.
ALTER TABLE public.sites
  ADD COLUMN tagline text,
  ADD COLUMN country_code text,
  ADD COLUMN lifecycle text NOT NULL DEFAULT 'submitted',
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN redirect_url text,
  ADD COLUMN badge_status text NOT NULL DEFAULT 'missing',
  ADD COLUMN badge_checked_at timestamptz,
  ADD COLUMN badge_grace_until timestamptz,
  ADD CONSTRAINT sites_lifecycle_valid CHECK (lifecycle IN ('submitted','pending','verified','active','redirected','unreachable','parked','suspended','removed','archived')),
  ADD CONSTRAINT sites_badge_status_valid CHECK (badge_status IN ('verified','temporarily_unreachable','missing','grace_period','failed'));
UPDATE public.sites SET lifecycle = CASE WHEN is_listed THEN 'active' ELSE 'pending' END;

ALTER TABLE public.speed_tests
  ADD COLUMN sample_count integer NOT NULL DEFAULT 1,
  ADD COLUMN metrics_source text NOT NULL DEFAULT 'lab',
  ADD CONSTRAINT speed_tests_samples_valid CHECK (sample_count > 0),
  ADD CONSTRAINT speed_tests_source_valid CHECK (metrics_source = 'lab');
CREATE TABLE public."achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "achievements_key_unique" UNIQUE("key")
);

CREATE TABLE public."admin_roles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "admin_roles_role_valid" CHECK ("admin_roles"."role" IN ('admin','moderator'))
);

CREATE TABLE public."audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"reason" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_logs_payload_object" CHECK (jsonb_typeof("audit_logs"."payload") = 'object')
);

CREATE TABLE public."categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug"),
	CONSTRAINT "categories_slug_valid" CHECK ("categories"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

CREATE TABLE public."competition_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"period_key" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"ranking_algorithm_version" text NOT NULL,
	"performance_method_version" text NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "competition_periods_period_key_unique" UNIQUE("period_key"),
	CONSTRAINT "competition_periods_kind_valid" CHECK ("competition_periods"."kind" IN ('weekly','monthly')),
	CONSTRAINT "competition_periods_status_valid" CHECK ("competition_periods"."status" IN ('open','closed')),
	CONSTRAINT "competition_periods_dates_valid" CHECK ("competition_periods"."end_at" > "competition_periods"."start_at" AND (("competition_periods"."status" = 'closed') = ("competition_periods"."closed_at" IS NOT NULL)))
);

CREATE TABLE public."countries" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "countries_code_valid" CHECK ("countries"."code" ~ '^[A-Z]{2}$')
);

CREATE TABLE public."founder_sites" (
	"founder_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "founder_sites_pk" PRIMARY KEY("founder_id","site_id")
);

CREATE TABLE public."founder_social_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"founder_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"url" text NOT NULL
);

CREATE TABLE public."founders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"bio" text,
	"country_code" text,
	"website_url" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "founders_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "founders_slug_unique" UNIQUE("slug"),
	CONSTRAINT "founders_slug_valid" CHECK ("founders"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "founders_visibility_valid" CHECK ("founders"."visibility" IN ('public','private'))
);

CREATE TABLE public."ranking_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"scope_key" text DEFAULT '' NOT NULL,
	"strategy" "public"."strategy" DEFAULT 'mobile' NOT NULL,
	"site_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"score" real NOT NULL,
	"lcp_ms" integer,
	"cls" real,
	"tbt_ms" integer,
	"sample_count" integer NOT NULL,
	"evidence" jsonb NOT NULL,
	"site_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ranking_snapshots_scope_valid" CHECK ("ranking_snapshots"."scope" IN ('overall','country','category','technology','improved','newcomer')),
	CONSTRAINT "ranking_snapshots_metrics_valid" CHECK ("ranking_snapshots"."rank" > 0 AND "ranking_snapshots"."score" >= 0 AND "ranking_snapshots"."score" <= 100 AND "ranking_snapshots"."sample_count" > 0),
	CONSTRAINT "ranking_snapshots_evidence_object" CHECK (jsonb_typeof("ranking_snapshots"."evidence") = 'object' AND jsonb_typeof("ranking_snapshots"."site_snapshot") = 'object')
);

CREATE TABLE public."site_awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"achievement_id" uuid NOT NULL,
	"period_id" uuid,
	"event_key" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_awards_event_key_unique" UNIQUE("event_key"),
	CONSTRAINT "site_awards_evidence_object" CHECK (jsonb_typeof("site_awards"."evidence") = 'object')
);

CREATE TABLE public."site_categories" (
	"site_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "site_categories_pk" PRIMARY KEY("site_id","category_id")
);

CREATE TABLE public."site_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"method" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_claims_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "site_claims_method_valid" CHECK ("site_claims"."method" IN ('dns_txt','well_known','meta_tag')),
	CONSTRAINT "site_claims_status_valid" CHECK ("site_claims"."status" IN ('pending','verified','rejected','expired','cancelled')),
	CONSTRAINT "site_claims_token_valid" CHECK ("site_claims"."token_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "site_claims_attempts_valid" CHECK ("site_claims"."attempts" >= 0 AND "site_claims"."expires_at" > "site_claims"."created_at")
);

CREATE TABLE public."site_screenshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"service_job_id" uuid NOT NULL,
	"background_job_id" uuid,
	"device" text NOT NULL,
	"mode" text NOT NULL,
	"object_key" text NOT NULL,
	"public_url" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"hash" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"retention_until" timestamp with time zone,
	"source_url" text NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_screenshots_service_job_id_unique" UNIQUE("service_job_id"),
	CONSTRAINT "site_screenshots_background_job_id_unique" UNIQUE("background_job_id"),
	CONSTRAINT "site_screenshots_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "site_screenshots_device_valid" CHECK ("site_screenshots"."device" IN ('desktop','mobile') AND "site_screenshots"."mode" IN ('viewport','fullpage')),
	CONSTRAINT "site_screenshots_size_valid" CHECK ("site_screenshots"."width" > 0 AND "site_screenshots"."height" > 0 AND "site_screenshots"."size" > 0),
	CONSTRAINT "site_screenshots_status_valid" CHECK ("site_screenshots"."status" IN ('ready','expired','removed'))
);

CREATE TABLE public."site_social_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"url" text NOT NULL
);

CREATE TABLE public."site_technologies" (
	"site_id" uuid NOT NULL,
	"technology_id" uuid NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"confidence" real,
	CONSTRAINT "site_technologies_pk" PRIMARY KEY("site_id","technology_id"),
	CONSTRAINT "site_technologies_source_valid" CHECK ("site_technologies"."source" IN ('manual','detected')),
	CONSTRAINT "site_technologies_confidence_valid" CHECK ("site_technologies"."confidence" IS NULL OR ("site_technologies"."confidence" >= 0 AND "site_technologies"."confidence" <= 1))
);

CREATE TABLE public."technologies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"website_url" text,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "technologies_slug_unique" UNIQUE("slug"),
	CONSTRAINT "technologies_slug_valid" CHECK ("technologies"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

ALTER TABLE public."admin_roles" ADD CONSTRAINT "admin_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE public."audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE public."founder_sites" ADD CONSTRAINT "founder_sites_founder_id_founders_id_fk" FOREIGN KEY ("founder_id") REFERENCES "public"."founders"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE public."founder_sites" ADD CONSTRAINT "founder_sites_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE public."founder_social_links" ADD CONSTRAINT "founder_social_links_founder_id_founders_id_fk" FOREIGN KEY ("founder_id") REFERENCES "public"."founders"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE public."founders" ADD CONSTRAINT "founders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE public."founders" ADD CONSTRAINT "founders_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;

ALTER TABLE public."ranking_snapshots" ADD CONSTRAINT "ranking_snapshots_period_id_competition_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."competition_periods"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE public."ranking_snapshots" ADD CONSTRAINT "ranking_snapshots_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE public."site_awards" ADD CONSTRAINT "site_awards_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE public."site_awards" ADD CONSTRAINT "site_awards_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE public."site_awards" ADD CONSTRAINT "site_awards_period_id_competition_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."competition_periods"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE public."site_categories" ADD CONSTRAINT "site_categories_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE public."site_categories" ADD CONSTRAINT "site_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE public."site_claims" ADD CONSTRAINT "site_claims_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE public."site_claims" ADD CONSTRAINT "site_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE public."site_screenshots" ADD CONSTRAINT "site_screenshots_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE public."site_screenshots" ADD CONSTRAINT "site_screenshots_background_job_id_background_jobs_id_fk" FOREIGN KEY ("background_job_id") REFERENCES "public"."background_jobs"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE public."site_social_links" ADD CONSTRAINT "site_social_links_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE public."site_technologies" ADD CONSTRAINT "site_technologies_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE public."site_technologies" ADD CONSTRAINT "site_technologies_technology_id_technologies_id_fk" FOREIGN KEY ("technology_id") REFERENCES "public"."technologies"("id") ON DELETE no action ON UPDATE no action;

CREATE INDEX "audit_logs_target_created_idx" ON public."audit_logs" USING btree ("target_type","target_id","created_at" DESC NULLS LAST);

CREATE INDEX "competition_periods_kind_start_idx" ON public."competition_periods" USING btree ("kind","start_at" DESC NULLS LAST);

CREATE INDEX "founder_sites_site_idx" ON public."founder_sites" USING btree ("site_id");

CREATE UNIQUE INDEX "founder_social_links_platform_unique" ON public."founder_social_links" USING btree ("founder_id","platform");

CREATE INDEX "founders_public_country_idx" ON public."founders" USING btree ("visibility","country_code","slug");

CREATE UNIQUE INDEX "ranking_snapshots_site_unique" ON public."ranking_snapshots" USING btree ("period_id","scope","scope_key","strategy","site_id");

CREATE UNIQUE INDEX "ranking_snapshots_rank_unique" ON public."ranking_snapshots" USING btree ("period_id","scope","scope_key","strategy","rank");

CREATE INDEX "ranking_snapshots_site_idx" ON public."ranking_snapshots" USING btree ("site_id","created_at" DESC NULLS LAST);

CREATE INDEX "site_awards_site_idx" ON public."site_awards" USING btree ("site_id","awarded_at" DESC NULLS LAST);

CREATE UNIQUE INDEX "site_categories_primary_unique" ON public."site_categories" USING btree ("site_id") WHERE "site_categories"."is_primary";

CREATE INDEX "site_categories_category_idx" ON public."site_categories" USING btree ("category_id","site_id");

CREATE INDEX "site_claims_user_created_idx" ON public."site_claims" USING btree ("user_id","created_at" DESC NULLS LAST);

CREATE INDEX "site_claims_site_status_idx" ON public."site_claims" USING btree ("site_id","status");

CREATE INDEX "site_screenshots_site_captured_idx" ON public."site_screenshots" USING btree ("site_id","captured_at" DESC NULLS LAST);

CREATE INDEX "site_screenshots_retention_idx" ON public."site_screenshots" USING btree ("retention_until");

CREATE UNIQUE INDEX "site_social_links_platform_unique" ON public."site_social_links" USING btree ("site_id","platform");

CREATE INDEX "site_technologies_technology_idx" ON public."site_technologies" USING btree ("technology_id","site_id");

ALTER TABLE public.sites ADD CONSTRAINT sites_country_code_countries_code_fk FOREIGN KEY (country_code) REFERENCES public.countries(code);
CREATE INDEX sites_lifecycle_country_idx ON public.sites (lifecycle,country_code,current_score DESC,id);
CREATE INDEX speed_tests_ranking_idx ON public.speed_tests (methodology_version,strategy,tested_at,site_id);

-- Original enum and rows remain for compatibility; new taxonomy IDs are stable.
INSERT INTO public.categories(id,slug,name) VALUES
  (overlay(overlay(md5('category:saas') placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,'saas','SaaS'),
  (overlay(overlay(md5('category:tool') placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,'tool','Tools'),
  (overlay(overlay(md5('category:directory') placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,'directory','Directories'),
  (overlay(overlay(md5('category:agency') placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,'agency','Agencies'),
  (overlay(overlay(md5('category:ecommerce') placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,'ecommerce','E-commerce'),
  (overlay(overlay(md5('category:blog') placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,'blog','Blogs'),
  (overlay(overlay(md5('category:portfolio') placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,'portfolio','Portfolios'),
  (overlay(overlay(md5('category:other') placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,'other','Other');
INSERT INTO public.site_categories(site_id,category_id,is_primary)
SELECT s.id,c.id,true FROM public.sites s JOIN public.categories c ON c.slug=s.category::text;

-- Reference vocabulary is not evidence that any site uses a technology.
INSERT INTO public.technologies(id,slug,name,website_url) VALUES
  (overlay(overlay(md5('technology:nextjs') placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,'nextjs','Next.js','https://nextjs.org/'),
  (overlay(overlay(md5('technology:react') placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,'react','React','https://react.dev/'),
  (overlay(overlay(md5('technology:vue') placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,'vue','Vue','https://vuejs.org/'),
  (overlay(overlay(md5('technology:nuxt') placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,'nuxt','Nuxt','https://nuxt.com/'),
  (overlay(overlay(md5('technology:svelte') placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,'svelte','Svelte','https://svelte.dev/'),
  (overlay(overlay(md5('technology:wordpress') placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,'wordpress','WordPress','https://wordpress.org/'),
  (overlay(overlay(md5('technology:shopify') placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,'shopify','Shopify','https://www.shopify.com/'),
  (overlay(overlay(md5('technology:webflow') placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,'webflow','Webflow','https://webflow.com/'),
  (overlay(overlay(md5('technology:laravel') placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,'laravel','Laravel','https://laravel.com/'),
  (overlay(overlay(md5('technology:django') placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,'django','Django','https://www.djangoproject.com/'),
  (overlay(overlay(md5('technology:rails') placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,'rails','Rails','https://rubyonrails.org/'),
  (overlay(overlay(md5('technology:cloudflare') placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,'cloudflare','Cloudflare','https://www.cloudflare.com/'),
  (overlay(overlay(md5('technology:vercel') placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,'vercel','Vercel','https://vercel.com/'),
  (overlay(overlay(md5('technology:aws') placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,'aws','AWS','https://aws.amazon.com/'),
  (overlay(overlay(md5('technology:tailwind') placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,'tailwind','Tailwind CSS','https://tailwindcss.com/');

CREATE FUNCTION public.guard_ranking_snapshot() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE period_status text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Ranking snapshots are immutable' USING ERRCODE = '23514';
  END IF;
  SELECT status INTO period_status FROM public.competition_periods WHERE id=NEW.period_id FOR SHARE;
  IF period_status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'Ranking period is not open' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ranking_snapshots_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.ranking_snapshots
FOR EACH ROW EXECUTE FUNCTION public.guard_ranking_snapshot();

CREATE FUNCTION public.guard_competition_period() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF OLD.status='closed' THEN
    RAISE EXCEPTION 'Closed competition periods are immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF NEW.status='closed' AND NEW.end_at > now() THEN
    RAISE EXCEPTION 'Competition period has not ended' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER competition_periods_immutable BEFORE UPDATE OR DELETE ON public.competition_periods
FOR EACH ROW EXECUTE FUNCTION public.guard_competition_period();

REVOKE ALL ON public.countries,public.categories,public.site_categories,public.technologies,public.site_technologies,
  public.founders,public.founder_sites,public.founder_social_links,public.site_social_links,public.site_claims,
  public.competition_periods,public.ranking_snapshots,public.achievements,public.site_awards,public.site_screenshots,
  public.admin_roles,public.audit_logs FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_ranking_snapshot(),public.guard_competition_period() FROM PUBLIC;

-- ISO assignments from Unicode CLDR release-48 iso_3166_status.txt;
-- English labels rendered with Node ICU/CLDR, display localization remains separate.
-- https://github.com/unicode-org/cldr/blob/release-48/tools/cldr-code/src/main/resources/org/unicode/cldr/util/data/external/iso_3166_status.txt
INSERT INTO public.countries(code,name) VALUES
  ('AD','Andorra'),
  ('AE','United Arab Emirates'),
  ('AF','Afghanistan'),
  ('AG','Antigua & Barbuda'),
  ('AI','Anguilla'),
  ('AL','Albania'),
  ('AM','Armenia'),
  ('AO','Angola'),
  ('AQ','Antarctica'),
  ('AR','Argentina'),
  ('AS','American Samoa'),
  ('AT','Austria'),
  ('AU','Australia'),
  ('AW','Aruba'),
  ('AX','Åland Islands'),
  ('AZ','Azerbaijan'),
  ('BA','Bosnia & Herzegovina'),
  ('BB','Barbados'),
  ('BD','Bangladesh'),
  ('BE','Belgium'),
  ('BF','Burkina Faso'),
  ('BG','Bulgaria'),
  ('BH','Bahrain'),
  ('BI','Burundi'),
  ('BJ','Benin'),
  ('BL','St. Barthélemy'),
  ('BM','Bermuda'),
  ('BN','Brunei'),
  ('BO','Bolivia'),
  ('BQ','Caribbean Netherlands'),
  ('BR','Brazil'),
  ('BS','Bahamas'),
  ('BT','Bhutan'),
  ('BV','Bouvet Island'),
  ('BW','Botswana'),
  ('BY','Belarus'),
  ('BZ','Belize'),
  ('CA','Canada'),
  ('CC','Cocos (Keeling) Islands'),
  ('CD','Congo - Kinshasa'),
  ('CF','Central African Republic'),
  ('CG','Congo - Brazzaville'),
  ('CH','Switzerland'),
  ('CI','Côte d’Ivoire'),
  ('CK','Cook Islands'),
  ('CL','Chile'),
  ('CM','Cameroon'),
  ('CN','China'),
  ('CO','Colombia'),
  ('CR','Costa Rica'),
  ('CU','Cuba'),
  ('CV','Cape Verde'),
  ('CW','Curaçao'),
  ('CX','Christmas Island'),
  ('CY','Cyprus'),
  ('CZ','Czechia'),
  ('DE','Germany'),
  ('DJ','Djibouti'),
  ('DK','Denmark'),
  ('DM','Dominica'),
  ('DO','Dominican Republic'),
  ('DZ','Algeria'),
  ('EC','Ecuador'),
  ('EE','Estonia'),
  ('EG','Egypt'),
  ('EH','Western Sahara'),
  ('ER','Eritrea'),
  ('ES','Spain'),
  ('ET','Ethiopia'),
  ('FI','Finland'),
  ('FJ','Fiji'),
  ('FK','Falkland Islands'),
  ('FM','Micronesia'),
  ('FO','Faroe Islands'),
  ('FR','France'),
  ('GA','Gabon'),
  ('GB','United Kingdom'),
  ('GD','Grenada'),
  ('GE','Georgia'),
  ('GF','French Guiana'),
  ('GG','Guernsey'),
  ('GH','Ghana'),
  ('GI','Gibraltar'),
  ('GL','Greenland'),
  ('GM','Gambia'),
  ('GN','Guinea'),
  ('GP','Guadeloupe'),
  ('GQ','Equatorial Guinea'),
  ('GR','Greece'),
  ('GS','South Georgia & South Sandwich Islands'),
  ('GT','Guatemala'),
  ('GU','Guam'),
  ('GW','Guinea-Bissau'),
  ('GY','Guyana'),
  ('HK','Hong Kong SAR China'),
  ('HM','Heard & McDonald Islands'),
  ('HN','Honduras'),
  ('HR','Croatia'),
  ('HT','Haiti'),
  ('HU','Hungary'),
  ('ID','Indonesia'),
  ('IE','Ireland'),
  ('IL','Israel'),
  ('IM','Isle of Man'),
  ('IN','India'),
  ('IO','British Indian Ocean Territory'),
  ('IQ','Iraq'),
  ('IR','Iran'),
  ('IS','Iceland'),
  ('IT','Italy'),
  ('JE','Jersey'),
  ('JM','Jamaica'),
  ('JO','Jordan'),
  ('JP','Japan'),
  ('KE','Kenya'),
  ('KG','Kyrgyzstan'),
  ('KH','Cambodia'),
  ('KI','Kiribati'),
  ('KM','Comoros'),
  ('KN','St. Kitts & Nevis'),
  ('KP','North Korea'),
  ('KR','South Korea'),
  ('KW','Kuwait'),
  ('KY','Cayman Islands'),
  ('KZ','Kazakhstan'),
  ('LA','Laos'),
  ('LB','Lebanon'),
  ('LC','St. Lucia'),
  ('LI','Liechtenstein'),
  ('LK','Sri Lanka'),
  ('LR','Liberia'),
  ('LS','Lesotho'),
  ('LT','Lithuania'),
  ('LU','Luxembourg'),
  ('LV','Latvia'),
  ('LY','Libya'),
  ('MA','Morocco'),
  ('MC','Monaco'),
  ('MD','Moldova'),
  ('ME','Montenegro'),
  ('MF','St. Martin'),
  ('MG','Madagascar'),
  ('MH','Marshall Islands'),
  ('MK','North Macedonia'),
  ('ML','Mali'),
  ('MM','Myanmar (Burma)'),
  ('MN','Mongolia'),
  ('MO','Macao SAR China'),
  ('MP','Northern Mariana Islands'),
  ('MQ','Martinique'),
  ('MR','Mauritania'),
  ('MS','Montserrat'),
  ('MT','Malta'),
  ('MU','Mauritius'),
  ('MV','Maldives'),
  ('MW','Malawi'),
  ('MX','Mexico'),
  ('MY','Malaysia'),
  ('MZ','Mozambique'),
  ('NA','Namibia'),
  ('NC','New Caledonia'),
  ('NE','Niger'),
  ('NF','Norfolk Island'),
  ('NG','Nigeria'),
  ('NI','Nicaragua'),
  ('NL','Netherlands'),
  ('NO','Norway'),
  ('NP','Nepal'),
  ('NR','Nauru'),
  ('NU','Niue'),
  ('NZ','New Zealand'),
  ('OM','Oman'),
  ('PA','Panama'),
  ('PE','Peru'),
  ('PF','French Polynesia'),
  ('PG','Papua New Guinea'),
  ('PH','Philippines'),
  ('PK','Pakistan'),
  ('PL','Poland'),
  ('PM','St. Pierre & Miquelon'),
  ('PN','Pitcairn Islands'),
  ('PR','Puerto Rico'),
  ('PS','Palestinian Territories'),
  ('PT','Portugal'),
  ('PW','Palau'),
  ('PY','Paraguay'),
  ('QA','Qatar'),
  ('RE','Réunion'),
  ('RO','Romania'),
  ('RS','Serbia'),
  ('RU','Russia'),
  ('RW','Rwanda'),
  ('SA','Saudi Arabia'),
  ('SB','Solomon Islands'),
  ('SC','Seychelles'),
  ('SD','Sudan'),
  ('SE','Sweden'),
  ('SG','Singapore'),
  ('SH','St. Helena'),
  ('SI','Slovenia'),
  ('SJ','Svalbard & Jan Mayen'),
  ('SK','Slovakia'),
  ('SL','Sierra Leone'),
  ('SM','San Marino'),
  ('SN','Senegal'),
  ('SO','Somalia'),
  ('SR','Suriname'),
  ('SS','South Sudan'),
  ('ST','São Tomé & Príncipe'),
  ('SV','El Salvador'),
  ('SX','Sint Maarten'),
  ('SY','Syria'),
  ('SZ','Eswatini'),
  ('TC','Turks & Caicos Islands'),
  ('TD','Chad'),
  ('TF','French Southern Territories'),
  ('TG','Togo'),
  ('TH','Thailand'),
  ('TJ','Tajikistan'),
  ('TK','Tokelau'),
  ('TL','Timor-Leste'),
  ('TM','Turkmenistan'),
  ('TN','Tunisia'),
  ('TO','Tonga'),
  ('TR','Türkiye'),
  ('TT','Trinidad & Tobago'),
  ('TV','Tuvalu'),
  ('TW','Taiwan'),
  ('TZ','Tanzania'),
  ('UA','Ukraine'),
  ('UG','Uganda'),
  ('UM','U.S. Outlying Islands'),
  ('US','United States'),
  ('UY','Uruguay'),
  ('UZ','Uzbekistan'),
  ('VA','Vatican City'),
  ('VC','St. Vincent & Grenadines'),
  ('VE','Venezuela'),
  ('VG','British Virgin Islands'),
  ('VI','U.S. Virgin Islands'),
  ('VN','Vietnam'),
  ('VU','Vanuatu'),
  ('WF','Wallis & Futuna'),
  ('WS','Samoa'),
  ('YE','Yemen'),
  ('YT','Mayotte'),
  ('ZA','South Africa'),
  ('ZM','Zambia'),
  ('ZW','Zimbabwe');
