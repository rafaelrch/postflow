import { Suspense } from 'react';
import GeneratorPageClient from './GeneratorPageClient';

export default function GeneratorPage() {
  return (
    <Suspense>
      <GeneratorPageClient />
    </Suspense>
  );
}
