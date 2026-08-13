import { Suspense } from 'react';
import GeneratorPageClient from './GeneratorPageClient';
import GeneratorLoading from '@/components/editor/GeneratorLoading';

export default function GeneratorPage() {
  return (
    <Suspense fallback={<GeneratorLoading />}>
      <GeneratorPageClient />
    </Suspense>
  );
}
