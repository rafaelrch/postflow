import { afterEach, describe, expect, it, vi } from 'vitest';
import { appUrl } from '../lib/app-url';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('appUrl', () => {
  describe('em produção (NODE_ENV=production)', () => {
    it('lança erro claro quando NEXT_PUBLIC_APP_URL está ausente (nunca cai em localhost)', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('NEXT_PUBLIC_APP_URL', undefined);

      expect(() => appUrl('/precos')).toThrowError(/NEXT_PUBLIC_APP_URL/);
    });

    it('lança erro quando NEXT_PUBLIC_APP_URL aponta para localhost', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');

      expect(() => appUrl('/precos')).toThrowError(/NEXT_PUBLIC_APP_URL/);
    });

    it('lança erro quando NEXT_PUBLIC_APP_URL aponta para 127.0.0.1', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://127.0.0.1:3000');

      expect(() => appUrl('/precos')).toThrowError(/NEXT_PUBLIC_APP_URL/);
    });

    it('usa o domínio configurado quando NEXT_PUBLIC_APP_URL está definida', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://creatools.com.br');

      const url = appUrl('/cadastro?session_id={CHECKOUT_SESSION_ID}');
      expect(url).toBe('https://creatools.com.br/cadastro?session_id={CHECKOUT_SESSION_ID}');
      expect(url).not.toContain('localhost');
    });

    it('remove barra final da base e adiciona barra inicial no path', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://creatools.com.br/');

      expect(appUrl('dashboard')).toBe('https://creatools.com.br/dashboard');
    });
  });

  describe('em desenvolvimento', () => {
    it('cai em localhost:3000 quando NEXT_PUBLIC_APP_URL está ausente', () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('NEXT_PUBLIC_APP_URL', undefined);

      expect(appUrl('/dashboard')).toBe('http://localhost:3000/dashboard');
    });

    it('respeita NEXT_PUBLIC_APP_URL quando definida', () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:4000');

      expect(appUrl('/dashboard')).toBe('http://localhost:4000/dashboard');
    });
  });
});
