-- ============================================================
-- PostFlow — Schema completo
-- Execute no Supabase Dashboard → SQL Editor
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 0. LIMPAR TUDO
-- ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS on_auth_user_created   ON auth.users;
DROP TRIGGER IF EXISTS set_carousels_updated  ON public.carousels;
DROP TRIGGER IF EXISTS set_tweets_updated     ON public.tweets;

DROP FUNCTION IF EXISTS public.handle_new_user()  CASCADE;
DROP FUNCTION IF EXISTS public.set_updated_at()   CASCADE;

DROP TABLE IF EXISTS public.slides    CASCADE;
DROP TABLE IF EXISTS public.carousels CASCADE;
DROP TABLE IF EXISTS public.tweets    CASCADE;
DROP TABLE IF EXISTS public.profiles  CASCADE;


-- ─────────────────────────────────────────────────────────────
-- 1. FUNÇÕES UTILITÁRIAS
-- ─────────────────────────────────────────────────────────────

-- Atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Cria perfil vazio quando um novo usuário (incluindo anônimo) se registra
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, handle)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'handle', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 2. TABELAS
-- ─────────────────────────────────────────────────────────────

-- ── profiles ─────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL DEFAULT '',
  handle      TEXT        NOT NULL DEFAULT '',
  photo_url   TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── carousels ─────────────────────────────────────────────────
-- Cada carrossel pertence a um usuário.
-- Configurações globais são separadas em colunas escalares (queryáveis)
-- + dois JSONB para as configs compostas (corners, profile_badge).
CREATE TABLE public.carousels (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL DEFAULT auth.uid()
                            REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identidade
  title         TEXT        NOT NULL DEFAULT 'Novo Carrossel',
  style         TEXT        NOT NULL DEFAULT 'minimalist'
                            CHECK (style IN ('minimalist', 'profile')),

  -- Global settings — escalares
  theme         TEXT        NOT NULL DEFAULT 'dark'
                            CHECK (theme IN ('dark', 'light')),
  font_pair     TEXT        NOT NULL DEFAULT 'SF Pro Display + IvyOra Text',
  accent_color  TEXT        NOT NULL DEFAULT '#00CFFF',

  -- Global settings — compostos
  corners       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  profile_badge JSONB       NOT NULL DEFAULT '{}'::jsonb,

  -- Legenda gerada pela IA
  caption       TEXT        NOT NULL DEFAULT '',
  hashtags      TEXT[]      NOT NULL DEFAULT '{}',

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── slides ────────────────────────────────────────────────────
-- Deletar o carrossel cascateia para os slides (ON DELETE CASCADE).
-- A unicidade (carousel_id, position) garante ordem sem buracos.
CREATE TABLE public.slides (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  carousel_id           UUID        NOT NULL
                                    REFERENCES public.carousels(id) ON DELETE CASCADE,
  position              SMALLINT    NOT NULL DEFAULT 0,

  -- Conteúdo textual
  title                 TEXT        NOT NULL DEFAULT '',
  description           TEXT        NOT NULL DEFAULT '',
  subtitle              TEXT        NOT NULL DEFAULT '',
  highlight_word        TEXT        NOT NULL DEFAULT '',

  -- Imagens
  background_image_url  TEXT        NOT NULL DEFAULT '',
  grid_image_url        TEXT        NOT NULL DEFAULT '',
  image_type            TEXT        NOT NULL DEFAULT 'grid'
                                    CHECK (image_type IN ('background', 'grid', 'mixed')),
  image_position        JSONB       NOT NULL DEFAULT '{"x":50,"y":50,"zoom":175}'::jsonb,

  -- Visual
  background_color      TEXT        NOT NULL DEFAULT '#111111',
  shadow_style          TEXT        NOT NULL DEFAULT 'base',
  shadow_opacity        SMALLINT    NOT NULL DEFAULT 88,

  -- Tipografia
  text_position         TEXT        NOT NULL DEFAULT 'bottom-left',
  text_offset           JSONB                DEFAULT NULL,
  text_alignment        TEXT        NOT NULL DEFAULT 'left'
                                    CHECK (text_alignment IN ('left', 'center', 'right')),
  font_size             JSONB       NOT NULL DEFAULT '{"title":48,"description":18}'::jsonb,
  line_height           REAL        NOT NULL DEFAULT 1.2,

  -- CTA button
  cta_button            JSONB       NOT NULL DEFAULT '{"show":false}'::jsonb,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (carousel_id, position)
);

-- ── tweets ────────────────────────────────────────────────────
-- Posts gerados para Twitter/X (Build in Public).
-- Armazena o prompt, as variações geradas e metadados de publicação.
CREATE TABLE public.tweets (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL DEFAULT auth.uid()
                            REFERENCES auth.users(id) ON DELETE CASCADE,

  project       TEXT        NOT NULL DEFAULT '',
  tone          TEXT        NOT NULL DEFAULT 'honesto',
  prompt        TEXT        NOT NULL DEFAULT '',
  context       TEXT                 DEFAULT NULL,

  -- Variações geradas pela IA (array de objetos {tone, content, hook})
  variations    JSONB       NOT NULL DEFAULT '[]'::jsonb,

  -- Qual variação foi escolhida para publicar (índice, null = nenhuma)
  published_index  SMALLINT          DEFAULT NULL,
  published_at     TIMESTAMPTZ       DEFAULT NULL,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────
-- 3. TRIGGERS
-- ─────────────────────────────────────────────────────────────

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER set_carousels_updated
  BEFORE UPDATE ON public.carousels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_tweets_updated
  BEFORE UPDATE ON public.tweets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─────────────────────────────────────────────────────────────
-- 4. ÍNDICES
-- ─────────────────────────────────────────────────────────────

-- Listagem do dashboard (carrosséis do usuário, ordem por data)
CREATE INDEX idx_carousels_user_updated ON public.carousels (user_id, updated_at DESC);

-- Slides de um carrossel na ordem correta
CREATE INDEX idx_slides_carousel_position ON public.slides (carousel_id, position ASC);

-- Tweets do usuário, mais recentes primeiro
CREATE INDEX idx_tweets_user_created ON public.tweets (user_id, created_at DESC);


-- ─────────────────────────────────────────────────────────────
-- 5. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carousels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slides    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tweets    ENABLE ROW LEVEL SECURITY;

-- profiles: cada usuário vê e edita só o próprio perfil
CREATE POLICY profiles_self ON public.profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- carousels: cada usuário vê e edita só os próprios
CREATE POLICY carousels_owner ON public.carousels
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- slides: acesso permitido se o carrossel pertence ao usuário
CREATE POLICY slides_owner ON public.slides
  FOR ALL USING (
    auth.uid() = (SELECT user_id FROM public.carousels WHERE id = carousel_id)
  );

-- tweets: cada usuário vê e edita só os próprios
CREATE POLICY tweets_owner ON public.tweets
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
