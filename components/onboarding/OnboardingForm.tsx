'use client';

import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button';
import { createClient } from '@/lib/supabase';
import { uploadImageFile } from '@/lib/upload-image';
import PhotoEditor from './PhotoEditor';

const COLORS = ['#0A0A0A', '#FAFAF7', '#E4572E'];
const STEPS = ['Identidade', 'Canais', 'Foto', 'Sobre a marca', 'Revisar'];
type FormData = { brandName: string; photoUrl: string; instagramHandle: string; newsInstagramHandle: string; twitterHandle: string; palette: string[]; niche: string; audience: string; brandStory: string; audiencePains: string; defaultTone: string };
type Draft = Partial<FormData> & { step?: number };
const empty = (): FormData => ({ brandName: '', photoUrl: '', instagramHandle: '', newsInstagramHandle: '', twitterHandle: '', palette: COLORS, niche: '', audience: '', brandStory: '', audiencePains: '', defaultTone: '' });
const validStep = (step: unknown) => typeof step === 'number' && step >= 1 && step <= STEPS.length ? step : 1;

export default function OnboardingForm({ onComplete, compact = false }: { onComplete?: () => void; compact?: boolean }) {
  const [data, setData] = useState<FormData>(empty);
  const [userId, setUserId] = useState('');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const draftKey = userId ? `onboarding-draft:${userId}` : '';
  const update = <K extends keyof FormData>(key: K, value: FormData[K]) => setData((current) => ({ ...current, [key]: value }));
  const persistDraft = (nextData: FormData, nextStep: number) => { if (draftKey) localStorage.setItem(draftKey, JSON.stringify({ ...nextData, step: nextStep })); };

  useEffect(() => {
    let alive = true;
    let activeUserId: string | null = null;
    const load = async (id: string) => {
      activeUserId = id; setLoading(true); setUserId(id); setData(empty()); setStep(1); setPhotoFile(null);
      const rawDraft = localStorage.getItem(`onboarding-draft:${id}`);
      let draft: Draft | null = null;
      try { draft = rawDraft ? JSON.parse(rawDraft) : null; } catch { localStorage.removeItem(`onboarding-draft:${id}`); }
      if (draft && alive) { setData({ ...empty(), ...draft, palette: Array.isArray(draft.palette) && draft.palette.length ? draft.palette : COLORS }); setStep(validStep(draft.step)); }
      const response = await fetch('/api/onboarding', { cache: 'no-store' });
      if (!response.ok || !alive || activeUserId !== id) { if (alive && activeUserId === id) setLoading(false); return; }
      const { profile } = await response.json();
      if (!alive || activeUserId !== id) return;
      if (profile && !draft) setData({ ...empty(), brandName: profile.brand_name || profile.workspace_name || '', photoUrl: profile.photo_url || '', instagramHandle: profile.instagram_handle || '', newsInstagramHandle: profile.news_instagram_handle || '', twitterHandle: profile.twitter_handle || '', palette: Array.isArray(profile.brand_palette) && profile.brand_palette.length ? profile.brand_palette : COLORS, niche: profile.niche || '', audience: profile.audience || '', brandStory: profile.brand_story || '', audiencePains: profile.audience_pains || '', defaultTone: profile.default_tone || '' });
      setLoading(false);
    };
    const supabase = createClient();
    void supabase.auth.getSession().then(({ data: sessionData }: { data: { session: Session | null } }) => { const id = sessionData.session?.user.id; if (id && alive) void load(id); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => { const id = session?.user.id; if (id && id !== activeUserId) void load(id); });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!draftKey || loading) return;
    persistDraft(data, step);
    const timer = window.setTimeout(() => { void save(false, true); }, 900);
    return () => window.clearTimeout(timer);
  // The draft snapshot is deliberately persisted from the current render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, step, draftKey, loading]);

  const save = async (complete: boolean, silent = false) => {
    if (complete && (!data.brandName.trim() || !data.instagramHandle.trim())) { if (!silent) toast.error('Informe o nome da marca e o @ do Instagram.'); return false; }
    const response = await fetch('/api/onboarding', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, complete }) });
    if (!response.ok) { if (!silent) toast.error((await response.json().catch(() => ({}))).error || 'Não foi possível salvar.'); return false; }
    if (complete && draftKey) localStorage.removeItem(draftKey);
    return true;
  };

  const move = (nextStep: number) => { const safe = Math.min(STEPS.length, Math.max(1, nextStep)); setStep(safe); persistDraft(data, safe); };
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (step !== STEPS.length) { move(step + 1); return; } setSaving(true); const saved = await save(true); setSaving(false); if (saved) { toast.success('Branding salvo. Studio liberado.'); onComplete?.(); } };
  const choosePhoto = (file: File) => { if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) { toast.error('Escolha uma imagem de até 10 MB.'); return; } setPhotoFile(file); };
  const uploadEdited = async (file: File) => { setPhotoFile(null); setPhotoUploading(true); try { update('photoUrl', await uploadImageFile(file, 'profile-photos')); toast.success('Foto pronta para salvar.'); } catch (error) { toast.error(error instanceof Error ? error.message : 'Falha no upload da foto.'); } finally { setPhotoUploading(false); } };

  if (loading) return <div className="grid flex-1 place-items-center"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  return <form onSubmit={submit} className={`flex min-h-0 flex-1 flex-col ${compact ? '' : 'max-w-4xl'}`}>
    <WizardStepper step={step} />
    <div className="mt-5 min-h-0 flex-1 rounded-2xl p-4 sm:p-6" style={{ background: 'var(--paper-2)', border: '1px solid var(--border)' }}>
      {step === 1 && <section className="grid gap-5"><Heading title="Sua identidade" text="Comece com o essencial da sua marca." /><div className="grid gap-4 sm:grid-cols-2"><Field label="Nome da marca" value={data.brandName} onChange={(value) => update('brandName', value)} required autoFocus /><Field label="Nicho" value={data.niche} onChange={(value) => update('niche', value)} /></div><Palette value={data.palette} onChange={(palette) => update('palette', palette)} /></section>}
      {step === 2 && <section className="grid gap-5"><Heading title="Seus canais" text="O Instagram de carrosséis é obrigatório para concluir." /><div className="grid gap-4 sm:grid-cols-3"><Field label="@ Instagram carrosséis" value={data.instagramHandle} onChange={(value) => update('instagramHandle', value)} required autoFocus /><Field label="@ Instagram notícias" value={data.newsInstagramHandle} onChange={(value) => update('newsInstagramHandle', value)} /><Field label="@ Twitter / X" value={data.twitterHandle} onChange={(value) => update('twitterHandle', value)} /></div></section>}
      {step === 3 && <section className="grid gap-5"><Heading title="Foto de perfil" text="Opcional. Você pode ajustar antes de usar." /><div className="flex items-center gap-5"><div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full" style={{ border: '2px solid var(--ink)', background: 'var(--paper)' }}>{data.photoUrl ? <img src={data.photoUrl} alt="Foto de perfil" className="h-full w-full object-cover" /> : <span className="text-xs">sem foto</span>}</div><div className="flex flex-wrap gap-2"><button type="button" className="brand-btn outline sm" onClick={() => photoInputRef.current?.click()} disabled={photoUploading}>{photoUploading ? 'Enviando…' : data.photoUrl ? 'Trocar foto' : 'Adicionar foto'}</button>{data.photoUrl && <button type="button" className="brand-btn outline sm" onClick={() => update('photoUrl', '')}>Remover</button>}<input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) choosePhoto(file); event.currentTarget.value = ''; }} /></div></div>{photoFile && <PhotoEditor file={photoFile} onCancel={() => setPhotoFile(null)} onConfirm={uploadEdited} />}</section>}
      {step === 4 && <section className="grid gap-4"><Heading title="Sobre a marca" text="Esse contexto deixa seu conteúdo mais coerente." /><div className="grid gap-4 sm:grid-cols-2"><Textarea label="Fale um pouco sobre a marca" value={data.brandStory} onChange={(value) => update('brandStory', value)} /><Textarea label="Quem é o público?" value={data.audience} onChange={(value) => update('audience', value)} /><Textarea label="Quais são as dores desse público?" value={data.audiencePains} onChange={(value) => update('audiencePains', value)} /><Field label="Tom de voz padrão" value={data.defaultTone} onChange={(value) => update('defaultTone', value)} /></div></section>}
      {step === 5 && <section className="grid gap-5"><Heading title="Revise e conclua" text="Você poderá editar tudo mais tarde na página de onboarding." /><dl className="grid gap-3 text-sm sm:grid-cols-2"><Review label="Marca" value={data.brandName || 'Não informado'} /><Review label="Instagram" value={data.instagramHandle ? `@${data.instagramHandle.replace(/^@/, '')}` : 'Não informado'} /><Review label="Nicho" value={data.niche || 'Não informado'} /><Review label="Foto" value={data.photoUrl ? 'Adicionada' : 'Opcional — não adicionada'} /></dl>{(!data.brandName.trim() || !data.instagramHandle.trim()) && <p className="rounded-lg px-3 py-2 text-sm" style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)' }}>Para concluir, preencha o nome da marca e o Instagram nos passos anteriores.</p>}</section>}
    </div>
    <footer className="mt-5 flex items-center justify-between gap-3"><span data-testid="onboarding-step" className="sr-only">{step}</span>{step > 1 ? <button type="button" className="brand-btn outline" onClick={() => move(step - 1)}>Voltar</button> : <span />}{step < STEPS.length ? <button type="button" className="brand-btn" onClick={() => move(step + 1)}>Continuar</button> : <Button type="submit" disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Concluir onboarding'}</Button>}</footer>
  </form>;
}

function WizardStepper({ step }: { step: number }) { return <ol className="grid grid-cols-5 gap-1 sm:gap-2">{STEPS.map((label, index) => { const number = index + 1; const done = number < step; const current = number === step; return <li key={label} className="relative flex min-w-0 flex-col items-center gap-1 text-center"><span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${done || current ? 'text-white' : ''}`} style={{ background: done || current ? 'var(--accent)' : 'var(--paper-2)', border: '1px solid var(--border)' }}>{done ? <Check className="w-4 h-4" /> : number}</span>{number < STEPS.length && <span className="absolute left-[calc(50%+14px)] top-[13px] h-px w-[calc(100%-28px)]" style={{ background: done ? 'var(--accent)' : 'var(--border)' }} />}<span className="truncate text-[10px] sm:text-xs" style={{ color: current ? 'var(--ink)' : 'var(--ink-dim)' }}>{label}</span></li>; })}</ol>; }
function Heading({ title, text }: { title: string; text: string }) { return <header><p className="section-kicker">Passo</p><h2 className="font-display mt-1 text-3xl leading-none">{title}</h2><p className="mt-2 text-sm" style={{ color: 'var(--ink-dim)' }}>{text}</p></header>; }
function Review({ label, value }: { label: string; value: string }) { return <div className="rounded-lg p-3" style={{ background: 'var(--paper)' }}><dt className="section-kicker">{label}</dt><dd className="mt-1 truncate">{value}</dd></div>; }
function Palette({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) { return <section><span className="section-kicker block mb-2">Identidade visual</span><div className="flex flex-wrap gap-2">{value.map((color, index) => <label key={index} className="flex items-center gap-1 rounded-lg px-2 py-1" style={{ border: '1px solid var(--border)' }}><input aria-label={`Cor ${index + 1}`} type="color" value={/^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#000000'} onChange={(event) => onChange(value.map((item, itemIndex) => itemIndex === index ? event.target.value.toUpperCase() : item))} /><input className="w-16 bg-transparent text-xs" value={color} onChange={(event) => onChange(value.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} />{value.length > 1 && <button type="button" aria-label={`Remover cor ${index + 1}`} onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}>×</button>}</label>)}{value.length < 6 && <button type="button" className="brand-btn outline sm" onClick={() => onChange([...value, '#FFFFFF'])}>Adicionar cor</button>}</div></section>; }
function Field({ label, value, onChange, ...props }: { label: string; value: string; onChange: (value: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) { return <label className="block"><span className="section-kicker mb-2 block">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className="brand-input" {...props} /></label>; }
function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block"><span className="section-kicker mb-2 block">{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} className="brand-textarea min-h-[84px]" /></label>; }
