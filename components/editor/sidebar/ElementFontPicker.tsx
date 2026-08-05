'use client';

import { ElementFont } from '@/types';
import { selectCls } from './tokens';

type FontFamily = 'SF Pro Display' | 'IvyOra Text' | 'Bebas Neue' | 'Montserrat';

interface FontVariant { value: ElementFont; label: string; weight: number; style: 'normal' | 'italic' }

export const FONT_FAMILIES: { value: FontFamily; label: string; family: string; variants: FontVariant[] }[] = [
  {
    value: 'SF Pro Display',
    label: 'SF Display',
    family: "'SF Pro Display', -apple-system, 'Helvetica Neue', sans-serif",
    variants: [
      { value: 'SF Pro Display Light',    label: 'Light',    weight: 300, style: 'normal' },
      { value: 'SF Pro Display Regular',  label: 'Regular',  weight: 400, style: 'normal' },
      { value: 'SF Pro Display Medium',   label: 'Medium',   weight: 500, style: 'normal' },
      { value: 'SF Pro Display SemiBold', label: 'SemiBold', weight: 600, style: 'normal' },
      { value: 'SF Pro Display Bold',     label: 'Bold',     weight: 700, style: 'normal' },
    ],
  },
  {
    value: 'IvyOra Text',
    label: 'IvyOra Text',
    family: "'IvyOra Text', Georgia, serif",
    variants: [
      { value: 'IvyOra Text Medium',        label: 'Medium',        weight: 500, style: 'normal' },
      { value: 'IvyOra Text Medium Italic', label: 'Medium Italic', weight: 500, style: 'italic' },
    ],
  },
  {
    value: 'Bebas Neue',
    label: 'Bebas Neue',
    family: "'Bebas Neue', sans-serif",
    variants: [{ value: 'Bebas Neue', label: 'Regular', weight: 400, style: 'normal' }],
  },
  {
    value: 'Montserrat',
    label: 'Montserrat',
    family: "'Montserrat', sans-serif",
    variants: [{ value: 'Montserrat', label: 'SemiBold', weight: 600, style: 'normal' }],
  },
];

/** Descobre família + variante a partir do valor achatado que fica no slide. */
function splitElementFont(font: ElementFont | undefined): { family: FontFamily | null; variant: ElementFont | null } {
  if (!font) return { family: null, variant: null };
  for (const fam of FONT_FAMILIES) {
    if (fam.variants.some((v) => v.value === font)) return { family: fam.value, variant: font };
  }
  return { family: null, variant: null };
}

export default function ElementFontPicker({
  value,
  onChange,
}: {
  value: ElementFont | undefined;
  onChange: (v: ElementFont | undefined) => void;
}) {
  const { family: currentFamily, variant: currentVariant } = splitElementFont(value);
  const selectedFam = FONT_FAMILIES.find((f) => f.value === currentFamily) ?? null;

  const handleFamilyChange = (raw: string) => {
    if (!raw) { onChange(undefined); return; }
    const fam = FONT_FAMILIES.find((f) => f.value === raw);
    if (!fam) return;
    // Mantém a variante quando ela existe na família nova; senão, a primeira.
    const keep = fam.variants.find((v) => v.value === currentVariant);
    onChange((keep ?? fam.variants[0]).value);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <select
        value={currentFamily ?? ''}
        onChange={(e) => handleFamilyChange(e.target.value)}
        className={selectCls}
        style={{ fontFamily: selectedFam?.family }}
      >
        <option value="">Herdar global</option>
        {FONT_FAMILIES.map((f) => (
          <option key={f.value} value={f.value} style={{ fontFamily: f.family }}>{f.label}</option>
        ))}
      </select>

      {/* Variante só aparece quando há mais de uma — família de peso único não
          merece um segundo select que nunca muda nada. */}
      {selectedFam && selectedFam.variants.length > 1 && (
        <select
          value={currentVariant ?? ''}
          onChange={(e) => onChange((e.target.value as ElementFont) || undefined)}
          className={selectCls}
          style={{
            fontFamily: selectedFam.family,
            fontWeight: selectedFam.variants.find((v) => v.value === currentVariant)?.weight,
            fontStyle: selectedFam.variants.find((v) => v.value === currentVariant)?.style,
          }}
        >
          {selectedFam.variants.map((v) => (
            <option key={v.value} value={v.value} style={{ fontWeight: v.weight, fontStyle: v.style }}>
              {v.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
