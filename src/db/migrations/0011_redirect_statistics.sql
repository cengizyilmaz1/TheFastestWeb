-- Additive, compact daily aggregates. No visitor IDs, addresses, headers or query strings.
-- Known rule/founder identities bound cardinality; deleted identities remove their counters.
CREATE TABLE public.redirect_rule_daily_stats (
  rule_id uuid NOT NULL REFERENCES public.redirect_rules(id) ON DELETE CASCADE,
  day date NOT NULL,
  human_requests bigint NOT NULL DEFAULT 0,
  bot_requests bigint NOT NULL DEFAULT 0,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT redirect_rule_daily_stats_pk PRIMARY KEY (rule_id,day),
  CONSTRAINT redirect_rule_daily_stats_counts_valid CHECK (human_requests >= 0 AND bot_requests >= 0)
);
CREATE INDEX redirect_rule_daily_stats_day_idx ON public.redirect_rule_daily_stats(day);
CREATE TABLE public.founder_redirect_daily_stats (
  founder_id uuid NOT NULL REFERENCES public.founders(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_path text NOT NULL,
  day date NOT NULL,
  human_requests bigint NOT NULL DEFAULT 0,
  bot_requests bigint NOT NULL DEFAULT 0,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT founder_redirect_daily_stats_pk PRIMARY KEY (founder_id,source_type,source_path,day),
  CONSTRAINT founder_redirect_daily_stats_counts_valid CHECK (human_requests >= 0 AND bot_requests >= 0),
  CONSTRAINT founder_redirect_daily_stats_source_valid CHECK (
    (source_type = 'legacy' AND source_path = '/profile/[account-id]') OR
    (source_type = 'alias' AND length(source_path) <= 90 AND source_path ~ '^/founders?/[a-z0-9]+(-[a-z0-9]+)*$')
  )
);
CREATE INDEX founder_redirect_daily_stats_day_idx ON public.founder_redirect_daily_stats(day);
REVOKE ALL ON public.redirect_rule_daily_stats,public.founder_redirect_daily_stats FROM PUBLIC;
