-- TEMPLATE 1 — qual MODELO do spec cada slide desenha.
--
-- `slides.template_model` guarda 1..6, o índice do slide no
-- `template-01/spec.json`. Só o estilo 'template01' preenche; nos outros fica
-- NULL, porque neles não existe "modelo": a forma é editável.
--
-- Por que uma coluna e não derivar da posição, como era até aqui: o deck do
-- template era fechado em 6, então POSIÇÃO e MODELO eram a mesma coisa. Agora o
-- usuário pode repetir um modelo e passar de 6 slides, e aí a posição deixa de
-- identificar o desenho — o slide 7 caía no clamp e saía com o modelo 6 inteiro,
-- seta e textos de fábrica do Figma junto.
--
-- Por que não dentro de `template_slots` (jsonb que já existe): aquele objeto é
-- conteúdo POR SLOT (`s1.headline` -> texto). Enfiar um número de modelo ali
-- criaria uma chave que não é slot dentro do mapa de slots, e o render itera
-- esse mapa. Modelo é estrutura, não conteúdo.
--
-- 🔴 Compatibilidade: NULL em todo deck já salvo, de propósito. O código lê a
-- ausência e volta a derivar o modelo da posição (`template01ModelOf`), então
-- carrossel antigo reabre idêntico sem nenhum backfill.
--
-- Idempotente: pode rodar mais de uma vez.

alter table public.slides add column if not exists template_model smallint;

alter table public.slides drop constraint if exists slides_template_model_check;
alter table public.slides add constraint slides_template_model_check
  check (template_model is null or template_model between 1 and 6);
