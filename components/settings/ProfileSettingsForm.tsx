'use client';

import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { uploadImageFile } from '@/lib/upload-image';
import {
  parseProfessionalProfiles,
  PROFESSIONAL_PROFILE_OPTIONS,
  REFERRAL_OPTIONS,
} from '@/lib/onboarding-options';

export type ProfileSettingsValues = {
  firstName: string;
  lastName: string;
  professionalProfile: string;
  referralSource: string;
  photoUrl: string;
};

export default function ProfileSettingsForm({ initialValues }: { initialValues: ProfileSettingsValues }) {
  const [values, setValues] = useState(initialValues);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const update = <K extends keyof ProfileSettingsValues>(key: K, value: ProfileSettingsValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Não foi possível salvar os dados pessoais.');
      }
      toast.success('Dados pessoais salvos.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar os dados pessoais.');
    } finally {
      setSaving(false);
    }
  };

  const choosePhoto = async (file: File) => {
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
      toast.error('Escolha uma imagem de até 10 MB.');
      return;
    }
    setUploading(true);
    try {
      update('photoUrl', await uploadImageFile(file, 'profile-photos'));
      toast.success('Foto pronta para salvar.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha no upload da foto.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <form onSubmit={save} className="mt-6 border-t border-[var(--border)] pt-6">
      <h3 className="text-base font-semibold text-[var(--foreground)]">Dados pessoais</h3>
      <p className="mt-1 text-sm text-[var(--ink-dim)]">Esses dados pertencem à sua conta e não a um Workspace.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="section-kicker mb-2 block">Seu nome</span><input aria-label="Seu nome" className="brand-input" value={values.firstName} onChange={(event) => update('firstName', event.target.value)} /></label>
        <label className="block"><span className="section-kicker mb-2 block">Seu sobrenome</span><input aria-label="Seu sobrenome" className="brand-input" value={values.lastName} onChange={(event) => update('lastName', event.target.value)} /></label>
        <label className="block"><span className="section-kicker mb-2 block">Perfil profissional</span><select aria-label="Perfil profissional" className="brand-input" value={parseProfessionalProfiles(values.professionalProfile)[0] || ''} onChange={(event) => update('professionalProfile', event.target.value)}><option value="">Selecione seu perfil</option>{PROFESSIONAL_PROFILE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="block"><span className="section-kicker mb-2 block">Como você conheceu o Creatools?</span><select aria-label="Como você conheceu o Creatools?" className="brand-input" value={values.referralSource} onChange={(event) => update('referralSource', event.target.value)}><option value="">Selecione uma opção</option>{REFERRAL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      </div>
      <div className="mt-5 flex items-center gap-4">
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full" style={{ border: '2px solid var(--ink)', background: 'var(--paper)' }}>{values.photoUrl ? <img src={values.photoUrl} alt="Foto de perfil" className="h-full w-full object-cover" /> : <span className="text-xs">sem foto</span>}</div>
        <div className="flex flex-wrap gap-2"><button type="button" className="brand-btn outline sm" onClick={() => inputRef.current?.click()} disabled={uploading}>{uploading ? 'Enviando…' : values.photoUrl ? 'Trocar foto' : 'Adicionar foto'}</button>{values.photoUrl && <button type="button" className="brand-btn outline sm" onClick={() => update('photoUrl', '')}>Remover</button>}<input ref={inputRef} data-testid="profile-photo-input" type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void choosePhoto(file); event.currentTarget.value = ''; }} /></div>
      </div>
      <button type="submit" className="brand-btn mt-5" disabled={saving || uploading}>{saving ? 'Salvando…' : 'Salvar dados pessoais'}</button>
    </form>
  );
}
