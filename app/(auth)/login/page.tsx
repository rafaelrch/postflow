import { Suspense } from 'react';
import AuthForm from '@/components/auth/AuthForm';
import AuthErrorNotice from '@/components/auth/AuthErrorNotice';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthErrorNotice />
      <AuthForm mode="login" />
    </Suspense>
  );
}
