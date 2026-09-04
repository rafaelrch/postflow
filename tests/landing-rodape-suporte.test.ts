import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SUPORTE_WHATSAPP_URL } from '@/lib/suporte';

/**
 * O RODAPÉ DA LANDING — coluna "Suporte".
 *
 * Duas ordens do Rafael em 03/09/2026, palavras dele: *"no rodapé: remova
 * 'Ativar acesso'; o Suporte tem que levar para esse link -> wa.link/eftqk2"*.
 *
 * O teste lê a FONTE em vez de renderizar porque a landing é um Server
 * Component de ~2200 linhas: montá-la no jsdom traria `next/image`, o parallax e
 * meia dúzia de efeitos junto, para afirmar duas linhas de dado. `FOOTER_COLS` é
 * uma lista literal — ler o bloco dela é a medição direta.
 *
 * O que ele NÃO pediu e continua: o item "FAQ" e o rótulo com o número
 * "(71) 99223-0643" onde já aparecia. Aqui muda só o destino.
 */

const SRC = readFileSync(
  join(process.cwd(), 'app/(marketing)/page.tsx'),
  'utf8',
);

/** Só a coluna 'Suporte' do FOOTER_COLS — não o arquivo inteiro. */
function colunaSuporte(): string {
  const inicio = SRC.indexOf("{ title: 'Suporte'");
  expect(inicio, 'a coluna Suporte sumiu do rodapé').toBeGreaterThan(-1);
  const fim = SRC.indexOf("{ title: 'Legal'", inicio);
  return SRC.slice(inicio, fim);
}

describe('rodapé: a coluna Suporte', () => {
  it("'Ativar acesso' não existe mais em lugar nenhum da landing", () => {
    // Varre a página inteira, não só o rodapé: se alguém "restaurar" o item
    // noutra coluna, continua sendo o item que ele mandou tirar.
    expect(SRC).not.toContain('Ativar acesso');
  });

  it('o item Suporte aponta para o link do WhatsApp, não mais para #faq', () => {
    const col = colunaSuporte();
    expect(col).toContain('SUPORTE_WHATSAPP_URL');
    // O href literal '#faq' só pode sobrar no FAQ, que ele não mandou mexer.
    expect(col.match(/#faq/g) ?? []).toHaveLength(1);
    expect(col).toContain("{ label: 'FAQ', href: '#faq' }");
  });

  it('a URL vem da fonte única, e é o wa.link', () => {
    expect(SRC).toContain("from '@/lib/suporte'");
    expect(SUPORTE_WHATSAPP_URL).toBe('https://wa.link/eftqk2');
    // Nada de URL escrita à mão na página.
    expect(SRC).not.toContain('wa.link/');
  });

  it('link externo abre em nova aba, com rel de segurança', () => {
    // Sem `noopener`, a página aberta ganha `window.opener` e pode navegar esta.
    // O marcador `external` é o que liga isso — e ele existe no item do Suporte.
    expect(colunaSuporte()).toContain('external: true');
    expect(SRC).toContain("target: '_blank'");
    expect(SRC).toContain("rel: 'noopener noreferrer'");
  });
});
