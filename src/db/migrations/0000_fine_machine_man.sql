CREATE TYPE "public"."ad_position" AS ENUM('left', 'right');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."strategy" AS ENUM('mobile', 'desktop');--> statement-breakpoint
CREATE TYPE "public"."tier" AS ENUM('free', 'pro');--> statement-breakpoint
CREATE TABLE "ad_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"position" "ad_position" NOT NULL,
	"order_index" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"icon_emoji" text NOT NULL,
	"gradient_from" text NOT NULL,
	"gradient_to" text NOT NULL,
	"url" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"polar_checkout_id" text,
	"amount_cents" integer NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"description" text NOT NULL,
	"favicon_url" text,
	"owner_id" uuid,
	"owner_name" text NOT NULL,
	"twitter_handle" text,
	"tier" "tier" DEFAULT 'free' NOT NULL,
	"is_listed" boolean DEFAULT false NOT NULL,
	"current_score" integer DEFAULT 0 NOT NULL,
	"current_load_time" text,
	"current_fcp" text,
	"current_lcp" text,
	"current_cls" text,
	"current_tbt" text,
	"current_tti" text,
	"current_si" text,
	"trend" real DEFAULT 0,
	"country_flag" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_tested_at" timestamp with time zone,
	CONSTRAINT "sites_slug_unique" UNIQUE("slug"),
	CONSTRAINT "sites_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "speed_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"load_time_ms" integer,
	"fcp_ms" integer,
	"lcp_ms" integer,
	"cls" real,
	"tbt_ms" integer,
	"tti_ms" integer,
	"si_ms" integer,
	"raw_response" jsonb,
	"strategy" "strategy" DEFAULT 'mobile' NOT NULL,
	"tested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speed_tests" ADD CONSTRAINT "speed_tests_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;