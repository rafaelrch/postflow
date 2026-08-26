-- TEMPLATE 3: libera o estilo FlowLine nas tabelas que armazenam carrosséis e templates.
--
-- Escrever e revisar esta migration faz parte da TASK 3 / S6.
-- Ela deve ser aplicada separadamente pelo responsável pelo banco.

alter table public.carousels drop constraint if exists carousels_style_check;
alter table public.carousels add constraint carousels_style_check
  check (style in ('minimalist', 'profile', 'editorial', 'template01', 'template02', 'template03'));

alter table public.templates drop constraint if exists templates_style_check;
alter table public.templates add constraint templates_style_check
  check (style in ('minimalist', 'profile', 'editorial', 'template01', 'template02', 'template03'));
