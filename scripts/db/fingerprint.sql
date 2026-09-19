-- Catalog metadata only. Never selects application row values or role/password data.
-- The caller sets search_path to pg_catalog so rendered definitions are stable.
SELECT jsonb_build_object(
  'relations', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'name', c.relname, 'kind', c.relkind, 'rls', c.relrowsecurity,
      'forceRls', c.relforcerowsecurity, 'options', c.reloptions,
      'columns', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'name', a.attname, 'type', format_type(a.atttypid, a.atttypmod),
          'notNull', a.attnotnull, 'identity', a.attidentity, 'generated', a.attgenerated,
          'default', pg_get_expr(d.adbin, d.adrelid)
        ) ORDER BY a.attnum)
        FROM pg_attribute a
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      ), '[]'::jsonb),
      'constraints', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'name', k.conname, 'type', k.contype, 'validated', k.convalidated,
          'definition', pg_get_constraintdef(k.oid, false)
        ) ORDER BY k.conname)
        FROM pg_constraint k WHERE k.conrelid = c.oid
      ), '[]'::jsonb),
      'indexes', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'name', ic.relname, 'definition', pg_get_indexdef(i.indexrelid),
          'valid', i.indisvalid
        ) ORDER BY ic.relname)
        FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid WHERE i.indrelid = c.oid
      ), '[]'::jsonb),
      'triggers', COALESCE((
        SELECT jsonb_agg(pg_get_triggerdef(t.oid, false) ORDER BY t.tgname)
        FROM pg_trigger t WHERE t.tgrelid = c.oid AND NOT t.tgisinternal
      ), '[]'::jsonb),
      'view', CASE WHEN c.relkind IN ('v', 'm') THEN pg_get_viewdef(c.oid, false) ELSE NULL END
    ) ORDER BY c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  ), '[]'::jsonb),
  'enums', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('name', t.typname, 'labels', (
      SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = t.oid
    )) ORDER BY t.typname)
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typtype = 'e'
  ), '[]'::jsonb),
  'sequences', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'name', c.relname, 'type', format_type(s.seqtypid, NULL),
      'start', s.seqstart, 'increment', s.seqincrement, 'minimum', s.seqmin,
      'maximum', s.seqmax, 'cache', s.seqcache, 'cycle', s.seqcycle,
      'ownedBy', (
        SELECT format('%I.%I', tc.relname, a.attname)
        FROM pg_depend d JOIN pg_class tc ON tc.oid = d.refobjid
        JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid
          AND d.refclassid = 'pg_class'::regclass AND d.deptype IN ('a', 'i')
      )
    ) ORDER BY c.relname)
    FROM pg_sequence s JOIN pg_class c ON c.oid = s.seqrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
  ), '[]'::jsonb),
  'policies', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'table', tablename, 'name', policyname, 'command', cmd, 'permissive', permissive,
      'roles', roles, 'using', qual, 'check', with_check
    ) ORDER BY tablename, policyname)
    FROM pg_policies WHERE schemaname = 'public'
  ), '[]'::jsonb),
  'routines', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('name', p.oid::regprocedure::text, 'kind', p.prokind,
      'definition', CASE WHEN p.prokind IN ('f', 'p') THEN pg_get_functiondef(p.oid) ELSE NULL END
    ) ORDER BY p.oid::regprocedure::text)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND NOT EXISTS (
      SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
    )
  ), '[]'::jsonb),
  'otherTypes', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('name', t.typname, 'kind', t.typtype) ORDER BY t.typname)
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typtype IN ('d', 'r', 'm')
  ), '[]'::jsonb)
) AS fingerprint;
