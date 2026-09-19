-- Additive reviewed schema. No original columns, keys or history are removed.
ALTER TABLE public.ad_slots ADD COLUMN status text NOT NULL DEFAULT 'active';
ALTER TABLE public.ad_slots ADD CONSTRAINT ad_slots_status_valid CHECK (status IN ('pending','active','expired','cancelled','rejected'));
UPDATE public.ad_slots SET status = CASE WHEN NOT is_active THEN 'cancelled' WHEN expires_at <= now() THEN 'expired' ELSE 'active' END;
CREATE TABLE public."checkout_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"site_id" uuid,
	"product_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider_checkout_id" text,
	"checkout_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"product_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkout_orders_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "checkout_orders_provider_checkout_id_unique" UNIQUE("provider_checkout_id"),
	CONSTRAINT "checkout_orders_status_valid" CHECK ("checkout_orders"."status" IN ('pending','creating','uncertain','ready','paid','failed','expired')),
	CONSTRAINT "checkout_orders_snapshot_object" CHECK (jsonb_typeof("checkout_orders"."product_snapshot") = 'object')
);

CREATE TABLE public."email_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"notification_id" uuid,
	"event_key" text NOT NULL,
	"template" text NOT NULL,
	"recipient" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_message_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_deliveries_event_key_unique" UNIQUE("event_key"),
	CONSTRAINT "email_deliveries_status_valid" CHECK ("email_deliveries"."status" IN ('pending','sending','accepted','suppressed','failed','uncertain')),
	CONSTRAINT "email_deliveries_attempts_valid" CHECK ("email_deliveries"."attempts" >= 0)
);

CREATE TABLE public."entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"site_id" uuid,
	"ad_slot_id" integer,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlements_kind_valid" CHECK ("entitlements"."kind" IN ('PRO','FEATURED','AD_SLOT','SPONSORSHIP')),
	CONSTRAINT "entitlements_source_valid" CHECK ("entitlements"."source" IN ('legacy','dodo')),
	CONSTRAINT "entitlements_status_valid" CHECK ("entitlements"."status" IN ('active','revoked'))
);

CREATE TABLE public."notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"marketing" boolean DEFAULT false NOT NULL,
	"performance" boolean DEFAULT true NOT NULL,
	"weekly" boolean DEFAULT true NOT NULL,
	"badge" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"event_key" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_event_key_unique" UNIQUE("event_key"),
	CONSTRAINT "notifications_payload_object" CHECK (jsonb_typeof("notifications"."payload") = 'object')
);

CREATE TABLE public."payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_event_id" text NOT NULL,
	"type" text NOT NULL,
	"resource_id" text NOT NULL,
	"order_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"payload_hash" text NOT NULL,
	"normalized_payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_events_provider_event_id_unique" UNIQUE("provider_event_id"),
	CONSTRAINT "payment_events_payload_object" CHECK (jsonb_typeof("payment_events"."normalized_payload") = 'object')
);

CREATE TABLE public."products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"provider_product_id" text,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"billing_interval" text NOT NULL,
	"entitlement_days" integer,
	"requires_site" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_key_unique" UNIQUE("key"),
	CONSTRAINT "products_provider_product_id_unique" UNIQUE("provider_product_id"),
	CONSTRAINT "products_kind_valid" CHECK ("products"."kind" IN ('pro_listing','featured_listing','sidebar_ad','sponsorship')),
	CONSTRAINT "products_amount_valid" CHECK ("products"."amount_cents" >= 0 AND "products"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "products_interval_valid" CHECK ("products"."billing_interval" IN ('one_time','month','year')),
	CONSTRAINT "products_days_valid" CHECK ("products"."entitlement_days" IS NULL OR "products"."entitlement_days" > 0)
);

CREATE TABLE public."payment_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'dodo' NOT NULL,
	"provider_payment_id" text NOT NULL,
	"order_id" uuid,
	"user_id" uuid,
	"site_id" uuid,
	"product_id" uuid,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text NOT NULL,
	"provider_subscription_id" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_ledger_provider_payment_id_unique" UNIQUE("provider_payment_id"),
	CONSTRAINT "payment_ledger_amount_valid" CHECK ("payment_ledger"."amount_cents" >= 0 AND "payment_ledger"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "payment_ledger_status_valid" CHECK ("payment_ledger"."status" IN ('pending','succeeded','failed','refunded','disputed'))
);

CREATE TABLE public."subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_subscription_id" text NOT NULL,
	"user_id" uuid,
	"site_id" uuid,
	"product_id" uuid,
	"status" text NOT NULL,
	"current_period_end" timestamp with time zone,
	"provider_updated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_provider_subscription_id_unique" UNIQUE("provider_subscription_id")
);

ALTER TABLE public."checkout_orders" ADD CONSTRAINT "checkout_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE public."checkout_orders" ADD CONSTRAINT "checkout_orders_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE public."checkout_orders" ADD CONSTRAINT "checkout_orders_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE public."email_deliveries" ADD CONSTRAINT "email_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE public."email_deliveries" ADD CONSTRAINT "email_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE public."entitlements" ADD CONSTRAINT "entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE public."entitlements" ADD CONSTRAINT "entitlements_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE public."entitlements" ADD CONSTRAINT "entitlements_ad_slot_id_ad_slots_id_fk" FOREIGN KEY ("ad_slot_id") REFERENCES "public"."ad_slots"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE public."notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE public."notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE public."payment_events" ADD CONSTRAINT "payment_events_order_id_checkout_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."checkout_orders"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE public."payment_ledger" ADD CONSTRAINT "payment_ledger_order_id_checkout_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."checkout_orders"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE public."payment_ledger" ADD CONSTRAINT "payment_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE public."payment_ledger" ADD CONSTRAINT "payment_ledger_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE public."payment_ledger" ADD CONSTRAINT "payment_ledger_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE public."subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE public."subscriptions" ADD CONSTRAINT "subscriptions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE public."subscriptions" ADD CONSTRAINT "subscriptions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX "checkout_orders_user_created_idx" ON public."checkout_orders" USING btree ("user_id","created_at" DESC NULLS LAST);

CREATE INDEX "email_deliveries_status_created_idx" ON public."email_deliveries" USING btree ("status","created_at");

CREATE UNIQUE INDEX "entitlements_source_kind_unique" ON public."entitlements" USING btree ("source","source_id","kind");

CREATE INDEX "entitlements_user_kind_idx" ON public."entitlements" USING btree ("user_id","kind","status");

CREATE INDEX "entitlements_site_idx" ON public."entitlements" USING btree ("site_id");

CREATE INDEX "notifications_user_created_idx" ON public."notifications" USING btree ("user_id","created_at" DESC NULLS LAST);

CREATE INDEX "payment_ledger_user_created_idx" ON public."payment_ledger" USING btree ("user_id","created_at" DESC NULLS LAST);

CREATE INDEX "subscriptions_user_idx" ON public."subscriptions" USING btree ("user_id");

-- Stable source keys and deterministic new IDs preserve legacy access independently
-- of provider accounts. No live products or fictitious prices are created.
INSERT INTO public.entitlements (id,user_id,kind,source,source_id,status,starts_at,created_at)
SELECT overlay(overlay(md5('legacy:user:pro:' || id::text) placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,id,'PRO','legacy','user:' || id::text,'active',created_at,created_at
FROM public.users WHERE is_pro;

INSERT INTO public.entitlements (id,user_id,site_id,kind,source,source_id,status,starts_at,created_at)
SELECT overlay(overlay(md5('legacy:site:pro:' || id::text) placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,owner_id,id,'PRO','legacy','site:' || id::text,'active',created_at,created_at
FROM public.sites WHERE tier='pro';

INSERT INTO public.entitlements (id,user_id,ad_slot_id,kind,source,source_id,status,starts_at,ends_at,created_at)
SELECT overlay(overlay(md5('legacy:ad:' || id::text) placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,user_id,id,'AD_SLOT','legacy','ad:' || id::text,
  CASE WHEN is_active THEN 'active' ELSE 'revoked' END,coalesce(created_at,now()),expires_at,coalesce(created_at,now())
FROM public.ad_slots;

REVOKE ALL ON public.products,public.checkout_orders,public.payment_ledger,public.payment_events,
  public.subscriptions,public.entitlements,public.notification_preferences,public.notifications,public.email_deliveries FROM PUBLIC;
