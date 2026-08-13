-- TEMPLATE 1 (terceiro template de carrossel).
--
-- 1. `slides.template_slots` guarda o conteúdo por slot (`s1.headline`,
--    `s3.image`, `cantos.left`…). Só o estilo 'template01' preenche; nos outros
--    fica NULL, porque neles a forma é editável e mora nas colunas existentes.
-- 2. As constraints de estilo passam a aceitar 'template01'.
--
-- Idempotente: pode rodar mais de uma vez.

alter table public.slides add column if not exists template_slots jsonb;

alter table public.carousels drop constraint if exists carousels_style_check;
alter table public.carousels add constraint carousels_style_check
  check (style in ('minimalist', 'profile', 'editorial', 'template01'));

alter table public.templates drop constraint if exists templates_style_check;
alter table public.templates add constraint templates_style_check
  check (style in ('minimalist', 'profile', 'editorial', 'template01'));
