'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button';
import { startStripeCheckout } from '@/lib/start-checkout';

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
  const [loading, setLoading] = useState(false);

  async function start() {
    setLoading(true);
    try {
      await startStripeCheckout(interval);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao iniciar checkout');
      setLoading(false);
    }
  }

  return (
    <Button onClick={start} loading={loading} variant={variant} className={className}>
      {children}
    </Button>
  );
}
