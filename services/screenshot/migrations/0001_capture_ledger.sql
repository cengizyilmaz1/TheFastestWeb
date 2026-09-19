BEGIN;
CREATE TABLE IF NOT EXISTS screenshot_captures (
  id uuid PRIMARY KEY,
  client_id text NOT NULL,
  cache_key text NOT NULL,
  request jsonb NOT NULL CHECK (jsonb_typeof(request) = 'object'),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','ready','failed','expired')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  result jsonb,
  error_code text,
  expires_at timestamptz NOT NULL,
  cache_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((lease_token IS NULL) = (lease_until IS NULL))
);
CREATE INDEX IF NOT EXISTS screenshot_captures_dispatch_idx ON screenshot_captures(status, available_at);
CREATE INDEX IF NOT EXISTS screenshot_captures_cache_idx ON screenshot_captures(client_id, cache_key, cache_until);
CREATE INDEX IF NOT EXISTS screenshot_captures_expiry_idx ON screenshot_captures(expires_at);
CREATE TABLE IF NOT EXISTS screenshot_idempotency (
  client_id text NOT NULL,
  key uuid NOT NULL,
  request_hash text NOT NULL,
  capture_id uuid NOT NULL REFERENCES screenshot_captures(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(client_id,key)
);
CREATE TABLE IF NOT EXISTS screenshot_quotas (
  client_id text NOT NULL,
  day date NOT NULL,
  used integer NOT NULL,
  PRIMARY KEY(client_id,day)
);
CREATE TABLE IF NOT EXISTS screenshot_objects (
  object_key text PRIMARY KEY,
  capture_id uuid NOT NULL REFERENCES screenshot_captures(id),
  lease_token uuid NOT NULL,
  visibility text NOT NULL CHECK(visibility IN ('private','public')),
  committed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS screenshot_objects_capture_idx ON screenshot_objects(capture_id);
COMMIT;
