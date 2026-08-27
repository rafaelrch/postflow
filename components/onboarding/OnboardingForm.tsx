'use client';

import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { HugeiconsIcon } from '@hugeicons/react';
import { CheckmarkCircle01Icon, Loading03Icon } from '@hugeicons/core-free-icons';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button';
import { Swatch as AnimatedSwatch, useNativeHoverAnimation } from '@/lib/animated-heroicons';
import { createClient } from '@/lib/supabase';
import { uploadImageFile } from '@/lib/upload-image';
import {
  CHANNEL_OPTIONS,
  parseProfessionalProfiles,
  parseReferralSource,
  parseSelectedChannels,
  PROFESSIONAL_PROFILE_OPTIONS,
  REFERRAL_OPTIONS,
  type OnboardingChannel,
} from '@/lib/onboarding-options';
import PhotoEditor from './PhotoEditor';
import { registerWorkspaceChangeListener } from '@/lib/workspace-events';

const COLORS = ['#0A0A0A', '#FAFAF7', '#E4572E'];
const STEPS = ['Boas-vindas', 'Workspace', 'Canais', 'Foto', 'Revisar'];
const DRAFT_VERSION = 2;
type FormData = { workspaceName: string; firstName: string; lastName: string; professionalProfile: string; referralSource: string; selectedChannels: OnboardingChannel[]; brandName: string; photoUrl: string; instagramHandle: string; newsInstagramHandle: string; twitterHandle: string; palette: string[]; niche: string; audience: string; brandStory: string; audiencePains: string; defaultTone: string };
type Draft = Partial<FormData> & { step?: number; version?: number };
const empty = (): FormData => ({ workspaceName: '', firstName: '', lastName: '', professionalProfile: '', referralSource: '', selectedChannels: ['instagram_carousel'], brandName: '', photoUrl: '', instagramHandle: '', newsInstagramHandle: '', twitterHandle: '', palette: COLORS, niche: '', audience: '', brandStory: '', audiencePains: '', defaultTone: '' });
const validStep = (step: unknown) => typeof step === 'number' && step >= 1 && step <= STEPS.length ? step : 1;
const draftStep = (draft: Draft) => {
  const step = validStep(draft.step);
  if (draft.version === DRAFT_VERSION) return step;
  return step === 2 ? 3 : step === 3 ? 4 : step === 4 ? 5 : step;
};

export default function OnboardingForm({ onComplete, compact = false }: { onComplete?: () => void; compact?: boolean }) {
  const [data, setData] = useState<FormData>(empty);
  const [userId, setUserId] = useState('');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState('');
  const [workspaceRefreshNonce, setWorkspaceRefreshNonce] = useState(0);
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const draftKey = userId ? `onboarding-draft:${userId}${workspaceId ? `:${workspaceId}` : ''}` : '';
  const update = <K extends keyof FormData>(key: K, value: FormData[K]) => setData((current) => ({ ...current, [key]: value }));
  const persistDraft = (nextData: FormData, nextStep: number) => { if (draftKey) localStorage.setItem(draftKey, JSON.stringify({ ...nextData, step: nextStep, version: DRAFT_VERSION })); };

  useEffect(() => {
    let alive = true;
    let activeUserId: string | null = null;
    const load = async (id: string) => {
      activeUserId = id; setLoading(true); setUserId(id); setWorkspaceId(''); setData(empty()); setStep(1); setPhotoFile(null);
      let activeWorkspace: { id?: string; name?: string } | null = null;
      let brand: Record<string, unknown> | null = null;
      try {
        const workspacesResponse = await fetch('/api/workspaces', { cache: 'no-store' });
        const workspaceBody = workspacesResponse.ok ? await workspacesResponse.json() as { activeWorkspace?: { id?: string; name?: string } | null } : null;
        activeWorkspace = workspaceBody?.activeWorkspace ?? null;
        if (activeWorkspace?.id) {
          setWorkspaceId(activeWorkspace.id);
          const brandResponse = await fetch(`/api/workspaces/${encodeURIComponent(activeWorkspace.id)}/brand`, { cache: 'no-store' });
          if (brandResponse.ok) {
            const brandBody = await brandResponse.json() as { brand?: Record<string, unknown> | null };
            brand = brandBody.brand ?? null;
          }
        }
      } catch {
        // Instalações antigas seguem usando o snapshot legado do perfil.
      }
      const draftStorageKey = activeWorkspace?.id ? `onboarding-draft:${id}:${activeWorkspace.id}` : `onboarding-draft:${id}`;
      const rawDraft = localStorage.getItem(draftStorageKey);
      let draft: Draft | null = null;
      try { draft = rawDraft ? JSON.parse(rawDraft) : null; } catch { localStorage.removeItem(`onboarding-draft:${id}`); }
      if (draft && alive) {
        const draftChannels = parseSelectedChannels(draft.selectedChannels, {
          instagram_carousel: draft.instagramHandle,
          instagram_news: draft.newsInstagramHandle,
          twitter: draft.twitterHandle,
        });
        setData({
          ...empty(),
          ...draft,
          referralSource: parseReferralSource(draft.referralSource) ?? '',
          selectedChannels: draftChannels.length || draft.selectedChannels !== undefined ? draftChannels : ['instagram_carousel'],
          palette: Array.isArray(draft.palette) && draft.palette.length ? draft.palette : COLORS,
        });
        setStep(draftStep(draft));
      }
      const response = await fetch('/api/onboarding', { cache: 'no-store' });
      if (!response.ok || !alive || activeUserId !== id) { if (alive && activeUserId === id) setLoading(false); return; }
      const { profile } = await response.json();
      if (!alive || activeUserId !== id) return;
      if (profile && !draft) {
        const value = (key: string, fallback = '') => typeof brand?.[key] === 'string' ? String(brand[key]) : fallback;
        const colors = Array.isArray(brand?.brand_palette) ? brand.brand_palette : profile.brand_palette;
        const profileChannels = parseSelectedChannels(undefined, {
          instagram_carousel: value('instagram_handle', profile.instagram_handle),
          instagram_news: value('news_instagram_handle', profile.news_instagram_handle),
          twitter: value('twitter_handle', profile.twitter_handle),
        });
        setData({
          ...empty(),
          workspaceName: activeWorkspace?.name || profile.workspace_name || '',
          firstName: profile.first_name || '',
          lastName: profile.last_name || '',
          professionalProfile: profile.professional_profile || '',
          referralSource: parseReferralSource(profile.referral_source) || '',
          selectedChannels: profileChannels.length ? profileChannels : ['instagram_carousel'],
          brandName: value('brand_name', profile.brand_name || profile.workspace_name || ''),
          photoUrl: profile.photo_url || '',
          instagramHandle: value('instagram_handle', profile.instagram_handle || ''),
          newsInstagramHandle: value('news_instagram_handle', profile.news_instagram_handle || ''),
          twitterHandle: value('twitter_handle', profile.twitter_handle || ''),
          palette: Array.isArray(colors) && colors.length ? colors as string[] : COLORS,
          niche: value('niche', profile.niche || ''),
          // Campos legados continuam sendo lidos para round-trip, mas não são
          // mais coletados por nenhuma etapa deste wizard.
          audience: value('audience', profile.audience || ''),
          brandStory: value('brand_story', profile.brand_story || ''),
          audiencePains: value('audience_pains', profile.audience_pains || ''),
          defaultTone: value('default_tone', profile.default_tone || ''),
        });
      }
      setLoading(false);
    };
    const supabase = createClient();
    void supabase.auth.getSession().then(({ data: sessionData }: { data: { session: Session | null } }) => { const id = sessionData.session?.user.id; if (id && alive) void load(id); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => { const id = session?.user.id; if (id && id !== activeUserId) void load(id); });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, [workspaceRefreshNonce]);

  useEffect(() => registerWorkspaceChangeListener(() => {
    setWorkspaceRefreshNonce((value) => value + 1);
  }), []);

  useEffect(() => {
    if (!draftKey || loading) return;
    persistDraft(data, step);
    const timer = window.setTimeout(() => { void save(false, true); }, 900);
    return () => window.clearTimeout(timer);
  // The draft snapshot is deliberately persisted from the current render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, step, draftKey, loading]);

  const save = async (complete: boolean, silent = false) => {
    const handleByChannel: Record<OnboardingChannel, string> = {
      instagram_carousel: data.instagramHandle,
      instagram_news: data.newsInstagramHandle,
      twitter: data.twitterHandle,
    };
    const missingChannel = data.selectedChannels.find((channel) => !handleByChannel[channel].trim());
    if (complete && (!data.brandName.trim() || !data.selectedChannels.length || missingChannel)) {
      if (!silent) toast.error(!data.brandName.trim() ? 'Informe o nome da marca.' : 'Informe o @ de cada canal selecionado.');
      return false;
    }
    const response = await fetch('/api/onboarding', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, complete }) });
    if (!response.ok) { if (!silent) toast.error((await response.json().catch(() => ({}))).error || 'Não foi possível salvar.'); return false; }
    if (complete && draftKey) localStorage.removeItem(draftKey);
    return true;
  };

  const move = (nextStep: number) => { const safe = Math.min(STEPS.length, Math.max(1, nextStep)); setStep(safe); persistDraft(data, safe); };
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (step !== STEPS.length) { move(step + 1); return; } setSaving(true); const saved = await save(true); setSaving(false); if (saved) { toast.success('Branding salvo. Studio liberado.'); onComplete?.(); } };
  const choosePhoto = (file: File) => { if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) { toast.error('Escolha uma imagem de até 10 MB.'); return; } setPhotoFile(file); };
  const uploadEdited = async (file: File) => { setPhotoFile(null); setPhotoUploading(true); try { update('photoUrl', await uploadImageFile(file, 'profile-photos')); toast.success('Foto pronta para salvar.'); } catch (error) { toast.error(error instanceof Error ? error.message : 'Falha no upload da foto.'); } finally { setPhotoUploading(false); } };
  const toggleChannel = (value: OnboardingChannel) => {
    const selected = data.selectedChannels;
    const removing = selected.includes(value);
    const next = removing ? selected.filter((item) => item !== value) : [...selected, value];
    setData((current) => ({
      ...current,
      selectedChannels: next,
      ...(removing && value === 'instagram_carousel' ? { instagramHandle: '' } : {}),
      ...(removing && value === 'instagram_news' ? { newsInstagramHandle: '' } : {}),
      ...(removing && value === 'twitter' ? { twitterHandle: '' } : {}),
    }));
  };

  if (loading) return <div className="grid flex-1 place-items-center"><HugeiconsIcon icon={Loading03Icon} size={20} strokeWidth={1.75} aria-hidden className="animate-spin motion-reduce:animate-none" /></div>;
  return <form onSubmit={submit} className={`flex min-h-0 flex-1 flex-col ${compact ? '' : 'max-w-4xl'}`}>
    <WizardStepper step={step} />
    {/* min-h-0 + overflow-y-auto: quem rola é o CORPO do modal. Sem isto o
        conteúdo alto (o editor de foto) atravessava a borda inferior do cartão
        e ia flutuar por cima do fundo, colidindo com Voltar/Continuar. */}
    <div className="mt-5 min-h-0 flex-1 overflow-y-auto rounded-2xl p-4 sm:p-6" style={{ background: 'var(--paper-2)', border: '1px solid var(--border)' }}>
      {step === 1 && <section className="grid gap-5"><Heading title="Boas-vindas ao Creatools" text="Vamos preparar seu espaço para criar conteúdo com mais contexto e consistência." /><div className="grid gap-4 sm:grid-cols-2"><Field label="Seu nome" value={data.firstName} onChange={(value) => update('firstName', value)} autoFocus /><Field label="Seu sobrenome" value={data.lastName} onChange={(value) => update('lastName', value)} /><SelectField label="Perfil profissional" value={parseProfessionalProfiles(data.professionalProfile)[0] || ''} onChange={(value) => update('professionalProfile', value)} options={PROFESSIONAL_PROFILE_OPTIONS} placeholder="Selecione seu perfil" /><SelectField label="Como você conheceu o Creatools?" value={data.referralSource} onChange={(value) => update('referralSource', value)} options={REFERRAL_OPTIONS} placeholder="Selecione uma opção" /></div></section>}
      {step === 2 && <section className="grid gap-5"><Heading title="Seu Workspace" text="Dê um nome ao espaço e à marca que você vai desenvolver aqui." /><div className="grid gap-4 sm:grid-cols-2"><Field label="Nome do Workspace" value={data.workspaceName} onChange={(value) => update('workspaceName', value)} placeholder="Nome do cliente ou negócio" /><Field label="Nome da marca" value={data.brandName} onChange={(value) => update('brandName', value)} required /><Field label="Nicho" value={data.niche} onChange={(value) => update('niche', value)} /></div><Palette value={data.palette} onChange={(palette) => update('palette', palette)} /></section>}
      {step === 3 && <section className="grid gap-5"><Heading title="Seus canais" text="Selecione os canais que você usa e informe o @ de cada um." /><div className="flex flex-wrap gap-2" role="group" aria-label="Canais"><span className="sr-only">Canais</span>{CHANNEL_OPTIONS.map((option) => <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm" style={{ border: '1px solid var(--border)', background: data.selectedChannels.includes(option.value) ? 'var(--paper)' : 'transparent' }}><input type="checkbox" checked={data.selectedChannels.includes(option.value)} onChange={() => toggleChannel(option.value)} />{option.label}</label>)}</div><div className="grid gap-4 sm:grid-cols-3">{data.selectedChannels.includes('instagram_carousel') && <Field label="@ Instagram de carrossel" value={data.instagramHandle} onChange={(value) => update('instagramHandle', value)} required autoFocus />}{data.selectedChannels.includes('instagram_news') && <Field label="@ Instagram de notícias" value={data.newsInstagramHandle} onChange={(value) => update('newsInstagramHandle', value)} required />}{data.selectedChannels.includes('twitter') && <Field label="@ Twitter / X" value={data.twitterHandle} onChange={(value) => update('twitterHandle', value)} required />}</div></section>}
      {/* Editando a foto, o passo 4 vira SÓ o editor: ele ocupa o cartão
          inteiro em vez de crescer por baixo do que já estava ali. Assim o
          círculo continua grande e nada escapa do modal. */}
      {step === 4 && photoFile && <PhotoEditor file={photoFile} onCancel={() => setPhotoFile(null)} onConfirm={uploadEdited} />}
      {step === 4 && !photoFile && <section className="grid gap-5"><Heading title="Foto de perfil" text="Opcional. Você pode ajustar antes de usar." /><div className="flex items-center gap-5"><div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full" style={{ border: '2px solid var(--ink)', background: 'var(--paper)' }}>{data.photoUrl ? <img src={data.photoUrl} alt="Foto de perfil" className="h-full w-full object-cover" /> : <span className="text-xs">sem foto</span>}</div><div className="flex flex-wrap gap-2"><button type="button" className="brand-btn outline sm" onClick={() => photoInputRef.current?.click()} disabled={photoUploading}>{photoUploading ? 'Enviando…' : data.photoUrl ? 'Trocar foto' : 'Adicionar foto'}</button>{data.photoUrl && <button type="button" className="brand-btn outline sm" onClick={() => update('photoUrl', '')}>Remover</button>}<input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) choosePhoto(file); event.currentTarget.value = ''; }} /></div></div></section>}
      {step === 5 && <section className="grid gap-5"><Heading title="Revise e conclua" text="Você poderá editar tudo mais tarde na página de onboarding." /><dl className="grid gap-3 text-sm sm:grid-cols-2"><Review label="Marca" value={data.brandName || 'Não informado'} /><Review label="Workspace" value={data.workspaceName || 'Não informado'} /><Review label="Canais" value={data.selectedChannels.map((channel) => CHANNEL_OPTIONS.find((option) => option.value === channel)?.label).filter(Boolean).join(', ') || 'Não informado'} /><Review label="Nicho" value={data.niche || 'Não informado'} /><Review label="Perfil" value={parseProfessionalProfiles(data.professionalProfile).map((profile) => PROFESSIONAL_PROFILE_OPTIONS.find((option) => option.value === profile)?.label).filter(Boolean).join(', ') || 'Não informado'} /><Review label="Como conheceu" value={REFERRAL_OPTIONS.find((option) => option.value === data.referralSource)?.label || 'Não informado'} /><Review label="Foto" value={data.photoUrl ? 'Adicionada' : 'Opcional — não adicionada'} /></dl>{(!data.brandName.trim() || !data.selectedChannels.length || data.selectedChannels.some((channel) => !({ instagram_carousel: data.instagramHandle, instagram_news: data.newsInstagramHandle, twitter: data.twitterHandle }[channel] ?? '').trim())) && <p className="rounded-lg px-3 py-2 text-sm" style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)' }}>Para concluir, preencha o nome da marca e o @ de cada canal selecionado.</p>}</section>}
    </div>
    {/* Com o editor aberto quem manda são Cancelar/Usar esta foto. Deixar
        Voltar/Continuar aqui embaixo poria dois pares de botões na tela ao
        mesmo tempo — foi parte do que o Rafael viu no print. */}
    <footer className="mt-5 flex shrink-0 items-center justify-between gap-3"><span data-testid="onboarding-step" className="sr-only">{step}</span>{photoFile ? <p className="text-xs" style={{ color: 'var(--ink-dim)' }}>Termine o ajuste da foto para continuar.</p> : <>{step > 1 ? <button type="button" className="brand-btn outline" onClick={() => move(step - 1)}>Voltar</button> : <span />}{step < STEPS.length ? <button type="button" className="brand-btn" onClick={() => move(step + 1)}>Continuar</button> : <Button type="submit" disabled={saving}>{saving ? <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={1.75} aria-hidden className="animate-spin motion-reduce:animate-none" /> : 'Concluir onboarding'}</Button>}</>}</footer>
  </form>;
}

function WizardStepper({ step }: { step: number }) { return <ol className="grid grid-cols-5 gap-1 sm:gap-2">{STEPS.map((label, index) => { const number = index + 1; const done = number < step; const current = number === step; return <li key={label} className="relative flex min-w-0 flex-col items-center gap-1 text-center"><span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${done || current ? 'text-white' : ''}`} style={{ background: done || current ? 'var(--accent)' : 'var(--paper-2)', border: '1px solid var(--border)' }}>{done ? <HugeiconsIcon icon={CheckmarkCircle01Icon} size={16} strokeWidth={1.75} aria-hidden /> : number}</span>{number < STEPS.length && <span className="absolute left-[calc(50%+14px)] top-[13px] h-px w-[calc(100%-28px)]" style={{ background: done ? 'var(--accent)' : 'var(--border)' }} />}<span className="truncate text-[10px] sm:text-xs" style={{ color: current ? 'var(--ink)' : 'var(--ink-dim)' }}>{label}</span></li>; })}</ol>; }
function Heading({ title, text }: { title: string; text: string }) { return <header><p className="section-kicker">Passo</p><h2 className="font-display mt-1 text-3xl leading-none">{title}</h2><p className="mt-2 text-sm" style={{ color: 'var(--ink-dim)' }}>{text}</p></header>; }
function Review({ label, value }: { label: string; value: string }) { return <div className="rounded-lg p-3" style={{ background: 'var(--paper)' }}><dt className="section-kicker">{label}</dt><dd className="mt-1 truncate">{value}</dd></div>; }
function Palette({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const animation = useNativeHoverAnimation();

  return (
    <section onMouseEnter={animation.onMouseEnter} onMouseLeave={animation.onMouseLeave}>
      <span className="section-kicker mb-2 flex items-center gap-2">
        <AnimatedSwatch ref={animation.iconRef} size={16} aria-hidden />
        <span>Identidade visual</span>
      </span>
      <div className="flex flex-wrap gap-2">
        {value.map((color, index) => (
          <label
            key={index}
            className="flex items-center gap-1 rounded-lg px-2 py-1"
            style={{ border: '1px solid var(--border)' }}
          >
            <input
              aria-label={`Cor ${index + 1}`}
              type="color"
              value={/^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#000000'}
              onChange={(event) => onChange(value.map((item, itemIndex) => itemIndex === index ? event.target.value.toUpperCase() : item))}
            />
            <input
              className="w-16 bg-transparent text-xs"
              value={color}
              onChange={(event) => onChange(value.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
            />
            {value.length > 1 && (
              <button
                type="button"
                aria-label={`Remover cor ${index + 1}`}
                onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
              >
                ×
              </button>
            )}
          </label>
        ))}
        {value.length < 6 && (
          <button type="button" className="brand-btn outline sm" onClick={() => onChange([...value, '#FFFFFF'])}>
            Adicionar cor
          </button>
        )}
      </div>
    </section>
  );
}
function SelectField({ label, value, onChange, options, placeholder }: { label: string; value: string; onChange: (value: string) => void; options: readonly { value: string; label: string }[]; placeholder: string }) { return <label className="block"><span className="section-kicker mb-2 block">{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="brand-input"><option value="">{placeholder}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }
function Field({ label, value, onChange, ...props }: { label: string; value: string; onChange: (value: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) { return <label className="block"><span className="section-kicker mb-2 block">{label}</span><input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="brand-input" {...props} /></label>; }
function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block"><span className="section-kicker mb-2 block">{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} className="brand-textarea min-h-[84px]" /></label>; }
