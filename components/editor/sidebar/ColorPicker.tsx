'use client';

import CromiaCompact from '@/components/ui/cromia-compact';

interface ColorPickerProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

/** Compatibilidade: os consumidores continuam usando a API ColorPicker atual;
 * a implementação visual agora vive no componente Cromia Compact compartilhado. */
export default function ColorPicker({ label, value, onChange, className }: ColorPickerProps) {
  return <CromiaCompact label={label} value={value} onChange={onChange} className={className} />;
}
