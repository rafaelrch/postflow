// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * PREVIEW DOS TEMPLATES NO WIZARD (TASK 2 + 2B) — decisão D1 do Rafael.
 *
 * O card mostra o preview pronto de `public/templates/`, e a miniatura VIVA
 * (o `SlidePreview` de verdade) continua existindo como degrau de baixo,
 * para quando a imagem falta ou falha.
 *
 * TASK 2B: os previews chegaram nos TRÊS formatos. O que era um asset por
 * template virou um asset por PAR (template × formato), e 1:1/9:16 deixaram de
 * cair na miniatura viva por falta de formato.
 *
 * O bug que assusta aqui não é o card sem imagem — é o preview TROCADO: o card
 * do Manifesto mostrando a capa do Radar, ou o card em Stories mostrando o
 * arquivo 4:5. Ninguém pega isso lendo diff, e no portal só pega quem já
 * conhece os doze de cor. Por isso cada teste amarra o arquivo ao PAR dono
 * dele, e não só "existe uma imagem".
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('react-hot-toast', () => ({
  default: { loading: vi.fn(), success: vi.fn(), error: vi.fn() },
}));
// O wizard carrega o contexto de marca ao montar. Sem sessão ele desiste cedo,
// que é o caminho que interessa aqui.
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock('@/lib/upload-image', () => ({ uploadImageFile: vi.fn() }));

/**
 * A chave ATELIER_ENABLED (lib/feature-flags.ts) está `false` desde 02/09/2026
 * — o Atelier saiu do grid do wizard. Este arquivo a fixa em `true` DE
 * PROPÓSITO: ele exercita o caminho de forma LIVRE da criação (o passo 4,
 * "Identidade visual"), e o Atelier é o único template desse tipo que o wizard
 * lista — todos os outros estão em `FIXED_VISUAL_STYLES`. Sem fixar a chave, a
 * cobertura desse caminho sumiria junto com a oferta, e o código dele
 * apodreceria calado até o Atelier voltar. Desativar não é remover: o caminho
 * continua de pé e continua testado.
 *
 * Quem prova o que o grid mostra em cada estado da chave — e que carrossel
 * Atelier salvo continua abrindo com ela desligada — é
 * tests/atelier-feature-flag.test.tsx.
 */
vi.mock('@/lib/feature-flags', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/feature-flags')>()),
  ATELIER_ENABLED: true,
}));

import CreateWizard, { TemplateThumb } from '@/components/editor/CreateWizard';

/** Os três formatos, com o rótulo do card do passo 1 e a caixa do asset. */
const FORMATOS = [
  { format: '4:5' as const, rotulo: 'Carrossel', sufixo: '4x5', width: '540', height: '675' },
  { format: '1:1' as const, rotulo: 'Quadrado', sufixo: '1x1', width: '675', height: '675' },
  { format: '9:16' as const, rotulo: 'Stories', sufixo: '9x16', width: '380', height: '675' },
];

/** Ordem do grid 2×2 e o estilo dono de cada card. */
const TEMPLATES = [
  { label: 'Profile', style: 'profile' },
  { label: 'Atelier', style: 'editorial' },
  { label: 'Manifesto', style: 'template01' },
  { label: 'Radar', style: 'template02' },
];

/**
 * A matriz completa: 4 templates × 3 formatos = 12 pares, cada um com O SEU
 * arquivo. Escrita como dado, e não lida do mapa do componente — um teste que
 * consultasse a mesma fonte que o código passaria com a fonte errada.
 */
const ESPERADO = FORMATOS.flatMap(({ format, rotulo, sufixo, width, height }) =>
  TEMPLATES.map(({ label, style }) => ({
    label,
    style,
    format,
    rotulo,
    width,
    height,
    arquivo: `/templates/preview-${style}-${sufixo}.webp`,
  })),
);

/** Abre o wizard já no passo de TEMPLATE (2 de 4), no formato pedido. */
function abreWizard(rotulo = 'Carrossel') {
  const r = render(<CreateWizard onClose={vi.fn()} />);
  // O 4:5 já vem selecionado; clicar nele de novo é inofensivo e mantém um
  // caminho só para os três formatos.
  fireEvent.click(screen.getByText(rotulo));
  fireEvent.click(screen.getByText('Continuar'));
  return r;
}

/**
 * O `next/image` reescreve o src para `/_next/image?url=…`, então o caminho do
 * arquivo chega percent-encoded. Decodificar é o que deixa o teste falar do
 * asset ("preview-profile-4x5.webp") em vez da mecânica do otimizador.
 */
function arquivoDoPreview(img: HTMLElement): string {
  return decodeURIComponent(img.getAttribute('src') || '');
}

/** O botão-card de um template, pelo rótulo de produto que ele exibe. */
function cardDe(label: string): HTMLElement {
  return screen.getByText(label).closest('button') as HTMLElement;
}

afterEach(cleanup);

describe('os 4 previews aparecem, cada um no seu card, nos 3 formatos', () => {
  it.each(FORMATOS)('em $format o grid mostra os 4 templates com uma imagem cada', ({ rotulo }) => {
    abreWizard(rotulo);
    for (const { label, style } of TEMPLATES) {
      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.getByTestId(`template-preview-${style}`)).toBeTruthy();
    }
  });

  it.each(ESPERADO)(
    '$label em $format carrega $arquivo — e não o preview de outro par',
    ({ label, rotulo, arquivo }) => {
      abreWizard(rotulo);
      // Busca DENTRO do card, não no documento: é isso que pega o preview
      // trocado. Um `getByTestId` solto passaria mesmo com as 4 imagens
      // penduradas no card errado.
      const img = within(cardDe(label)).getByRole('presentation', { hidden: true });
      expect(arquivoDoPreview(img)).toContain(arquivo);
    },
  );

  it('nenhum arquivo se repete — nem entre templates, nem entre formatos', () => {
    // Rede de segurança contra o mapa apontando dois pares para o mesmo asset:
    // o caso em que cada card "tem imagem" e mesmo assim está errado. Cobre
    // tanto o Manifesto com a capa do Radar quanto o Stories servindo o 4:5.
    const arquivos: string[] = [];
    for (const { rotulo } of FORMATOS) {
      abreWizard(rotulo);
      for (const { label } of TEMPLATES) {
        arquivos.push(
          arquivoDoPreview(within(cardDe(label)).getByRole('presentation', { hidden: true })),
        );
      }
      cleanup();
    }
    expect(arquivos).toHaveLength(12);
    expect(new Set(arquivos).size).toBe(12);
  });

  it.each(ESPERADO)('o arquivo de $label em $format existe em public/', ({ arquivo }) => {
    // O mapa pode apontar para um asset que ninguém gerou: em produção isso
    // vira 404 e queda silenciosa na miniatura viva — o card continua de pé e
    // ninguém descobre que o preview sumiu.
    expect(existsSync(join(process.cwd(), 'public', arquivo))).toBe(true);
  });

  it('a ordem dos cards no grid não mudou', () => {
    abreWizard();
    const rotulos = TEMPLATES.map((e) => e.label);
    const posicoes = rotulos.map((l) => screen.getByText(l).compareDocumentPosition(screen.getByText(rotulos[0])));
    // O primeiro é ele mesmo (0); os demais vêm DEPOIS dele no documento.
    expect(posicoes[0]).toBe(0);
    for (const p of posicoes.slice(1)) expect(p & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });
});

describe('peso e estabilidade do carregamento', () => {
  it.each(ESPERADO)(
    '$label em $format é lazy e declara a caixa $width×$height',
    ({ rotulo, style, width, height }) => {
      abreWizard(rotulo);
      const img = screen.getByTestId(`template-preview-${style}`);
      expect(img.getAttribute('loading')).toBe('lazy');
      expect(img.getAttribute('decoding')).toBe('async');
      // width/height intrínsecos: é o que reserva a caixa antes de a imagem
      // chegar. Sem eles o grid se mexe embaixo do ponteiro — e uma dimensão
      // só, herdada do 4:5, traria o salto de volta em 1:1 e 9:16.
      expect(img.getAttribute('width')).toBe(width);
      expect(img.getAttribute('height')).toBe(height);
    },
  );

  it.each(FORMATOS)('em $format o card mostra o esqueleto enquanto não carrega', ({ rotulo }) => {
    abreWizard(rotulo);
    expect(screen.getByTestId('template-preview-loading-profile')).toBeTruthy();
  });

  it('o esqueleto some quando a imagem carrega', async () => {
    // `await` não é enfeite: o `next/image` não repassa o load na hora — ele
    // passa por `img.decode()` (uma Promise) antes de chamar o nosso `onLoad`.
    // Sem esperar, o teste olharia o card um microtask cedo demais.
    abreWizard();
    fireEvent.load(screen.getByTestId('template-preview-profile'));
    await waitFor(() =>
      expect(screen.queryByTestId('template-preview-loading-profile')).toBeNull(),
    );
    // E a imagem continua lá: carregar não pode derrubar o card no fallback.
    expect(screen.getByTestId('template-preview-profile')).toBeTruthy();
  });
});

describe('fallback: a miniatura viva é o degrau de baixo, não lixo', () => {
  it.each(FORMATOS)(
    'em $format, imagem que falha vira SlidePreview vivo, sem card quebrado',
    ({ rotulo }) => {
      abreWizard(rotulo);
      // Antes: imagem, sem miniatura viva.
      expect(screen.getByTestId('template-preview-template01')).toBeTruthy();
      expect(screen.queryByTestId('template-thumb-vivo-template01')).toBeNull();

      fireEvent.error(screen.getByTestId('template-preview-template01'));

      // Depois: a imagem sai de cena e a miniatura viva assume o lugar dela.
      expect(screen.queryByTestId('template-preview-template01')).toBeNull();
      expect(screen.getByTestId('template-thumb-vivo-template01')).toBeTruthy();
    },
  );

  it.each(FORMATOS)('em $format a falha de um card não derruba os outros três', ({ rotulo }) => {
    abreWizard(rotulo);
    fireEvent.error(screen.getByTestId('template-preview-template01'));
    for (const style of ['profile', 'editorial', 'template02']) {
      expect(screen.getByTestId(`template-preview-${style}`)).toBeTruthy();
    }
  });

  it('o card que caiu no fallback continua selecionável', () => {
    // O degrau de baixo não pode custar a função do card.
    abreWizard();
    fireEvent.error(screen.getByTestId('template-preview-template01'));
    fireEvent.click(cardDe('Manifesto'));
    expect(cardDe('Manifesto').getAttribute('aria-pressed')).toBe('true');
  });

  it.each(FORMATOS)(
    'em $format, estilo SEM preview (minimalist) abre já na miniatura viva',
    ({ format }) => {
      // `minimalist` é `null` nos três formatos e não tem card no wizard, então
      // esta queda só é alcançável montando a miniatura direto. É o motivo de
      // `TemplateThumb` ser exportado: sem isto, o ramo "asset ausente" ficaria
      // sem teste — e é ele que separa card sem imagem de card QUEBRADO.
      render(<TemplateThumb style="minimalist" format={format} />);
      expect(screen.queryByTestId('template-preview-minimalist')).toBeNull();
      expect(screen.getByTestId('template-thumb-vivo-minimalist')).toBeTruthy();
    },
  );
});

describe('seleção e acessibilidade continuam de pé', () => {
  it.each(ESPERADO)('$label em $format é selecionável por clique', ({ label, rotulo }) => {
    abreWizard(rotulo);
    fireEvent.click(cardDe(label));
    expect(cardDe(label).getAttribute('aria-pressed')).toBe('true');
  });

  it('escolher um template desmarca o anterior — só um fica pressionado', () => {
    abreWizard();
    fireEvent.click(cardDe('Radar'));
    const pressionados = TEMPLATES.filter(
      ({ label }) => cardDe(label).getAttribute('aria-pressed') === 'true',
    );
    expect(pressionados.map((p) => p.label)).toEqual(['Radar']);
  });

  it.each(TEMPLATES)('$label é selecionável por TECLADO', ({ label }) => {
    // O card é um <button> nativo: Enter e Espaço viram click pelo browser, e
    // é isso que precisa continuar valendo depois de a imagem entrar dentro
    // dele. Um <div onClick> teria perdido isso em silêncio.
    abreWizard();
    const card = cardDe(label);
    expect(card.tagName).toBe('BUTTON');
    card.focus();
    expect(document.activeElement).toBe(card);
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.click(card); // o que o browser dispara em seguida
    expect(card.getAttribute('aria-pressed')).toBe('true');
  });

  it('o card não fica desabilitado nem some do foco', () => {
    abreWizard();
    for (const { label } of TEMPLATES) {
      const card = cardDe(label);
      expect(card.hasAttribute('disabled')).toBe(false);
      expect(card.getAttribute('tabindex')).not.toBe('-1');
    }
  });

  it.each(FORMATOS)('em $format a imagem é DECORATIVA — nada anunciado 2x', ({ rotulo }) => {
    // O nome ("Manifesto") e a linha de apoio já são texto dentro do mesmo
    // botão. alt descritivo faria o leitor repetir o mesmo nome logo em
    // seguida, então o alt é vazio de propósito.
    abreWizard(rotulo);
    for (const { style } of TEMPLATES) {
      expect(screen.getByTestId(`template-preview-${style}`).getAttribute('alt')).toBe('');
    }
  });

  it('a faixa de detalhe abaixo do grid segue o template selecionado', () => {
    abreWizard();
    fireEvent.click(cardDe('Radar'));
    expect(screen.getByText(/os 3 modelos se alternam/i)).toBeTruthy();
    fireEvent.click(cardDe('Atelier'));
    expect(screen.getByText(/metadados no topo/i)).toBeTruthy();
  });

  it('o texto dos cards não mudou', () => {
    abreWizard();
    expect(screen.getByText('Post social, focado em texto')).toBeTruthy();
    expect(screen.getByText('Revista para creators')).toBeTruthy();
    expect(screen.getByText('Deck fechado de 6 slides')).toBeTruthy();
    expect(screen.getByText('Deck aberto: quantos slides você quiser')).toBeTruthy();
  });
});
