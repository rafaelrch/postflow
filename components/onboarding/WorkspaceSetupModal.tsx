'use client';

import { useEffect, useState } from 'react';
import { CHANNEL_OPTIONS, type OnboardingChannel } from '@/lib/onboarding-options';
import { cn } from '@/lib/utils';

export type WorkspaceSetupData = {
  name: string;
  brandName: string;
  niche: string;
  selectedChannels: OnboardingChannel[];
  instagramHandle: string;
  newsInstagramHandle: string;
  twitterHandle: string;
  logoUrl: string;
  palette: string[];
};

const DEFAULT_PALETTE = ['#0A0A0A', '#FAFAF7', '#00CFFF'];

function emptySetup(): WorkspaceSetupData {
  return {
    name: '',
    brandName: '',
    niche: '',
    selectedChannels: ['instagram_carousel'],
    instagramHandle: '',
    newsInstagramHandle: '',
    twitterHandle: '',
    logoUrl: '',
    palette: [...DEFAULT_PALETTE],
  };
}

export default function WorkspaceSetupModal({
  open,
  loading,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  loading: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (data: WorkspaceSetupData) => void;
}) {
  const [data, setData] = useState<WorkspaceSetupData>(emptySetup);

  useEffect(() => {
    if (open) setData(emptySetup());
  }, [open]);

  if (!open) return null;

  const update = <K extends keyof WorkspaceSetupData>(key: K, value: WorkspaceSetupData[K]) => {
    setData((current) => ({ ...current, [key]: value }));
  };
  const toggleChannel = (channel: OnboardingChannel) => {
    update(
      'selectedChannels',
      data.selectedChannels.includes(channel)
        ? data.selectedChannels.filter((item) => item !== channel)
        : [...data.selectedChannels, channel],
    );
  };
  const handleFor = (channel: OnboardingChannel) => ({
    instagram_carousel: data.instagramHandle,
    instagram_news: data.newsInstagramHandle,
    twitter: data.twitterHandle,
  })[channel];
  const canSubmit = Boolean(
    data.name.trim() && data.brandName.trim() && data.selectedChannels.length > 0
      && data.selectedChannels.every((channel) => handleFor(channel).trim()),
  );

  return (
    <div
      className="fixed inset-0 z-[10000] overflow-y-auto bg-black/55 p-3 sm:grid sm:place-items-center sm:overflow-hidden"
      data-testid="workspace-create-modal"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-create-title"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit && !loading) onSubmit(data);
        }}
        className="mx-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl p-4 sm:p-6"
        style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1.5px solid var(--line)' }}
      >
        <header className="mb-4 shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="section-kicker">Setup do workspace</p>
              <h2 id="workspace-create-title" className="section-title mt-1">Crie seu workspace</h2>
            </div>
            <button type="button" onClick={onClose} disabled={loading} aria-label="Fechar" className="text-xl leading-none" style={{ color: 'var(--ink-dim)' }}>×</button>
          </div>
          <p className="mt-1 text-sm" style={{ color: 'var(--ink-dim)' }}>Esses dados pertencem somente a este workspace.</p>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="section-kicker mb-2 block">Nome do Workspace</span>
              <input data-testid="workspace-name-input" aria-label="Nome do Workspace" value={data.name} onChange={(event) => update('name', event.target.value)} className="brand-input" placeholder="Nome do cliente ou negócio" maxLength={120} autoFocus />
            </label>
            <label className="block">
              <span className="section-kicker mb-2 block">Nome da marca</span>
              <input aria-label="Nome da marca" value={data.brandName} onChange={(event) => update('brandName', event.target.value)} className="brand-input" placeholder="Nome que aparece no conteúdo" maxLength={120} />
            </label>
            <label className="block sm:col-span-2">
              <span className="section-kicker mb-2 block">Nicho</span>
              <input aria-label="Nicho" value={data.niche} onChange={(event) => update('niche', event.target.value)} className="brand-input" placeholder="Ex.: educação financeira" maxLength={2000} />
            </label>
          </div>

          <fieldset>
            <legend className="section-kicker mb-2">Canais</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {CHANNEL_OPTIONS.map((channel) => (
                <label key={channel.value} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--line-strong)' }}>
                  <input type="checkbox" checked={data.selectedChannels.includes(channel.value)} onChange={() => toggleChannel(channel.value)} />
                  <span>{channel.label}</span>
                </label>
              ))}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {CHANNEL_OPTIONS.map((channel) => data.selectedChannels.includes(channel.value) ? (
                <label key={channel.value} className="block">
                  <span className="section-kicker mb-2 block">{channel.handleLabel}</span>
                  <input aria-label={channel.handleLabel} value={handleFor(channel.value)} onChange={(event) => update(channel.value === 'instagram_carousel' ? 'instagramHandle' : channel.value === 'instagram_news' ? 'newsInstagramHandle' : 'twitterHandle', event.target.value)} className="brand-input" placeholder="@seuusuario" maxLength={80} />
                </label>
              ) : null)}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="section-kicker mb-2 block">Logo / identidade visual (URL)</span>
              <input aria-label="Logo / identidade visual (URL)" value={data.logoUrl} onChange={(event) => update('logoUrl', event.target.value)} className="brand-input" placeholder="Opcional" maxLength={2048} />
            </label>
            <div>
              <span className="section-kicker mb-2 block">Paleta da marca</span>
              <div className="flex gap-2">
                {data.palette.map((color, index) => (
                  <input key={index} type="color" aria-label={`Cor da marca ${index + 1}`} value={color} onChange={(event) => update('palette', data.palette.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} className={cn('h-10 w-12 rounded-md p-0.5', index === 0 && 'border')} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {error ? <p className="mt-3 shrink-0 text-xs" role="alert" style={{ color: 'var(--danger)' }}>{error}</p> : null}
        <footer className="mt-5 flex shrink-0 justify-end gap-2">
          <button type="button" onClick={onClose} disabled={loading} className="brand-btn ghost" style={{ padding: '8px 12px' }}>Cancelar</button>
          <button type="submit" data-testid="workspace-create-submit" disabled={loading || !canSubmit} className="brand-btn" style={{ padding: '8px 12px' }}>{loading ? 'Salvando…' : 'Salvar workspace'}</button>
        </footer>
      </form>
    </div>
  );
}
