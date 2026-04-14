'use client';

import { useState } from 'react';
import { CheckCircle, Copy, ExternalLink, Loader2 } from 'lucide-react';

const SQL = `-- PostFlow Schema — cole e execute no Supabase SQL Editor

CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  name TEXT,
  handle TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE carousels ENABLE ROW LEVEL SECURITY;
ALTER TABLE slides ENABLE ROW LEVEL SECURITY;

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
`.trim();

export default function SetupPage() {
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCheck = async () => {
    setChecking(true);
    setStatus('idle');
    try {
      const res = await fetch('/api/check-db');
      const data = await res.json();
      if (data.ok) {
        setStatus('ok');
      } else {
        setStatus('error');
        setErrorMsg(data.error || 'Tabelas ainda não criadas');
      }
    } catch {
      setStatus('error');
      setErrorMsg('Erro ao verificar');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Configurar Banco de Dados</h1>
          <p className="text-white/50 text-sm">Execute o SQL abaixo no Supabase para criar as tabelas do PostFlow</p>
        </div>

        <div className="bg-[#111111] border border-white/10 rounded-2xl overflow-hidden">
          {/* Steps */}
          <div className="p-6 border-b border-white/8">
            <ol className="flex flex-col gap-3">
              {[
                { n: 1, text: 'Copie o SQL abaixo', action: null },
                {
                  n: 2,
                  text: 'Abra o Supabase SQL Editor',
                  action: (
                    <a
                      href="https://supabase.com/dashboard/project/sfwegfrzvztfryrthydo/sql/new"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Abrir <ExternalLink className="w-3 h-3" />
                    </a>
                  ),
                },
                { n: 3, text: 'Cole o SQL e clique em "Run"', action: null },
                { n: 4, text: 'Volte aqui e clique em "Verificar"', action: null },
              ].map((step) => (
                <li key={step.n} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-white/10 text-white/60 text-xs font-bold flex items-center justify-center shrink-0">
                    {step.n}
                  </div>
                  <span className="text-sm text-white/70 flex-1">{step.text}</span>
                  {step.action}
                </li>
              ))}
            </ol>
          </div>

          {/* SQL block */}
          <div className="relative">
            <div className="absolute top-3 right-3 z-10">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white text-xs font-medium transition-all"
              >
                {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copiado!' : 'Copiar SQL'}
              </button>
            </div>
            <pre className="p-6 text-xs text-green-300/80 font-mono overflow-auto max-h-72 leading-relaxed">
              {SQL}
            </pre>
          </div>

          {/* Actions */}
          <div className="p-6 border-t border-white/8 flex items-center gap-4">
            <button
              onClick={handleCheck}
              disabled={checking}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black text-sm font-bold hover:bg-white/90 transition-colors disabled:opacity-50"
            >
              {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {checking ? 'Verificando...' : 'Verificar banco de dados'}
            </button>

            {status === 'ok' && (
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <CheckCircle className="w-4 h-4" />
                Banco configurado!{' '}
                <a href="/dashboard" className="underline text-white">Ir para o Dashboard →</a>
              </div>
            )}
            {status === 'error' && (
              <p className="text-red-400 text-sm">{errorMsg}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
