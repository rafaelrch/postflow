// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react';

/**
 * PREVIEW DOS TEMPLATES NO WIZARD (TASK 2) — decisão D1 do Rafael.
 *
 * O card mostra o preview pronto de `public/templates/`, e a miniatura VIVA
 * (o `SlidePreview` de verdade) continua existindo como degrau de baixo,
 * para quando a imagem falta ou falha.
 *
 * O bug que assusta aqui não é o card sem imagem — é o preview TROCADO: o card
 * do Manifesto mostrando a capa do Radar. Ninguém pega isso lendo diff, e no
 * portal só pega quem já conhece os quatro de cor. Por isso cada teste amarra
 * o arquivo ao SlideStyle dono dele, e não só "existe uma imagem".
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

import CreateWizard from '@/components/editor/CreateWizard';

/** Abre o wizard já no passo de TEMPLATE (2 de 4), no formato padrão 4:5. */
function abreWizard() {
  const r = render(<CreateWizard onClose={vi.fn()} />);
  fireEvent.click(screen.getByText('Continuar'));
  return r;
}

/**
 * O `next/image` reescreve o src para `/_next/image?url=…`, então o caminho do
 * arquivo chega percent-encoded. Decodificar é o que deixa o teste falar do
 * asset ("preview-profile.webp") em vez da mecânica do otimizador.
 */
function arquivoDoPreview(img: HTMLElement): string {
  return decodeURIComponent(img.getAttribute('src') || '');
}

/** O botão-card de um template, pelo rótulo de produto que ele exibe. */
function cardDe(label: string): HTMLElement {
  return screen.getByText(label).closest('button') as HTMLElement;
}

/** Ordem do grid 2×2 e o arquivo que cada card DEVE mostrar. */
const ESPERADO: { label: string; style: string; arquivo: string }[] = [
  { label: 'Profile',   style: 'profile',    arquivo: '/templates/preview-profile.webp' },
  { label: 'Atelier',   style: 'editorial',  arquivo: '/templates/preview-editorial.webp' },
  { label: 'Manifesto', style: 'template01', arquivo: '/templates/preview-template01.webp' },
  { label: 'Radar',     style: 'template02', arquivo: '/templates/preview-template02.webp' },
];

afterEach(cleanup);

describe('os 4 previews aparecem, cada um no seu card', () => {
  it('o grid mostra os 4 templates com uma imagem cada', () => {
    abreWizard();
    for (const { label, style } of ESPERADO) {
      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.getByTestId(`template-preview-${style}`)).toBeTruthy();
    }
  });

  it.each(ESPERADO)(
    '$label carrega $arquivo — e não o preview de outro template',
    ({ label, arquivo }) => {
      abreWizard();
      // Busca DENTRO do card, não no documento: é isso que pega o preview
      // trocado. Um `getByTestId` solto passaria mesmo com as 4 imagens
      // penduradas no card errado.
      const img = within(cardDe(label)).getByRole('presentation', { hidden: true });
      expect(arquivoDoPreview(img)).toContain(arquivo);
    },
  );

  it('nenhum arquivo de preview se repete entre os cards', () => {
    // Rede de segurança contra o mapa apontando dois estilos para o mesmo
    // asset — o caso em que cada card "tem imagem" e mesmo assim está errado.
    abreWizard();
    const arquivos = ESPERADO.map(({ label }) =>
      arquivoDoPreview(within(cardDe(label)).getByRole('presentation', { hidden: true })),
    );
    expect(new Set(arquivos).size).toBe(4);
  });

  it('a ordem dos cards no grid não mudou', () => {
    abreWizard();
    const rotulos = ESPERADO.map((e) => e.label);
    const posicoes = rotulos.map((l) => screen.getByText(l).compareDocumentPosition(screen.getByText(rotulos[0])));
    // O primeiro é ele mesmo (0); os demais vêm DEPOIS dele no documento.
    expect(posicoes[0]).toBe(0);
    for (const p of posicoes.slice(1)) expect(p & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });
});

describe('peso e estabilidade do carregamento', () => {
  it('as imagens são lazy e têm dimensão declarada — o card não salta', () => {
    abreWizard();
    for (const { style } of ESPERADO) {
      const img = screen.getByTestId(`template-preview-${style}`);
      expect(img.getAttribute('loading')).toBe('lazy');
      expect(img.getAttribute('decoding')).toBe('async');
      // width/height intrínsecos: é o que reserva a caixa antes de a imagem
      // chegar. Sem eles o grid se mexe embaixo do ponteiro.
      expect(img.getAttribute('width')).toBe('540');
      expect(img.getAttribute('height')).toBe('675');
    }
  });

  it('enquanto não carrega, o card mostra o esqueleto no lugar da imagem', () => {
    abreWizard();
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
  it('imagem que falha vira SlidePreview vivo, sem card quebrado', () => {
    abreWizard();
    // Antes: imagem, sem miniatura viva.
    expect(screen.getByTestId('template-preview-template01')).toBeTruthy();
    expect(screen.queryByTestId('template-thumb-vivo-template01')).toBeNull();

    fireEvent.error(screen.getByTestId('template-preview-template01'));

    // Depois: a imagem sai de cena e a miniatura viva assume o lugar dela.
    expect(screen.queryByTestId('template-preview-template01')).toBeNull();
    expect(screen.getByTestId('template-thumb-vivo-template01')).toBeTruthy();
  });

  it('a falha de um card não derruba os outros três', () => {
    abreWizard();
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

  it('em 9:16 não há preview daquela forma — o card abre já na miniatura viva', () => {
    // Os assets são 4:5. Enfiar um 4:5 na caixa 9:16 deformaria ou cortaria;
    // a miniatura viva é fiel por construção em qualquer formato.
    render(<CreateWizard onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Stories'));
    fireEvent.click(screen.getByText('Continuar'));

    for (const { style } of ESPERADO) {
      expect(screen.queryByTestId(`template-preview-${style}`)).toBeNull();
      expect(screen.getByTestId(`template-thumb-vivo-${style}`)).toBeTruthy();
    }
  });
});

describe('seleção e acessibilidade continuam de pé', () => {
  it.each(ESPERADO)('$label é selecionável por clique', ({ label }) => {
    abreWizard();
    fireEvent.click(cardDe(label));
    expect(cardDe(label).getAttribute('aria-pressed')).toBe('true');
  });

  it('escolher um template desmarca o anterior — só um fica pressionado', () => {
    abreWizard();
    fireEvent.click(cardDe('Radar'));
    const pressionados = ESPERADO.filter(
      ({ label }) => cardDe(label).getAttribute('aria-pressed') === 'true',
    );
    expect(pressionados.map((p) => p.label)).toEqual(['Radar']);
  });

  it.each(ESPERADO)('$label é selecionável por TECLADO', ({ label }) => {
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
    for (const { label } of ESPERADO) {
      const card = cardDe(label);
      expect(card.hasAttribute('disabled')).toBe(false);
      expect(card.getAttribute('tabindex')).not.toBe('-1');
    }
  });

  it('a imagem é DECORATIVA — o leitor de tela não anuncia o template 2x', () => {
    // O nome ("Manifesto") e a linha de apoio já são texto dentro do mesmo
    // botão. alt descritivo faria o leitor repetir o mesmo nome logo em
    // seguida, então o alt é vazio de propósito.
    abreWizard();
    for (const { style } of ESPERADO) {
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
