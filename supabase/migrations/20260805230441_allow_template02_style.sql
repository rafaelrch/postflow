-- TEMPLATE 2: libera o novo estilo nas duas tabelas que armazenam carrosséis.
--
-- A aplicação já persistia `style = 'template02'`, mas as constraints ainda
-- terminavam em `template01`, fazendo o INSERT falhar antes de salvar os slides.
-- A nova lista é um superset da anterior e preserva todos os valores existentes.

alter table public.carousels drop constraint if exists carousels_style_check;
alter table public.carousels add constraint carousels_style_check
  check (style in ('minimalist', 'profile', 'editorial', 'template01', 'template02'));

alter table public.templates drop constraint if exists templates_style_check;
alter table public.templates add constraint templates_style_check
  check (style in ('minimalist', 'profile', 'editorial', 'template01', 'template02'));
