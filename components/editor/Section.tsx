'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export default function Section({ title, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-black/[0.06] dark:border-white/[0.06]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors"
      >
        <span className="text-[10px] font-semibold text-gray-900/50 dark:text-white/50 uppercase tracking-wider">{title}</span>
        {open ? <ChevronDown className="w-3 h-3 text-gray-900/30 dark:text-white/30" /> : <ChevronRight className="w-3 h-3 text-gray-900/30 dark:text-white/30" />}
      </button>
      {open && <div className="px-3 pb-3 flex flex-col gap-2.5">{children}</div>}
    </div>
  );
}
