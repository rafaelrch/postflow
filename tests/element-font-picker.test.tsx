// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import ElementFontPicker from '@/components/editor/sidebar/ElementFontPicker';

afterEach(cleanup);

describe('seletor de fonte por elemento', () => {
  it('separa a família do peso e mostra a face exata usada', () => {
    render(
      <ElementFontPicker
        value={undefined}
        defaultFontName="Inter Display Medium"
        onChange={vi.fn()}
      />
    );

    const [family, weight] = screen.getAllByRole('combobox') as HTMLSelectElement[];
    expect(family.selectedOptions[0].textContent).toBe('Inter Display');
    expect(weight.selectedOptions[0].textContent).toBe('Medium');
    expect(screen.queryByText('Herdar global')).toBeNull();
  });

  it('envia o peso e escolhe o peso padrão ao trocar a família', () => {
    const onChange = vi.fn();
    render(
      <ElementFontPicker
        value="Montserrat ExtraBold"
        defaultFontName="Inter Bold"
        onChange={onChange}
      />
    );

    const [family, weight] = screen.getAllByRole('combobox') as HTMLSelectElement[];
    expect(family.selectedOptions[0].textContent).toBe('Montserrat');
    expect(weight.selectedOptions[0].textContent).toBe('ExtraBold');

    fireEvent.change(weight, { target: { value: 'Montserrat Bold' } });
    expect(onChange).toHaveBeenCalledWith('Montserrat Bold');

    fireEvent.change(family, { target: { value: 'IvyOra Text' } });
    expect(onChange).toHaveBeenCalledWith('IvyOra Text Medium');
  });

  it('oferece Light, Regular, Medium e Bold no Inter Display', () => {
    render(
      <ElementFontPicker
        value="Inter Display Regular"
        defaultFontName="Inter Display Medium"
        onChange={vi.fn()}
      />
    );

    const weight = screen.getByRole('combobox', { name: 'Peso da fonte' });
    expect(within(weight).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Light',
      'Regular',
      'Medium',
      'Bold',
    ]);
  });
});
