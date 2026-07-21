'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import LeadCaptureModal from '@/components/billing/LeadCaptureModal';

/**
 * Botão "assinar" de um plano. Em vez de ir direto ao checkout, abre o popup de
 * captura de lead (nome/e-mail/telefone). O e-mail coletado ali é o que segue
 * para a AbacatePay — a API dela não devolve e-mail no checkout, então ele
 * PRECISA ser coletado antes; e o lead é gravado mesmo que a compra não se
 * conclua (remarketing). Ver LeadCaptureModal / submitLeadThenCheckout.
 */
export default function CheckoutButton({
  interval,
  children,
  className,
  variant = 'primary',
}: {
  interval: 'month' | 'year';
  children: React.ReactNode;
  className?: string;
  variant?: 'primary' | 'accent' | 'outline';
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} variant={variant} className={className}>
        {children}
      </Button>
      {open && (
        <LeadCaptureModal
          interval={interval}
          planLabel={interval === 'year' ? 'Anual' : 'Mensal'}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
