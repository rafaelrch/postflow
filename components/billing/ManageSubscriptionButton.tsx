'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button';

export default function ManageSubscriptionButton({
  children = 'Gerenciar assinatura',
  className,
  variant = 'outline',
}: {
  children?: React.ReactNode;
  className?: string;
  variant?: 'primary' | 'accent' | 'outline';
}) {
  const [loading, setLoading] = useState(false);

  async function open() {
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Não foi possível abrir o portal');
      window.location.href = data.url as string;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao abrir portal');
      setLoading(false);
    }
  }

  return (
    <Button onClick={open} loading={loading} variant={variant} className={className}>
      {children}
    </Button>
  );
}
