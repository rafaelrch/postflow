// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ColorPicker from '@/components/editor/sidebar/ColorPicker';
import CromiaCompact, { hexToHsv, hsvToHex } from '@/components/ui/cromia-compact';

afterEach(() => cleanup());

/** O Cromia Compact só mostra o espectro após abrir o popover: clica o gatilho. */
function abreEspectro(value = '#123456') {
  render(<CromiaCompact value={value} onChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /abrir seletor de cor/i }));
}

describe('Cromia Compact — conversão HSV/HEX', () => {
  it('converte os extremos HSV para HEX', () => {
    expect(hsvToHex(0, 100, 100)).toBe('#FF0000');
    expect(hsvToHex(120, 100, 100)).toBe('#00FF00');
    expect(hsvToHex(240, 100, 100)).toBe('#0000FF');
  });

  it('aceita HEX curto e devolve HSV consistente', () => {
    expect(hexToHsv('#fff')).toEqual({ h: 0, s: 0, v: 100 });
    expect(hexToHsv('#3366CC')).toEqual({ h: 220, s: 75, v: 80 });
  });

  it('mantém a cor ao fazer o ciclo HEX → HSV → HEX', () => {
    const hex = '#C658F5';
    const hsv = hexToHsv(hex);
    expect(hsvToHex(hsv.h, hsv.s, hsv.v)).toBe(hex);
  });
});

describe('Cromia Compact — contrato do picker existente', () => {
  it('mostra a bolinha com a cor atual fechado e esconde o espectro', () => {
    render(<CromiaCompact value="#123456" onChange={vi.fn()} />);
    expect(screen.getByTestId('cromia-swatch')).toBeTruthy();
    expect(screen.queryByRole('slider', { name: /saturação/i })).toBeNull();
  });

  it('propaga HEX pelo onChange ao editar o campo', () => {
    const onChange = vi.fn();
    render(<CromiaCompact value="#123456" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /abrir seletor de cor/i }));
    const hex = screen.getByRole('textbox', { name: /hex/i });
    fireEvent.change(hex, { target: { value: '#abcdef' } });

    expect(onChange).toHaveBeenLastCalledWith('#ABCDEF');
  });

  it('permite ajustar matiz por teclado e mantém thumb/ARIA', () => {
    const onChange = vi.fn();
    render(<CromiaCompact value="#123456" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /abrir seletor de cor/i }));
    const hue = screen.getByRole('slider', { name: /matiz/i });
    expect(hue.getAttribute('aria-valuemin')).toBe('0');
    expect(hue.getAttribute('aria-valuemax')).toBe('360');
    expect(screen.getByTestId('cromia-hue-thumb')).toBeTruthy();

    fireEvent.keyDown(hue, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalled();
  });

  it('responde a pointer down/move no espectro e no slider de hue', () => {
    const onChange = vi.fn();
    render(<CromiaCompact value="#123456" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /abrir seletor de cor/i }));
    const sv = screen.getByRole('slider', { name: /saturação/i }) as HTMLDivElement;
    const hue = screen.getByRole('slider', { name: /matiz/i }) as HTMLDivElement;
    const rect = {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      toJSON: () => ({}),
    };
    vi.spyOn(sv, 'getBoundingClientRect').mockReturnValue(rect);
    vi.spyOn(hue, 'getBoundingClientRect').mockReturnValue(rect);

    fireEvent.pointerDown(sv, { clientX: 100, clientY: 0, pointerId: 1 });
    fireEvent.pointerDown(hue, { clientX: 50, clientY: 0, pointerId: 2 });
    fireEvent.pointerMove(hue, { clientX: 75, clientY: 0, pointerId: 2 });
    fireEvent.pointerUp(hue, { clientX: 75, clientY: 0, pointerId: 2 });

    expect(onChange).toHaveBeenCalled();
    expect(hue.getAttribute('aria-valuenow')).toBe('270');
  });

  it('fecha o espectro ao apertar Escape', () => {
    render(<CromiaCompact value="#123456" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /abrir seletor de cor/i }));
    expect(screen.getByRole('slider', { name: /matiz/i })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('slider', { name: /matiz/i })).toBeNull();
  });

  it('integra com a API pública do ColorPicker atual', () => {
    const onChange = vi.fn();
    render(<ColorPicker label="Cor" value="#123456" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /abrir seletor de cor/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /hex/i }), {
      target: { value: '#654321' },
    });

    expect(onChange).toHaveBeenLastCalledWith('#654321'.toUpperCase());
    expect(screen.getByText('Cor')).toBeTruthy();
  });
});
