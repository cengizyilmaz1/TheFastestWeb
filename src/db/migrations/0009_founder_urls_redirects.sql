-- Reserve canonical and historical usernames without publishing private accounts.
CREATE TABLE public.founder_slug_aliases (
  slug text PRIMARY KEY,
  founder_id uuid NOT NULL REFERENCES public.founders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT founder_slug_aliases_slug_valid CHECK (length(slug) BETWEEN 2 AND 80 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
CREATE INDEX founder_slug_aliases_founder_idx ON public.founder_slug_aliases(founder_id);
INSERT INTO public.founder_slug_aliases(slug,founder_id) SELECT slug,id FROM public.founders;
CREATE TABLE public.redirect_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_path text NOT NULL UNIQUE,
  destination_path text NOT NULL,
  status_code integer NOT NULL DEFAULT 301,
  enabled boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT redirect_rules_status_valid CHECK (status_code IN (301,302,307,308)),
  CONSTRAINT redirect_rules_version_valid CHECK (version >= 1),
  CONSTRAINT redirect_rules_paths_valid CHECK (length(source_path) BETWEEN 1 AND 500 AND length(destination_path) BETWEEN 1 AND 500 AND source_path ~ '^/[^/]*' AND destination_path ~ '^/[^/]*' AND source_path <> destination_path)
);
REVOKE ALL ON public.founder_slug_aliases,public.redirect_rules FROM PUBLIC;

