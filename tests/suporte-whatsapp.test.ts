import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SUPORTE_WHATSAPP_DIGITOS,
  SUPORTE_WHATSAPP_LABEL,
  SUPORTE_WHATSAPP_URL,
} from '@/lib/suporte';

/**
 * SUPORTE POR WHATSAPP (decisão do Rafael, 02/09/2026).
 *
 * O contato de suporte estava copiado e colado em 5 páginas públicas, cada uma
 * com a sua constante `SUPORTE_EMAIL`. A duplicação já tinha cobrado o preço:
 * o endereço espalhado (`contato@creatools.com`) nem era o domínio que envia os
 * e-mails do produto (o Resend usa `creatools.com.br`), e ninguém notou —
 * porque não havia um lugar onde notar.
 *
 * Desde 02/09/2026 as CINCO páginas estão no WhatsApp, com o número real: o
 * Rafael decidiu que "qualquer contato que qualquer usuário quiser ter vai ser
 * direto no WhatsApp", inclusive nas páginas jurídicas.
 *
 * Agora o número vem de `lib/suporte.ts`. Estes testes leem o FONTE das páginas
 * em vez de renderizar: são Server Components de marketing, e o que precisa ser
 * garantido aqui é o destino do link e a ausência do `mailto:`, que se lê no
 * arquivo com menos cerimônia e sem mockar meia dúzia de dependências visuais.
 * É o mesmo caminho de tests/landing-section-headings.test.ts.
 */

const fonte = (caminho: string) =>
  readFileSync(new URL(`../${caminho}`, import.meta.url), 'utf8');

/** O corpo da função `Canais()` de uma página. */
function blocoCanais(src: string): string {
  const inicio = src.indexOf('function Canais()');
  expect(inicio, 'a página não tem função Canais()').toBeGreaterThan(-1);
  const fim = src.indexOf('\n}', inicio);
  return src.slice(inicio, fim);
}

/** As 5 páginas públicas. Todas no WhatsApp desde 02/09/2026. */
const MIGRADAS = [
  { nome: 'landing', caminho: 'app/(marketing)/page.tsx' },
  { nome: '/precos', caminho: 'app/(marketing)/precos/page.tsx' },
  { nome: '/termos', caminho: 'app/(marketing)/termos/page.tsx' },
  { nome: '/privacidade', caminho: 'app/(marketing)/privacidade/page.tsx' },
  { nome: '/reembolso', caminho: 'app/(marketing)/reembolso/page.tsx' },
] as const;

/**
 * MENÇÕES A E-MAIL QUE NÃO SÃO CANAL DE SUPORTE — a rede contra troca
 * automática demais.
 *
 * Migrar o suporte para o WhatsApp é trocar o CANAL, e nada além dele. Estas
 * frases falam de outra coisa e continuam corretas: um `sed` esperto, ou a
 * próxima pessoa com pressa, apagaria as quatro junto e ninguém veria.
 */
const EMAIL_QUE_FICA = [
  {
    nome: '/termos — aviso de alteração dos termos',
    caminho: 'app/(marketing)/termos/page.tsx',
    trecho: 'comunicadas por e-mail ou aviso na plataforma',
  },
  {
    nome: '/privacidade — aviso de alteração da política',
    caminho: 'app/(marketing)/privacidade/page.tsx',
    trecho: 'e-mail ou aviso na plataforma antes de entrarem em vigor',
  },
  {
    nome: '/privacidade — e-mail como DADO coletado',
    caminho: 'app/(marketing)/privacidade/page.tsx',
    trecho: 'nome, e-mail e telefone',
  },
  {
    nome: '/reembolso — e-mail da conta, para identificar a assinatura',
    caminho: 'app/(marketing)/reembolso/page.tsx',
    trecho: 'informando o e-mail usado na assinatura',
  },
] as const;

describe('lib/suporte.ts — a fonte única', () => {
  it('o link é o wa.link canônico, o mesmo canal em forma de link curto', () => {
    // Ordem do Rafael (03/09/2026): o endereço do suporte passa a ser o link
    // curto oficial do WhatsApp. Ele NÃO é derivado dos dígitos — o slug é
    // gerado pela Meta e não tem relação calculável com o número.
    expect(SUPORTE_WHATSAPP_URL).toBe('https://wa.link/eftqk2');
  });

  it('não sobrou nenhum wa.me: dois endereços para o mesmo canal, nunca', () => {
    // O ponto do pedido: um canal, uma URL. Se um wa.me reaparecer em qualquer
    // arquivo do produto, um dos dois vai envelhecer sozinho e ninguém notará.
    for (const caminho of ['lib/suporte.ts', ...MIGRADAS.map((m) => m.caminho)]) {
      expect(fonte(caminho), `${caminho} voltou a usar wa.me`).not.toContain('wa.me');
    }
  });

  it('os dígitos são só dígitos, com DDI — é deles que sai o rótulo', () => {
    // Um '+' , espaço, parêntese ou hífen aqui quebra o link silenciosamente:
    // o WhatsApp abre uma página de erro em vez da conversa.
    expect(SUPORTE_WHATSAPP_DIGITOS).toMatch(/^\d+$/);
    expect(SUPORTE_WHATSAPP_DIGITOS.startsWith('55'), 'falta o DDI do Brasil').toBe(true);
  });

  it('o rótulo exibido é o mesmo número dos dígitos, só formatado', () => {
    expect(SUPORTE_WHATSAPP_LABEL.replace(/\D/g, '')).toBe(
      SUPORTE_WHATSAPP_DIGITOS.slice(2),
    );
  });

  it('o número é o real, não o placeholder com que a lib nasceu', () => {
    const src = fonte('lib/suporte.ts');
    // O placeholder saiu em 02/09/2026, quando o Rafael mandou o número. Se a
    // palavra voltar, alguém devolveu um número de mentira para produção.
    expect(src).not.toContain('PLACEHOLDER');
    expect(src).not.toContain('900000000');
    expect(SUPORTE_WHATSAPP_LABEL).toBe('(71) 99223-0643');
  });
});

describe.each(MIGRADAS)('$nome — suporte por WhatsApp', ({ caminho }) => {
  it('usa a fonte única, e não uma constante própria', () => {
    const src = fonte(caminho);
    expect(src).toContain("from '@/lib/suporte'");
    expect(src, 'voltou a duplicar o contato na página').not.toContain('SUPORTE_EMAIL');
  });

  it('não sobrou nenhum mailto: de suporte', () => {
    expect(fonte(caminho)).not.toContain('mailto:');
  });

  it('o link de contato aponta para a URL da constante', () => {
    const canais = blocoCanais(fonte(caminho));
    expect(canais).toContain('SUPORTE_WHATSAPP_URL');
    expect(canais).toContain('SUPORTE_WHATSAPP_LABEL');
  });

  it('abre em nova aba, com rel de link externo', () => {
    const canais = blocoCanais(fonte(caminho));
    // O WhatsApp é externo: sem noopener, a página aberta ganha window.opener.
    expect(canais).toContain('target="_blank"');
    expect(canais).toContain('rel="noopener noreferrer"');
  });

  it('o texto visível não chama o WhatsApp de e-mail', () => {
    const src = fonte(caminho);
    // O bug que este teste existe para pegar: trocar o href e esquecer a frase,
    // deixando "fale com a gente pelo e-mail" apontando para o WhatsApp.
    // Entre a palavra e o componente pode haver o `{' '}` do JSX, que é como as
    // páginas jurídicas escrevem — por isso o espaço aceita as duas formas.
    const espaco = "(\\{' '\\}|\\s)*";
    expect(src).not.toMatch(new RegExp(`e-mail${espaco}<Canais\\s*/>`));
    expect(src).toMatch(new RegExp(`WhatsApp${espaco}<Canais\\s*/>`));
  });
});

describe('nenhum mailto: de suporte sobra em página pública nenhuma', () => {
  it('as 5 páginas estão no WhatsApp', () => {
    for (const { nome, caminho } of MIGRADAS) {
      expect(fonte(caminho).includes('mailto:'), `${nome} ainda tem mailto:`).toBe(false);
    }
  });
});

describe('o e-mail que NÃO é suporte continua onde estava', () => {
  it.each(EMAIL_QUE_FICA)('$nome', ({ caminho, trecho }) => {
    // Se este teste cair numa mudança de canal, a troca passou do ponto:
    // apagou uma frase que fala de notificação, de dado coletado ou do e-mail
    // da conta — nenhuma delas é o canal de atendimento.
    expect(fonte(caminho)).toContain(trecho);
  });
});
