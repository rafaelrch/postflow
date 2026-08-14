'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import LeadCaptureModal from '@/components/billing/LeadCaptureModal';
import { planFor, type PlanInterval } from '@/lib/plans';

/**
 * Botão "assinar" de um plano. Em vez de ir direto ao checkout, abre o popup de
 * captura de lead (nome/e-mail/telefone). O lead é gravado mesmo que a compra
 * não se conclua (remarketing), e o id dele é o que amarra o pagamento ao
 * comprador no Asaas. Ver LeadCaptureModal / submitLeadThenCheckout.
 */
export default function CheckoutButton({
  interval,
  children,
  className,
  variant = 'primary',
}: {
  interval: PlanInterval;
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
          planLabel={planFor(interval).label}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
