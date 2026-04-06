import { NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Executes a SQL statement via Supabase's internal pg-meta API
async function execSQL(sql: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ query: sql }),
  });
  return res;
}

// Alternative: use pg-meta admin endpoint
async function execSQLAdmin(sql: string) {
  const ref = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  return res;
}

export async function GET() {
  // Try to create tables using Supabase's pg-meta via management API
  const schema = `
-- Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  name TEXT,
  handle TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Carousels
CREATE TABLE IF NOT EXISTS carousels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  style TEXT NOT NULL DEFAULT 'minimalist',
  theme TEXT DEFAULT 'dark',
  font_pair TEXT DEFAULT 'Space Grotesk + Inter',
  accent_color TEXT DEFAULT '#00CFFF',
  global_settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Slides
CREATE TABLE IF NOT EXISTS slides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carousel_id UUID REFERENCES carousels(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  description TEXT,
  highlight_word TEXT,
  background_image_url TEXT,
  grid_image_url TEXT,
  image_type TEXT DEFAULT 'grid',
  image_position JSONB DEFAULT '{"x": 50, "y": 50, "zoom": 175}',
  shadow_style TEXT DEFAULT 'base',
  shadow_opacity INTEGER DEFAULT 88,
  text_position TEXT DEFAULT 'bottom-left',
  text_offset JSONB,
  text_alignment TEXT DEFAULT 'left',
  subtitle TEXT,
  font_size JSONB DEFAULT '{"title": 48, "description": 18}',
  line_height FLOAT DEFAULT 1.2,
  cta_button JSONB DEFAULT '{"show": false}',
  background_color TEXT DEFAULT '#111111',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE carousels ENABLE ROW LEVEL SECURITY;
ALTER TABLE slides ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_own') THEN
    CREATE POLICY profiles_own ON profiles FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='carousels' AND policyname='carousels_own') THEN
    CREATE POLICY carousels_own ON carousels FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='slides' AND policyname='slides_own') THEN
    CREATE POLICY slides_own ON slides FOR ALL USING (
      auth.uid() = (SELECT user_id FROM carousels WHERE id = carousel_id)
    );
  END IF;
END $$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
`;

  try {
    const res = await execSQLAdmin(schema);
    const body = await res.text();

    if (res.ok) {
      return NextResponse.json({ ok: true, message: 'Banco de dados configurado com sucesso!' });
    }

    // Try alternative
    return NextResponse.json({
      ok: false,
      status: res.status,
      body,
      sql: schema,
      instructions: 'Cole o SQL acima no Supabase Dashboard → SQL Editor e execute.',
    }, { status: 200 });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: String(err),
      sql: schema,
      instructions: 'Cole o SQL abaixo no Supabase Dashboard → SQL Editor e execute.',
    }, { status: 200 });
  }
}
