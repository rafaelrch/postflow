'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export default function Section({ title, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-black/[0.05] dark:border-white/[0.05]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left group transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
      >
        <span className="text-[9px] font-bold text-gray-900/40 dark:text-white/35 uppercase tracking-[0.1em]">
          {title}
        </span>
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-gray-900/25 dark:text-white/25 transition-transform duration-200',
            open ? 'rotate-0' : '-rotate-90'
          )}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3">
          {children}
        </div>
      )}
    </div>
  );
}
