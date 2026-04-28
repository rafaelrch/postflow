import { Suspense } from 'react';
import AuthForm from '@/components/auth/AuthForm';

export default function CadastroPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm mode="signup" />
    </Suspense>
  );
}
