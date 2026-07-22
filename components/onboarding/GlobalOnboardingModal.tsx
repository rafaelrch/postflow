'use client';

import { useEffect, useRef } from 'react';
import OnboardingForm from './OnboardingForm';

export default function GlobalOnboardingModal({ onComplete }: { onComplete: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); return; }
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) { event.preventDefault(); return; }
      const items = Array.from(focusable);
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keepFocusInside);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', keepFocusInside); };
  }, []);
  return <div className="fixed inset-0 z-[10000] overflow-y-auto bg-black/55 p-3 sm:grid sm:place-items-center sm:overflow-hidden" onMouseDown={(event) => { if (event.target === event.currentTarget) event.preventDefault(); }}><div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Conclua o onboarding" className="mx-auto flex min-h-[min(620px,calc(100dvh-1.5rem))] w-full max-w-4xl flex-col rounded-2xl p-4 sm:max-h-[min(760px,calc(100dvh-3rem))] sm:min-h-0 sm:p-6" style={{ background: 'var(--paper)' }}><header className="mb-4 shrink-0"><p className="section-kicker">Setup obrigatório</p><h1 className="section-title mt-1">Vamos entender sua <span style={{ color: 'var(--accent)', fontStyle: 'italic' }}>marca.</span></h1><p className="mt-1 text-sm" style={{ color: 'var(--ink-dim)' }}>Conclua os dados obrigatórios para liberar o studio.</p></header><OnboardingForm compact onComplete={onComplete} /></div></div>;
}
