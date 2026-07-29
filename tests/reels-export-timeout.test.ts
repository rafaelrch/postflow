import { describe, expect, it } from 'vitest';
import { withTimeout, FFMPEG_LOAD_TIMEOUT_MS, FFMPEG_LOAD_ERROR } from '../lib/reels-export';

describe('withTimeout — o export não pode pendurar para sempre (bug 2)', () => {
  it('resolve normalmente quando a promise termina antes do teto', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000, 'x')).resolves.toBe('ok');
  });

  it('propaga a rejeição real sem esperar o teto', async () => {
    await expect(withTimeout(Promise.reject(new Error('falhou')), 1000, 'timeout')).rejects.toThrow('falhou');
  });

  it('REJEITA com a mensagem de timeout quando a promise pendura', async () => {
    // Promise que nunca resolve (simula o fetch do core preso em 0%).
    const hung = new Promise(() => {});
    await expect(withTimeout(hung, 10, FFMPEG_LOAD_ERROR)).rejects.toThrow(FFMPEG_LOAD_ERROR);
  });

  it('o teto de carga do ffmpeg é finito e positivo', () => {
    expect(FFMPEG_LOAD_TIMEOUT_MS).toBeGreaterThan(0);
    expect(Number.isFinite(FFMPEG_LOAD_TIMEOUT_MS)).toBe(true);
  });
});
