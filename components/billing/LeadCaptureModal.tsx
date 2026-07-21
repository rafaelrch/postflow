'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button';
import { startAbacateCheckout } from '@/lib/start-checkout';
import {
  submitLeadThenCheckout,
  LeadValidationError,
  type LeadInterval,
  type LeadForm,
  type LeadFormErrors,
} from '@/lib/lead-capture';

/**
 * Popup de captura de lead antes do checkout. Coleta nome/e-mail/telefone,
 * SALVA em /api/leads e só então segue para o pagamento (ver submitLeadThenCheckout).
 *
 * Não é polido de propósito — o foco é funcionar certo (salvar o lead, depois
 * checkout com o e-mail correto). Visual pode vir depois.
 */
export default function LeadCaptureModal({
  interval,
  planLabel,
  onClose,
}: {
  interval: LeadInterval;
  planLabel: string;
  onClose: () => void;
}) {
  const [form, setForm] = useState<LeadForm>({ name: '', email: '', phone: '' });
  const [errors, setErrors] = useState<LeadFormErrors>({});
  const [loading, setLoading] = useState(false);

  function set<K extends keyof LeadForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrors({});
    try {
      await submitLeadThenCheckout(form, interval, {
        // Grava o lead ANTES de qualquer redirect: só resolve com HTTP ok.
        saveLead: async (lead) => {
          const res = await fetch('/api/leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(lead),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Não foi possível registrar seus dados.');
          }
        },
        startCheckout: startAbacateCheckout,
      });
      // Sucesso ⇒ startAbacateCheckout já redirecionou; nada a fazer.
    } catch (err) {
      if (err instanceof LeadValidationError) {
        setErrors(err.errors);
      } else {
        toast.error(err instanceof Error ? err.message : 'Erro ao continuar.');
      }
      setLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Assinar plano ${planLabel}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[var(--paper-2)] p-6 shadow-[var(--sh-3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">Continuar para o pagamento</h2>
            <p className="text-sm text-[var(--ink-dim)]">Plano {planLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-[var(--ink-dim)] hover:text-[var(--ink)]"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <div>
            <label htmlFor="lead-name" className="block text-sm font-medium">
              Nome
            </label>
            <input
              id="lead-name"
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--paper)] px-3 py-2"
              autoComplete="name"
            />
            {errors.name && <p className="mt-1 text-xs text-[var(--danger)]">{errors.name}</p>}
          </div>

          <div>
            <label htmlFor="lead-email" className="block text-sm font-medium">
              E-mail
            </label>
            <input
              id="lead-email"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--paper)] px-3 py-2"
              autoComplete="email"
            />
            {errors.email && <p className="mt-1 text-xs text-[var(--danger)]">{errors.email}</p>}
          </div>

          <div>
            <label htmlFor="lead-phone" className="block text-sm font-medium">
              Telefone (com DDD)
            </label>
            <input
              id="lead-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="(11) 99999-9999"
              className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--paper)] px-3 py-2"
              autoComplete="tel"
            />
            {errors.phone && <p className="mt-1 text-xs text-[var(--danger)]">{errors.phone}</p>}
          </div>

          <Button type="submit" loading={loading} variant="accent" className="w-full justify-center">
            Continuar para o pagamento
          </Button>

          {/* Consentimento simples e honesto. /termos e /privacidade ainda estão
              em revisão jurídica, então NÃO são linkados como finais. */}
          <p className="text-center text-xs text-[var(--ink-muted)]">
            Ao continuar, você concorda que seus dados podem ser usados para contato sobre esta
            oferta.
          </p>
        </form>
      </div>
    </div>
  );
}
