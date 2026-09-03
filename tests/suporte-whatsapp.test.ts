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

/** As páginas já migradas para o WhatsApp. */
const MIGRADAS = [
  { nome: 'landing', caminho: 'app/(marketing)/page.tsx' },
  { nome: '/precos', caminho: 'app/(marketing)/precos/page.tsx' },
] as const;

/**
 * As páginas que AINDA NÃO migraram, e por quê.
 *
 * /termos, /privacidade e /reembolso são o item B3 do go-live (conteúdo
 * jurídico preliminar). Nelas o `<Canais />` aparece DENTRO de cláusula, atrás
 * da expressão "pelo e-mail", e duas cláusulas amarram a razão jurídica ao
 * e-mail especificamente:
 *
 *   - /reembolso §2: "Preferimos o e-mail: ele registra por escrito a data do
 *     pedido, que é o que conta para o prazo" — o valor probatório do e-mail
 *     dentro do prazo de arrependimento de 7 dias (CDC art. 49).
 *   - /privacidade §1: o canal é a via do titular exercer direitos (LGPD
 *     art. 41), e o comentário do arquivo registra que o e-mail está ali porque
 *     "por Instagram, só exerce direitos quem TEM conta na plataforma".
 *
 * Trocar o canal nessas duas exige reescrever texto de cláusula, o que a T3
 * proíbe sem decisão. Enquanto a decisão não vem, este bloco fixa o estado
 * atual: é tripwire, não aprovação. Quando a resposta chegar, a página migrada
 * SAI daqui e ENTRA em MIGRADAS — o teste vermelho é o lembrete.
 */
const PENDENTES = [
  { nome: '/termos', caminho: 'app/(marketing)/termos/page.tsx' },
  { nome: '/privacidade', caminho: 'app/(marketing)/privacidade/page.tsx' },
  { nome: '/reembolso', caminho: 'app/(marketing)/reembolso/page.tsx' },
] as const;

describe('lib/suporte.ts — a fonte única', () => {
  it('o link é um wa.me montado com os dígitos da constante', () => {
    expect(SUPORTE_WHATSAPP_URL).toBe(`https://wa.me/${SUPORTE_WHATSAPP_DIGITOS}`);
    expect(SUPORTE_WHATSAPP_URL).toBe('https://wa.me/5571900000000');
  });

  it('os dígitos são só dígitos, com DDI — é o que o wa.me aceita', () => {
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

  it('está marcada como PLACEHOLDER, para não virar número definitivo por esquecimento', () => {
    expect(fonte('lib/suporte.ts')).toContain('PLACEHOLDER');
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

  it('o link de contato aponta para o wa.me da constante', () => {
    const canais = blocoCanais(fonte(caminho));
    expect(canais).toContain('SUPORTE_WHATSAPP_URL');
    expect(canais).toContain('SUPORTE_WHATSAPP_LABEL');
  });

  it('abre em nova aba, com rel de link externo', () => {
    const canais = blocoCanais(fonte(caminho));
    // O wa.me é externo: sem noopener, a página aberta ganha window.opener.
    expect(canais).toContain('target="_blank"');
    expect(canais).toContain('rel="noopener noreferrer"');
  });

  it('o texto visível não chama o WhatsApp de e-mail', () => {
    const src = fonte(caminho);
    // O bug que este teste existe para pegar: trocar o href e esquecer a frase,
    // deixando "fale com a gente pelo e-mail" apontando para o WhatsApp.
    expect(src).not.toMatch(/e-mail\s*<Canais\s*\/>/);
    expect(src).toMatch(/WhatsApp\s*<Canais\s*\/>/);
  });
});

describe('páginas jurídicas — migração pendente de decisão (B3)', () => {
  it.each(PENDENTES)(
    '$nome ainda usa e-mail: aguarda decisão sobre o texto da cláusula',
    ({ nome, caminho }) => {
      const src = fonte(caminho);
      expect(
        src.includes('mailto:'),
        `${nome} migrou para o WhatsApp: mova a página de PENDENTES para MIGRADAS ` +
        'neste arquivo e confira se o texto da cláusula foi ajustado junto.',
      ).toBe(true);
    },
  );
});
