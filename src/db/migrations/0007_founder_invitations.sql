-- Consent is required for cross-account attribution. Existing links are unchanged.
CREATE TABLE public.founder_site_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  founder_id uuid NOT NULL REFERENCES public.founders(id) ON DELETE CASCADE,
  inviter_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  invited_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT (now()+interval '7 days'),
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT founder_site_invitations_status_valid CHECK (status IN ('pending','accepted','declined','revoked','expired')),
  CONSTRAINT founder_site_invitations_expiry_valid CHECK (expires_at>created_at)
);
CREATE UNIQUE INDEX founder_site_invitations_pending_unique ON public.founder_site_invitations(site_id,founder_id) WHERE status='pending';
CREATE INDEX founder_site_invitations_recipient_idx ON public.founder_site_invitations(invited_user_id,status,created_at DESC);
CREATE INDEX founder_site_invitations_site_idx ON public.founder_site_invitations(site_id,status);
REVOKE ALL ON public.founder_site_invitations FROM PUBLIC;
