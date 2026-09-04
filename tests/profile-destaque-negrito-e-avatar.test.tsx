// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import ProfileSlide from '@/components/slides/ProfileSlide';
import EditorialSlide from '@/components/slides/EditorialSlide';
import { renderTextWithHighlights } from '@/lib/text-highlights';
import {
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_PROFILE_BADGE,
  DEFAULT_SLIDE,
  type GlobalSettings,
  type Slide,
} from '@/types';

/**
 * DUAS ORDENS DO RAFAEL NO PROFILE (04/09/2026), testando no servidor local.
 *
 * B2 — *"no template de Profile o destaque é só pra deixar a fonte BOLD. Não é
 *      pra mudar a cor, não é pra mudar nada. É só pra deixar a fonte bold."*
 *
 * B3 — *"quando eu aumento e diminuo, só aumenta e diminui o texto: o nome, o @
 *      e o verificado. A imagem fica parada. É pra imagem também, a foto de
 *      perfil, aumentar junto com o resto."*
 *
 * As duas medem o RENDER: o estilo que sai no DOM, não o que a função promete.
 */

afterEach(cleanup);

const AZUL = '#00CFFF';

function settings(over: Partial<GlobalSettings> = {}): GlobalSettings {
  return { ...DEFAULT_GLOBAL_SETTINGS, ...over };
}

/** GlobalSettings com um `headerFontSize` específico. */
function comHeader(headerFontSize?: number): GlobalSettings {
  const badge = { ...DEFAULT_PROFILE_BADGE, show: true, name: 'Ana', handle: '@ana' };
  if (headerFontSize === undefined) {
    // Deck antigo cujo `profile_badge` gravado não trouxe a chave.
    delete (badge as Partial<typeof badge>).headerFontSize;
  } else {
    badge.headerFontSize = headerFontSize;
  }
  return settings({ profileBadge: badge as GlobalSettings['profileBadge'] });
}

function slide(over: Partial<Slide> = {}): Slide {
  return { ...DEFAULT_SLIDE, id: 's1', position: 0, title: 'MARCA FORTE VENDE', ...over } as Slide;
}

/** Foto vazia de propósito: o avatar cai no círculo com a inicial, que é o
 *  mesmo elemento medido — o tamanho não depende de haver imagem. */
const PERFIL = { photo: '', name: 'Ana', handle: '@ana' };

function desenha(s: Slide, g: GlobalSettings) {
  const { container } = render(
    <ProfileSlide
      slide={s}
      globalSettings={g}
      profileData={PERFIL}
      slideIndex={0}
      totalSlides={1}
    />,
  );
  return container;
}

// ── B2 ────────────────────────────────────────────────────────────────────

describe('B2 — no Profile, o destaque é SÓ negrito', () => {
  /** Os spans que o destaque criou dentro do título. */
  function spansDoTitulo(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll('span > span')).filter(
      (el) => (el.textContent ?? '').trim() !== '',
    ) as HTMLElement[];
  }

  it('a palavra marcada sai em negrito', () => {
    const c = desenha(
      slide({ highlights: [{ text: 'FORTE', color: '#FF0000' }] }),
      comHeader(26),
    );
    const marcada = spansDoTitulo(c).find((el) => el.textContent === 'FORTE');

    expect(marcada, 'a palavra marcada não virou span').toBeTruthy();
    expect(marcada!.style.fontWeight).toBe('700');
  });

  it('a cor GRAVADA no destaque não é aplicada — nem a do deck antigo', () => {
    // 🔴 O caso de nao-regressão que importa: decks de Profile salvos antes de
    // 04/09/2026 têm `color` no objeto. A regra nova é que ele deixe de ser
    // APLICADO, não que o deck quebre ao abrir.
    const c = desenha(
      slide({ highlights: [{ text: 'FORTE', color: '#FF0000' }] }),
      comHeader(26),
    );
    const marcada = spansDoTitulo(c).find((el) => el.textContent === 'FORTE')!;

    expect(marcada.style.color).toBe('');
    expect(c.innerHTML).not.toContain('rgb(255, 0, 0)');
    expect(c.innerHTML).not.toContain('#FF0000');
    // E o texto continua todo lá: nada sumiu junto com a cor.
    expect(c.textContent).toContain('MARCA FORTE VENDE');
  });

  it('sublinhado e fonte própria gravados também deixam de valer', () => {
    // "Não é pra mudar nada" — só o peso.
    const c = desenha(
      slide({
        highlights: [
          { text: 'FORTE', color: '#FF0000', underline: true, font: 'SF Pro Display Light' },
        ],
      }),
      comHeader(26),
    );
    const marcada = spansDoTitulo(c).find((el) => el.textContent === 'FORTE')!;

    expect(marcada.style.borderBottom).toBe('');
    expect(marcada.style.fontFamily).toBe('');
    expect(marcada.style.fontWeight).toBe('700');
  });

  it('palavra NÃO marcada não ganha peso nenhum', () => {
    const c = desenha(slide({ highlights: [{ text: 'FORTE', color: '#FF0000' }] }), comHeader(26));
    const outra = spansDoTitulo(c).find((el) => el.textContent === 'MARCA');

    // Ela nem vira span: sem destaque e sem sublinhado, o token sai cru.
    expect(outra).toBeUndefined();
  });
});

describe('B2 — os OUTROS estilos que dividem a função não mudaram', () => {
  it('o modo padrão (`color`) continua pintando a cor', () => {
    // Chamada direta, no modo de sempre — é o que Editorial e Minimalista usam.
    const { container } = render(
      <div>
        {renderTextWithHighlights(
          'MARCA FORTE',
          [{ text: 'FORTE', color: '#FF0000' }],
          '',
          AZUL,
          {},
        )}
      </div>,
    );
    const marcada = Array.from(container.querySelectorAll('span > span')).find(
      (el) => el.textContent === 'FORTE',
    ) as HTMLElement;

    expect(marcada.style.color).toBe('rgb(255, 0, 0)');
    expect(marcada.style.fontWeight).toBe('');
  });

  it('o Editorial, mesmo desligado por flag, continua com destaque colorido', () => {
    // O código dele segue vivo; a flag só tira o template da OFERTA.
    const { container } = render(
      <EditorialSlide
        slide={slide({ highlights: [{ text: 'FORTE', color: '#FF0000' }] })}
        globalSettings={settings()}
        slideIndex={1}
        totalSlides={2}
      />,
    );
    expect(container.innerHTML).toContain('rgb(255, 0, 0)');
  });
});

// ── B3 ────────────────────────────────────────────────────────────────────

describe('B3 — a foto de perfil escala junto com o cabeçalho', () => {
  /** O círculo do avatar: o primeiro elemento com borderRadius 50%. */
  function avatar(container: HTMLElement): HTMLElement {
    const el = Array.from(container.querySelectorAll('div')).find(
      (d) => (d as HTMLElement).style.borderRadius === '50%' && (d as HTMLElement).style.width,
    ) as HTMLElement;
    expect(el, 'não achei o círculo do avatar').toBeTruthy();
    return el;
  }

  const badge = (h?: number) => comHeader(h);

  it('NÃO-REGRESSÃO: no padrão gravado (26) o avatar continua 84px', () => {
    // 🔴 O teste mais importante desta tarefa. `DEFAULT_PROFILE_BADGE` traz 26,
    // e `slide-mapper` cai nele quando o deck não gravou `profile_badge` — ou
    // seja, 26 é o número que os decks REAIS têm. Ancorar a proporção em 30,
    // como parecia à primeira vista, teria encolhido o avatar de 84 para 73 em
    // todo carrossel de Profile já salvo.
    expect(DEFAULT_PROFILE_BADGE.headerFontSize).toBe(26);
    const a = avatar(desenha(slide(), badge(26)));
    expect(a.style.width).toBe('84px');
    expect(a.style.height).toBe('84px');
  });

  it('NÃO-REGRESSÃO: sem a chave gravada, o avatar também continua 84px', () => {
    const a = avatar(desenha(slide(), badge(undefined)));
    expect(a.style.width).toBe('84px');
  });

  it('aumentar o tamanho do cabeçalho aumenta a foto', () => {
    // A queixa dele: só o texto crescia.
    const maior = avatar(desenha(slide(), badge(52)));
    expect(parseInt(maior.style.width, 10)).toBeGreaterThan(84);
    expect(maior.style.width).toBe(maior.style.height);
  });

  it('diminuir o tamanho diminui a foto', () => {
    const menor = avatar(desenha(slide(), badge(14)));
    expect(parseInt(menor.style.width, 10)).toBeLessThan(84);
  });

  it('a foto acompanha na MESMA proporção, não por um passo fixo', () => {
    const base = parseInt(avatar(desenha(slide(), badge(26))).style.width, 10);
    cleanup();
    const dobro = parseInt(avatar(desenha(slide(), badge(52))).style.width, 10);
    expect(dobro).toBe(base * 2);
  });

  it('o que dependia do avatar escala junto — a coluna de texto não desalinha', () => {
    // `left: avatarSize + gap` e a altura do bloco saem do mesmo número. Se um
    // deles tivesse ficado fixo, o nome sentaria em cima da foto.
    const c = desenha(slide(), badge(52));
    const a = avatar(c);
    const largura = parseInt(a.style.width, 10);
    const coluna = Array.from(c.querySelectorAll('div')).find(
      (d) => (d as HTMLElement).style.position === 'absolute' && (d as HTMLElement).style.left.endsWith('px')
        && parseInt((d as HTMLElement).style.left, 10) > largura,
    ) as HTMLElement;

    expect(coluna, 'a coluna nome/@ não está deslocada além do avatar').toBeTruthy();
    // O respiro cresceu junto: no padrão são 22px, aqui tem de ser maior.
    expect(parseInt(coluna.style.left, 10) - largura).toBeGreaterThan(22);
  });

  it('o container do cabeçalho tem a altura do avatar NOVO', () => {
    // 🔴 Este caso já passou nos DOIS estados uma vez: com o avatar fixo em 84,
    // o container também media 84, e "as duas alturas batem" era verdade no
    // código velho. O que separa os estados é a altura ter DEIXADO de ser 84 —
    // então é isso que se afirma, além da igualdade.
    const c = desenha(slide(), badge(52));
    const altura = avatar(c).style.height;

    expect(altura).not.toBe('84px');
    const header = Array.from(c.querySelectorAll('div')).find(
      (d) => (d as HTMLElement).style.position === 'relative' && (d as HTMLElement).style.height === altura,
    );
    expect(header, 'o container do header não acompanhou o avatar').toBeTruthy();
  });
});
