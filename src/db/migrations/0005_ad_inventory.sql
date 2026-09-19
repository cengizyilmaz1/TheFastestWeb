-- Explicit inventory preserves only observed legacy positions. No speculative capacity.
CREATE TABLE public.ad_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position public.ad_position NOT NULL,
  order_index integer NOT NULL,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ad_inventory_order_nonnegative CHECK (order_index >= 0)
);
CREATE UNIQUE INDEX ad_inventory_position_order_unique ON public.ad_inventory(position,order_index);

INSERT INTO public.ad_inventory(id,position,order_index,active)
SELECT overlay(overlay(md5('tfw:ad-inventory:' || position::text || ':' || order_index::text)
  placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,position,order_index,true
FROM public.ad_slots GROUP BY position,order_index;

CREATE TABLE public.ad_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid NOT NULL REFERENCES public.ad_inventory(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL UNIQUE REFERENCES public.checkout_orders(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  ad_slot_id integer REFERENCES public.ad_slots(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'held',
  starts_at timestamptz,
  ends_at timestamptz,
  release_evidence text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ad_reservations_status_valid CHECK (status IN ('held','paid','active','expired','cancelled','refunded','rejected')),
  CONSTRAINT ad_reservations_window_valid CHECK ((starts_at IS NULL AND ends_at IS NULL) OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > starts_at)),
  CONSTRAINT ad_reservations_active_window CHECK (status <> 'active' OR (starts_at IS NOT NULL AND ends_at IS NOT NULL))
);
CREATE UNIQUE INDEX ad_reservations_live_inventory_unique ON public.ad_reservations(inventory_id) WHERE status IN ('held','paid','active');
CREATE INDEX ad_reservations_user_created_idx ON public.ad_reservations(user_id,created_at);
REVOKE ALL ON public.ad_inventory,public.ad_reservations FROM PUBLIC;
