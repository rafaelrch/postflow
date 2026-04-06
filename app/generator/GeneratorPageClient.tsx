'use client';

import { useEffect, useState } from 'react';
import GeneratorClient from './GeneratorClient';

export default function GeneratorPageClient() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return <GeneratorClient />;
}
