'use client';

import { ElementFont } from '@/types';
import { getElementFontCSS } from '@/lib/utils';
import { selectCls } from './tokens';

interface FontVariant {
  value: ElementFont;
  label: string;
}

interface FontFamily {
  label: string;
  variants: FontVariant[];
  defaultVariant?: string;
}

/**
 * Família e peso são escolhas diferentes. Além de reduzir o ruído da lista,
 * isso deixa explícito que trocar de Regular para Bold não troca de família.
 */
export const ELEMENT_FONT_FAMILIES: FontFamily[] = [
  { label: 'SF Pro Display', defaultVariant: 'Regular', variants: [
    { value: 'SF Pro Display Light', label: 'Light' },
    { value: 'SF Pro Display Regular', label: 'Regular' },
    { value: 'SF Pro Display Medium', label: 'Medium' },
    { value: 'SF Pro Display SemiBold', label: 'SemiBold' },
    { value: 'SF Pro Display Bold', label: 'Bold' },
  ] },
  { label: 'Inter Display', defaultVariant: 'Regular', variants: [
    { value: 'Inter Display Light', label: 'Light' },
    { value: 'Inter Display Regular', label: 'Regular' },
    { value: 'Inter Display Medium', label: 'Medium' },
    { value: 'Inter Display Bold', label: 'Bold' },
  ] },
  { label: 'IvyOra Text', defaultVariant: 'Medium', variants: [
    { value: 'IvyOra Text Medium', label: 'Medium' },
    { value: 'IvyOra Text Medium Italic', label: 'Medium Italic' },
  ] },
  { label: 'Bebas Neue', variants: [{ value: 'Bebas Neue', label: 'Regular' }] },
  { label: 'Montserrat', defaultVariant: 'Regular', variants: [
    { value: 'Montserrat Regular', label: 'Regular' },
    { value: 'Montserrat', label: 'SemiBold' },
    { value: 'Montserrat Bold', label: 'Bold' },
    { value: 'Montserrat ExtraBold', label: 'ExtraBold' },
  ] },
  { label: 'Anton', variants: [{ value: 'Anton', label: 'Regular' }] },
  { label: 'Archivo Black', variants: [{ value: 'Archivo Black', label: 'Black' }] },
  { label: 'Fjalla One', variants: [{ value: 'Fjalla One', label: 'Regular' }] },
  { label: 'Oswald', defaultVariant: 'Regular', variants: [
    { value: 'Oswald Regular', label: 'Regular' },
    { value: 'Oswald SemiBold', label: 'SemiBold' },
    { value: 'Oswald Bold', label: 'Bold' },
  ] },
  { label: 'Poppins', defaultVariant: 'Regular', variants: [
    { value: 'Poppins Regular', label: 'Regular' },
    { value: 'Poppins SemiBold', label: 'SemiBold' },
    { value: 'Poppins Bold', label: 'Bold' },
  ] },
  { label: 'Raleway', variants: [
    { value: 'Raleway Bold', label: 'Bold' },
    { value: 'Raleway ExtraBold', label: 'ExtraBold' },
  ] },
  { label: 'Inter', defaultVariant: 'Regular', variants: [
    { value: 'Inter Light', label: 'Light' },
    { value: 'Inter Regular', label: 'Regular' },
    { value: 'Inter Medium', label: 'Medium' },
    { value: 'Inter SemiBold', label: 'SemiBold' },
    { value: 'Inter Bold', label: 'Bold' },
    { value: 'Inter Black', label: 'Black' },
  ] },
  { label: 'Barlow Condensed', variants: [
    { value: 'Barlow Condensed Bold', label: 'Bold' },
    { value: 'Barlow Condensed ExtraBold', label: 'ExtraBold' },
  ] },
  { label: 'Playfair Display', defaultVariant: 'Regular', variants: [
    { value: 'Playfair Display Regular', label: 'Regular' },
    { value: 'Playfair Display Bold', label: 'Bold' },
    { value: 'Playfair Display ExtraBold', label: 'ExtraBold' },
  ] },
  { label: 'Cormorant Garamond', defaultVariant: 'Regular', variants: [
    { value: 'Cormorant Garamond Regular', label: 'Regular' },
    { value: 'Cormorant Garamond SemiBold', label: 'SemiBold' },
    { value: 'Cormorant Garamond Bold', label: 'Bold' },
  ] },
  { label: 'Lora', defaultVariant: 'Regular', variants: [
    { value: 'Lora Regular', label: 'Regular' },
    { value: 'Lora Bold', label: 'Bold' },
  ] },
  { label: 'DM Serif Display', variants: [{ value: 'DM Serif Display', label: 'Regular' }] },
  { label: 'Space Grotesk', defaultVariant: 'Regular', variants: [
    { value: 'Space Grotesk Regular', label: 'Regular' },
    { value: 'Space Grotesk Medium', label: 'Medium' },
    { value: 'Space Grotesk Bold', label: 'Bold' },
  ] },
  { label: 'Lato', defaultVariant: 'Regular', variants: [
    { value: 'Lato Regular', label: 'Regular' },
    { value: 'Lato Bold', label: 'Bold' },
  ] },
  { label: 'Roboto', defaultVariant: 'Regular', variants: [
    { value: 'Roboto Regular', label: 'Regular' },
    { value: 'Roboto Medium', label: 'Medium' },
  ] },
  { label: 'Open Sans', defaultVariant: 'Regular', variants: [
    { value: 'Open Sans Regular', label: 'Regular' },
    { value: 'Open Sans SemiBold', label: 'SemiBold' },
  ] },
  { label: 'Syne', defaultVariant: 'Regular', variants: [
    { value: 'Syne Regular', label: 'Regular' },
    { value: 'Syne SemiBold', label: 'SemiBold' },
    { value: 'Syne Bold', label: 'Bold' },
    { value: 'Syne ExtraBold', label: 'ExtraBold' },
  ] },
  { label: 'DM Sans', defaultVariant: 'Regular', variants: [
    { value: 'DM Sans Regular', label: 'Regular' },
    { value: 'DM Sans Medium', label: 'Medium' },
    { value: 'DM Sans Bold', label: 'Bold' },
  ] },
];

function defaultVariant(family: FontFamily): FontVariant {
  return family.variants.find((variant) => variant.label === family.defaultVariant) ?? family.variants[0];
}

function resolveFont(value: ElementFont | undefined, defaultFontName: string) {
  if (value) {
    for (const family of ELEMENT_FONT_FAMILIES) {
      const variant = family.variants.find((option) => option.value === value);
      if (variant) return { family, variant };
    }
  }

  const normalized = defaultFontName.trim().toLowerCase();
  const family = ELEMENT_FONT_FAMILIES.find((option) => {
    const name = option.label.toLowerCase();
    return normalized === name || normalized.startsWith(`${name} `);
  }) ?? ELEMENT_FONT_FAMILIES[0];
  const suffix = defaultFontName.slice(family.label.length).trim().toLowerCase();
  const variant = family.variants.find((option) => option.label.toLowerCase() === suffix)
    ?? defaultVariant(family);
  return { family, variant };
}

export default function ElementFontPicker({
  value,
  defaultFontName,
  onChange,
}: {
  value: ElementFont | undefined;
  /** Nome exato da face que o render usa enquanto não há override. */
  defaultFontName: string;
  onChange: (v: ElementFont | undefined) => void;
}) {
  const selected = resolveFont(value, defaultFontName);
  const selectedCss = getElementFontCSS(selected.variant.value);

  const changeFamily = (familyLabel: string) => {
    const family = ELEMENT_FONT_FAMILIES.find((option) => option.label === familyLabel);
    if (!family) return;
    const sameWeight = family.variants.find((variant) => variant.label === selected.variant.label);
    onChange((sameWeight ?? defaultVariant(family)).value);
  };

  return (
    <div className="space-y-2">
      <select
        value={selected.family.label}
        aria-label="Fonte"
        onChange={(event) => changeFamily(event.target.value)}
        className={selectCls}
        style={selectedCss}
      >
        {ELEMENT_FONT_FAMILIES.map((family) => (
          <option
            key={family.label}
            value={family.label}
            style={getElementFontCSS(defaultVariant(family).value)}
          >
            {family.label}
          </option>
        ))}
      </select>
      <select
        value={selected.variant.value}
        aria-label="Peso da fonte"
        onChange={(event) => onChange(event.target.value as ElementFont)}
        className={selectCls}
        style={selectedCss}
      >
        {selected.family.variants.map((variant) => (
          <option key={variant.value} value={variant.value} style={getElementFontCSS(variant.value)}>
            {variant.label}
          </option>
        ))}
      </select>
    </div>
  );
}
