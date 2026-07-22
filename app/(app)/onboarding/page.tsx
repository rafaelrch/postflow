'use client';

import OnboardingForm from '@/components/onboarding/OnboardingForm';

// Após concluir, esta página continua sendo o local explícito para editar a marca.
export default function OnboardingPage() {
  return <div className="flex-1 overflow-y-auto" style={{ background: 'var(--paper)' }}><main className="max-w-[1180px] mx-auto px-4 sm:px-8 py-10"><header className="mb-8"><p className="section-kicker">Setup da marca</p><h1 className="section-title mt-3">Edite sua <span style={{ color: 'var(--accent)', fontStyle: 'italic' }}>marca.</span></h1></header><OnboardingForm /></main></div>;
}
