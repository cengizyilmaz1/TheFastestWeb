-- Add the public IndieTools taxonomy verified on 2026-09-20.
-- Preserve existing category IDs, site assignments and the legacy enum.
-- An existing operator-created slug is deliberately not overwritten/reactivated.
INSERT INTO public.categories(id,slug,name)
SELECT overlay(overlay(md5('category:' || seed.slug) placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,
  seed.slug,seed.name
FROM (VALUES
  ('ai','AI'),
  ('analytics','Analytics'),
  ('cms','CMS'),
  ('design','Design'),
  ('developer-tools','Developer tools'),
  ('finance','Finance'),
  ('fitness','Fitness'),
  ('games','Games'),
  ('lifestyle','Lifestyle'),
  ('marketing','Marketing'),
  ('personal-life','Personal life'),
  ('productivity','Productivity'),
  ('programming','Programming'),
  ('seo','SEO'),
  ('social-media','Social media')
) AS seed(slug,name)
ON CONFLICT (slug) DO NOTHING;
