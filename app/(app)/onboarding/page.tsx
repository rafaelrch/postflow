'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, AtSign, Briefcase, CheckCircle2, Loader2, Palette } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button';
import { createClient } from '@/lib/supabase';

const DEFAULT_COLORS = ['#0A0A0A', '#FAFAF7', '#E4572E'];

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState('');
  const [alreadyOnboarded, setAlreadyOnboarded] = useState(false);

  const [brandName, setBrandName] = useState('');
  const [instagramHandle, setInstagramHandle] = useState('');
  const [newsInstagramHandle, setNewsInstagramHandle] = useState('');
  const [twitterHandle, setTwitterHandle] = useState('');
  const [palette, setPalette] = useState(DEFAULT_COLORS);
  const [niche, setNiche] = useState('');
  const [audience, setAudience] = useState('');
  const [brandStory, setBrandStory] = useState('');
  const [audiencePains, setAudiencePains] = useState('');
  const [defaultTone, setDefaultTone] = useState('');

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      // getSession lê do storage local (instantâneo); getUser fazia uma
      // round-trip ao Supabase antes de renderizar o formulário.
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        router.replace('/login?next=/onboarding');
        return;
      }

      setUserId(user.id);

      const { data } = await supabase
        .from('profiles')
        .select('brand_name, workspace_name, instagram_handle, news_instagram_handle, twitter_handle, brand_palette, niche, audience, brand_story, audience_pains, default_tone, onboarding_completed')
        .eq('id', user.id)
        .single();

      if (data) {
        setBrandName(data.brand_name || data.workspace_name || '');
        setInstagramHandle(data.instagram_handle || '');
        setNewsInstagramHandle(data.news_instagram_handle || '');
        setTwitterHandle(data.twitter_handle || '');
        setPalette(Array.isArray(data.brand_palette) && data.brand_palette.length ? data.brand_palette : DEFAULT_COLORS);
        setNiche(data.niche || '');
        setAudience(data.audience || '');
        setBrandStory(data.brand_story || '');
        setAudiencePains(data.audience_pains || '');
        setDefaultTone(data.default_tone || '');
        setAlreadyOnboarded(Boolean(data.onboarding_completed));
      }

      setLoading(false);
    };

    load();
  }, [router]);

  const updateColor = (index: number, value: string) => {
    setPalette((current) => current.map((color, i) => (i === index ? value : color)));
  };

  const removeColor = (index: number) => {
    if (palette.length <= 1) return;
    setPalette((current) => current.filter((_, i) => i !== index));
  };

  const addColor = () => {
    if (palette.length >= 6) return;
    setPalette((current) => [...current, '#FFFFFF']);
  };

  const normalizeHandle = (value: string) => value.trim().replace(/^@/, '');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!brandName.trim()) {
      toast.error('Dê um nome para a marca.');
      return;
    }
    if (!instagramHandle.trim()) {
      toast.error('Informe o @ do Instagram para os carrosséis.');
      return;
    }

    setSaving(true);

    try {
      const supabase = createClient();
      const cleanInstagram = normalizeHandle(instagramHandle);
      const cleanNewsInstagram = normalizeHandle(newsInstagramHandle) || cleanInstagram;
      const cleanTwitter = normalizeHandle(twitterHandle);

      const profilePayload = {
        id: userId,
        workspace_name: brandName.trim(),
        brand_name: brandName.trim(),
        handle: cleanInstagram,
        instagram_handle: cleanInstagram,
        news_instagram_handle: cleanNewsInstagram,
        twitter_handle: cleanTwitter,
        brand_palette: palette,
        niche: niche.trim(),
        audience: audience.trim(),
        brand_story: brandStory.trim(),
        audience_pains: audiencePains.trim(),
        default_tone: defaultTone.trim(),
        onboarding_completed: true,
      };

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(profilePayload);

      if (profileError) throw profileError;

      const { data: existingProject } = await supabase
        .from('projects')
        .select('id')
        .eq('user_id', userId)
        .eq('name', brandName.trim())
        .maybeSingle();

      const projectPayload = {
        user_id: userId,
        name: brandName.trim(),
        description: brandStory.trim(),
        niche: niche.trim(),
        audience: audience.trim(),
        default_tone: defaultTone.trim(),
        brand_voice: {
          instagramHandle: cleanInstagram,
          newsInstagramHandle: cleanNewsInstagram,
          twitterHandle: cleanTwitter,
          palette,
          audiencePains: audiencePains.trim(),
          story: brandStory.trim(),
        },
      };

      const projectQuery = existingProject?.id
        ? supabase.from('projects').update(projectPayload).eq('id', existingProject.id)
        : supabase.from('projects').insert(projectPayload);

      const { error: projectError } = await projectQuery;
      if (projectError) throw projectError;

      if (alreadyOnboarded) {
        toast.success('Branding atualizado!');
      } else {
        toast.success('Branding salvo. Studio liberado.');
        setAlreadyOnboarded(true);
        router.replace('/dashboard');
        router.refresh();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível salvar o onboarding.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 grid place-items-center" style={{ background: 'var(--paper)' }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--ink-dim)' }} />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--paper)' }}>
      <main className="max-w-[1180px] mx-auto px-8 py-10">
        <header className="mb-8">
          <p className="section-kicker flex items-center gap-2">
            <span className="dot-live" />
            Setup da marca
          </p>
          <h1 className="section-title mt-3" style={{ fontSize: 'clamp(22px, 6vw, 56px)' }}>
            Antes do studio, vamos entender sua{' '}
            <span style={{ color: 'var(--accent)', fontStyle: 'italic' }}>marca.</span>
          </h1>
          <p className="mt-4 max-w-[640px] text-[14px] leading-6" style={{ color: 'var(--ink-dim)' }}>
            Essas respostas viram contexto para carrosséis, notícias, templates, legendas e agenda editorial.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
          <section className="brand-card flex flex-col gap-6" style={{ padding: 22 }}>
            <Block icon={Briefcase} title="Identidade">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Nome da marca" value={brandName} onChange={setBrandName} placeholder="Creatools" required />
                <Field label="Nicho" value={niche} onChange={setNiche} placeholder="branding, educação, SaaS..." />
              </div>
            </Block>

            <Block icon={AtSign} title="Canais">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="@ Instagram carrosséis" value={instagramHandle} onChange={setInstagramHandle} placeholder="@sua_marca" required />
                <Field label="@ Instagram notícias" value={newsInstagramHandle} onChange={setNewsInstagramHandle} placeholder="se for diferente" />
                <Field label="@ Twitter / X" value={twitterHandle} onChange={setTwitterHandle} placeholder="@sua_marca" />
              </div>
            </Block>

            <Block icon={Palette} title="Branding visual">
              <div className="flex flex-wrap gap-3">
                {palette.map((color, index) => {
                  const safeColor = /^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#000000';
                  return (
                    <div
                      key={`color-${index}`}
                      className="flex items-center gap-2 rounded-[10px] px-2 py-2"
                      style={{ border: '1.5px solid var(--ink)' }}
                    >
                      <label
                        className="relative w-7 h-7 rounded-[6px] border cursor-pointer overflow-hidden shrink-0"
                        style={{ background: color, borderColor: 'var(--line-strong)' }}
                        title="Clique para abrir o seletor de cor"
                      >
                        <input
                          type="color"
                          value={safeColor}
                          onChange={(e) => updateColor(index, e.target.value.toUpperCase())}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          aria-label={`Cor ${index + 1}`}
                        />
                      </label>
                      <input
                        type="text"
                        value={color}
                        onChange={(e) => updateColor(index, e.target.value)}
                        className="bg-transparent outline-none w-[86px] font-mono text-[12px] uppercase"
                        style={{ color: 'var(--ink)' }}
                        spellCheck={false}
                      />
                      {palette.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeColor(index)}
                          className="w-5 h-5 grid place-items-center rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0"
                          style={{ color: 'var(--ink-dim)' }}
                          aria-label={`Remover cor ${index + 1}`}
                          title="Remover"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
                {palette.length < 6 && (
                  <button type="button" className="brand-btn outline sm" onClick={addColor}>Adicionar cor</button>
                )}
              </div>
              <p className="text-[11.5px] mt-2" style={{ color: 'var(--ink-dim)' }}>
                Clique no quadrado pra abrir o seletor de cor, ou edite o hexadecimal direto.
              </p>
            </Block>

            <Block title="Estratégia">
              <div className="grid grid-cols-1 gap-4">
                <Textarea label="Fale um pouco sobre a marca" value={brandStory} onChange={setBrandStory} placeholder="Como nasceu, o que vende, o que defende, que percepção quer construir..." />
                <Textarea label="Quem é o público?" value={audience} onChange={setAudience} placeholder="Descreva a audiência: perfil, maturidade, desejo, contexto..." />
                <Textarea label="Quais são as dores desse público?" value={audiencePains} onChange={setAudiencePains} placeholder="Medos, objeções, frustrações, dúvidas recorrentes..." />
                <Field label="Tom de voz padrão" value={defaultTone} onChange={setDefaultTone} placeholder="premium, direto, educativo, provocativo..." />
              </div>
            </Block>
          </section>

          <aside className="brand-card h-fit sticky top-8" style={{ padding: 20 }}>
            <CheckCircle2 className="w-7 h-7 mb-4" style={{ color: 'var(--accent)' }} />
            <h2 className="font-display text-[34px] leading-none mb-3">Contexto salvo no usuário</h2>
            <p className="text-[13.5px] leading-6 mb-5" style={{ color: 'var(--ink-dim)' }}>
              A IA vai usar esse briefing para gerar conteúdo mais coerente e manter tudo relacionado à sua conta.
            </p>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {alreadyOnboarded ? 'Salvar alterações' : 'Liberar studio'}
            </Button>
          </aside>
        </form>
      </main>
    </div>
  );
}

function Block({ icon: Icon, title, children }: { icon?: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        {Icon ? <Icon className="w-4 h-4" /> : null}
        <h2 className="section-kicker" style={{ color: 'var(--ink)' }}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Field({ label, value, onChange, ...props }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <label className="block">
      <span className="section-kicker block mb-2">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="brand-input" {...props} />
    </label>
  );
}

function Textarea({ label, value, onChange, ...props }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>) {
  return (
    <label className="block">
      <span className="section-kicker block mb-2">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} className="brand-textarea min-h-[116px]" {...props} />
    </label>
  );
}
