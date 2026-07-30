'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';

const MESSAGES: Record<string, string> = {
  invalid_code: 'Link de confirmação inválido ou expirado. Faça login ou cadastre-se novamente.',
};

/**
 * Exibe o motivo do redirect vindo do /auth/callback (`?authError=`). Sem isso a
 * volta pro login seria silenciosa e a pessoa não saberia que o link expirou.
 *
 * Vive fora do AuthForm de propósito: aquele arquivo é protegido pela SPEC.
 * O ref evita o toast duplicado que o StrictMode causa em dev.
 */
export default function AuthErrorNotice() {
  const searchParams = useSearchParams();
  const authError = searchParams.get('authError');
  const shown = useRef(false);

  useEffect(() => {
    if (!authError || shown.current) return;
    const message = MESSAGES[authError];
    if (!message) return;
    shown.current = true;
    toast.error(message);
  }, [authError]);

  return null;
}
