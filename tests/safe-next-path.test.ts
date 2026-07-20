import { describe, expect, it } from 'vitest';
import { safeNextPath } from '../lib/safe-next-path';

/**
 * Open redirect via ?next=. Os três vetores abaixo foram confirmados pelo
 * Reviewer e pelo Security contra o código anterior, que fazia
 * `new URL(next, origin)` — todos escapavam para o domínio externo.
 */
const VETORES_CONFIRMADOS = ['https://evil.com', '//evil.com', '/\\evil.com'];

describe('safeNextPath — vetores de open redirect', () => {
  it.each(VETORES_CONFIRMADOS)('%s cai no destino seguro', (vetor) => {
    expect(safeNextPath(vetor)).toBe('/dashboard');
  });

  it.each(VETORES_CONFIRMADOS)('%s nunca produz algo que saia do domínio', (vetor) => {
    const destino = safeNextPath(vetor);

    expect(destino).not.toContain('evil.com');
    // '//x' e '/\x' viram protocol-relative no navegador — não basta começar
    // com '/', tem que ser uma barra só.
    expect(destino.startsWith('/')).toBe(true);
    expect(destino.startsWith('//')).toBe(false);
    expect(destino.startsWith('/\\')).toBe(false);
  });

  it('resolvido contra uma origem real, o destino permanece nela', () => {
    const origem = 'https://app.creatools.com.br';

    for (const vetor of VETORES_CONFIRMADOS) {
      expect(new URL(safeNextPath(vetor), origem).host).toBe('app.creatools.com.br');
    }
  });

  it('rejeita esquemas exóticos', () => {
    expect(safeNextPath('javascript:alert(1)')).toBe('/dashboard');
    expect(safeNextPath('data:text/html,<script>')).toBe('/dashboard');
  });

  it('rejeita host com credenciais embutidas', () => {
    expect(safeNextPath('https://app.creatools.com.br@evil.com')).toBe('/dashboard');
  });
});

describe('safeNextPath — destinos legítimos seguem funcionando', () => {
  it('mantém caminhos internos', () => {
    expect(safeNextPath('/dashboard')).toBe('/dashboard');
    expect(safeNextPath('/onboarding')).toBe('/onboarding');
    expect(safeNextPath('/conta/assinatura')).toBe('/conta/assinatura');
  });

  it('preserva query string e hash (o padrão de proxy.ts:51 os corromperia)', () => {
    expect(safeNextPath('/onboarding?passo=2')).toBe('/onboarding?passo=2');
    expect(safeNextPath('/dashboard#topo')).toBe('/dashboard#topo');
  });

  it('normaliza caminho relativo para absoluto interno', () => {
    expect(safeNextPath('dashboard')).toBe('/dashboard');
  });

  it('usa o fallback quando não há next', () => {
    expect(safeNextPath(null)).toBe('/dashboard');
    expect(safeNextPath(undefined)).toBe('/dashboard');
    expect(safeNextPath('')).toBe('/dashboard');
  });

  it('aceita fallback customizado', () => {
    expect(safeNextPath('https://evil.com', '/login')).toBe('/login');
  });
});
