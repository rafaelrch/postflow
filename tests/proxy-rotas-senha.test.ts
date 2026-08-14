/**
 * O guarda de rotas (proxy.ts — o middleware desta versão do Next) e as telas
 * de senha.
 *
 * Duas coisas que só quebram em produção, e caladas:
 *
 *  1. /configuracoes ficar de fora da lista protegida. A página migrou de
 *     /conta; se a proteção não migrar junto, a tela nova abre para visitante
 *     sem sessão.
 *  2. /redefinir-senha entrar em QUALQUER uma das listas. A sessão do link de
 *     recuperação vem no FRAGMENTO da URL, que nunca chega ao servidor: como
 *     rota protegida, o proxy mandaria para o login antes de o JS ler o
 *     fragmento — com o link já queimado. Como rota de auth, quem clicasse
 *     estando logado seria expulso para /dashboard sem ver o formulário.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { config } from '../proxy';

const fonte = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8');

/** As listas do arquivo, lidas do texto — são const local, não export. */
function lista(nome: string): string[] {
  const trecho = new RegExp(`const ${nome} = \\[([^\\]]*)\\]`).exec(fonte);
  if (!trecho) throw new Error(`lista ${nome} não encontrada em proxy.ts`);
  return [...trecho[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('/configuracoes é rota protegida', () => {
  it('está na lista de prefixos protegidos', () => {
    expect(lista('protectedPrefixes')).toContain('/configuracoes');
  });

  it('está no matcher — fora dele o proxy nem roda', () => {
    expect(config.matcher).toContain('/configuracoes/:path*');
  });

  it('/conta continua protegida: o endereço antigo ainda existe como redirect', () => {
    expect(lista('protectedPrefixes')).toContain('/conta');
    expect(config.matcher).toContain('/conta/:path*');
  });
});

describe('as telas de recuperação de senha ficam FORA do proxy', () => {
  it('/redefinir-senha não é protegida nem tratada como rota de auth', () => {
    expect(lista('protectedPrefixes')).not.toContain('/redefinir-senha');
    expect(lista('authPrefixes')).not.toContain('/redefinir-senha');
  });

  it('/recuperar-senha idem — é a saída de quem não consegue entrar', () => {
    expect(lista('protectedPrefixes')).not.toContain('/recuperar-senha');
    expect(lista('authPrefixes')).not.toContain('/recuperar-senha');
  });

  it('nenhuma das duas entra no matcher', () => {
    const matcher = config.matcher as string[];
    expect(matcher.some((m) => m.includes('senha'))).toBe(false);
  });
});
