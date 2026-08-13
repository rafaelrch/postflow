-- TEMPLATE 1 — marcação EXPLÍCITA de override.
--
-- `slides.template_overrides` guarda QUAIS controles da barra lateral o usuário
-- mexeu ({"background": true, "titleSize": true}). Só o estilo 'template01'
-- preenche; nos outros fica NULL.
--
-- Por que uma coluna e não uma heurística: antes, o que caracterizava um
-- override era o valor DIFERIR do padrão do editor. A geração gravava a cor da
-- marca do usuário em todo slide, ela diferia de '#111111', virava "escolha do
-- usuário" e pintava chapado por cima dos degradês do Figma. Valor não é
-- intenção. A partir daqui, geração NUNCA escreve aqui — só a barra lateral.
--
-- Os overrides de CANTO (deck inteiro) não precisam de coluna: vão em
-- carousels.global_settings, que já é jsonb.
--
-- Idempotente: pode rodar mais de uma vez.

alter table public.slides add column if not exists template_overrides jsonb;
