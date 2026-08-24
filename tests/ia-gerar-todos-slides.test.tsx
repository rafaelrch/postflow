// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import { useEditorStore } from '@/hooks/useEditorStore';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, Slide, SlideStyle } from '@/types';

/**
 * ESCOLHA DE ESCOPO NO PAINEL DE IA — pedido do Rafael.
 *
 * História do controle, porque ela explica o formato de hoje:
 *
 * 1. O lote era um botão SOLTO fora do `AiGenPanel`. Ignorava o prompt e a
 *    referência que o usuário acabara de escrever, e existia só em dois dos
 *    quatro ramos de imagem — nos templates 1 e 2 não havia jeito de gerar o
 *    carrossel inteiro.
 * 2. Virou um segundo botão dentro do painel. Resolveu o prompt, mas eram dois
 *    disparos lado a lado, e o usuário lia os dois para decidir um.
 * 3. Agora é UMA escolha ("Este slide" / "Todos os slides") e UM botão.
 *
 * O que estes testes travam: o escopo escolhido decide QUEM é chamado, e a
 * direção escrita no painel vai junto nos dois casos.
 */

const generateAll = vi.fn();
const generateOne = vi.fn();

vi.mock('@/hooks/useGenerateCarouselImages', async () => {
  const real = await vi.importActual<typeof import('@/hooks/useGenerateCarouselImages')>(
    '@/hooks/useGenerateCarouselImages'
  );
  return {
    ...real,
    useGenerateCarouselImages: () => ({ generateAll, generateOne, generating: false }),
  };
});

vi.mock('@/lib/upload-image', () => ({ uploadImageFile: vi.fn(async () => 'https://x/y.png') }));

vi.mock('react-hot-toast', () => ({
  default: { loading: vi.fn(), success: vi.fn(), error: vi.fn(), custom: vi.fn(), dismiss: vi.fn() },
}));

import EditorSidebar from '@/components/editor/EditorSidebar';
import AiGenPanel from '@/components/editor/sidebar/AiGenPanel';

const N = 6;

function montaDeck(style: SlideStyle, activo = 0) {
  const slides = Array.from({ length: N }, (_, i) => ({
    ...DEFAULT_SLIDE,
    id: `s${i}`,
    position: i,
    title: `Slide ${i + 1}`,
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
    // Sem isto o Editorial trata o slide 0 como capa e o 1..N como internos,
    // que é exatamente a distinção que alguns testes abaixo querem.
    contentLayout: undefined,
  })) as Slide[];

  useEditorStore.setState({
    slides,
    activeSlideIndex: activo,
    style,
    globalSettings: DEFAULT_GLOBAL_SETTINGS,
  });

  return render(<EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />);
}

/** Abre o painel "Imagem" e devolve o bloco dele (sem abrir o painel de IA). */
function abrePainelImagem(): HTMLElement {
  const painel = screen.getByText('Imagem').closest('[data-panel]') as HTMLElement;
  const fechado = within(painel).queryAllByRole('button', { expanded: false });
  if (fechado.length > 0) fireEvent.click(fechado[0]);
  return painel;
}

/** Abre o painel "Imagem" e, dentro dele, o painel de IA. */
function abrePainelDeIa(): HTMLElement {
  const painel = abrePainelImagem();
  fireEvent.click(within(painel).getByText(/Gerar imagem com IA/));
  return painel;
}

beforeEach(() => {
  generateAll.mockClear();
  generateOne.mockClear();
  useEditorStore.setState({ slides: [], activeSlideIndex: 0 });
});

afterEach(cleanup);

describe('AiGenPanel — seletor de escopo', () => {
  /** Quatro slides no lote — a contagem do rótulo sai daqui, não de um número solto. */
  const QUATRO = [
    { index: 0, text: 'Capa' },
    { index: 1, text: 'Segundo' },
    { index: 2, text: 'Terceiro' },
    { index: 3, text: 'Quarto' },
  ];

  function abre(props: Partial<React.ComponentProps<typeof AiGenPanel>> = {}) {
    const r = render(
      <AiGenPanel
        buttonLabel="Gerar imagem com IA"
        generating={false}
        slideTitle="t"
        slideDescription="d"
        onGenerate={vi.fn()}
        {...props}
      />
    );
    fireEvent.click(screen.getByText(/Gerar imagem com IA/));
    return r;
  }

  it('sem `onGenerateAll` o seletor NÃO aparece e só existe "Gerar"', () => {
    abre();
    expect(screen.queryByText('Este slide')).toBeNull();
    expect(screen.queryByText('Deste em diante')).toBeNull();
    expect(screen.getByText('Gerar')).toBeTruthy();
  });

  it('o padrão é "este slide": o botão dispara `onGenerate`', () => {
    const onGenerate = vi.fn();
    const onGenerateAll = vi.fn();
    abre({ onGenerate, onGenerateAll, batchContents: QUATRO });

    expect(screen.getByText('Este slide').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByText('Gerar'));

    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(onGenerateAll).not.toHaveBeenCalled();
  });

  it('escolher "deste em diante" troca o alvo do disparo e o rótulo do botão', () => {
    const onGenerate = vi.fn();
    const onGenerateAll = vi.fn();
    abre({ onGenerate, onGenerateAll, batchContents: QUATRO });

    fireEvent.click(screen.getByText('Deste em diante'));
    fireEvent.click(screen.getByText('Gerar nos 4 slides restantes'));

    expect(onGenerateAll).toHaveBeenCalledTimes(1);
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('a direção escrita no painel vai junto nos DOIS escopos', () => {
    // É o motivo de o lote ter vindo para dentro do painel.
    const onGenerate = vi.fn();
    const onGenerateAll = vi.fn();
    abre({ onGenerate, onGenerateAll, batchContents: QUATRO });

    fireEvent.change(screen.getByPlaceholderText(/Descreva a imagem/), {
      target: { value: 'foto em preto e branco' },
    });
    const esperado = { userPrompt: 'foto em preto e branco', referenceImageUrl: undefined };

    fireEvent.click(screen.getByText('Gerar'));
    expect(onGenerate).toHaveBeenCalledWith(esperado);

    fireEvent.click(screen.getByText('Deste em diante'));
    fireEvent.click(screen.getByText('Gerar nos 4 slides restantes'));
    expect(onGenerateAll).toHaveBeenCalledWith(esperado);
  });
});

describe('EditorSidebar — escopo nos ramos de imagem', () => {
  const CASOS: Array<[SlideStyle, 'background' | 'content']> = [
    ['template02', 'background'],
    ['template01', 'background'],
    ['profile', 'background'],
    ['minimalist', 'content'],
  ];

  for (const [style, target] of CASOS) {
    it(`${style}: escolher "deste em diante" chama generateAll a partir do slide ativo`, () => {
      montaDeck(style);
      const painel = abrePainelDeIa();

      fireEvent.change(within(painel).getByPlaceholderText(/Descreva a imagem/), {
        target: { value: 'aquarela' },
      });
      fireEvent.click(within(painel).getByText('Deste em diante'));
      // O Manifesto (template01) tem 6 slides mas o modelo 6 não tem imagem no
      // desenho, então o lote dele é 5 — ver o teste dedicado mais abaixo.
      const alvos = style === 'template01' ? N - 1 : N;
      fireEvent.click(within(painel).getByText(new RegExp(`Gerar nos ${alvos} slides restantes`)));

      // O 0 é o slide ativo: o lote começa nele, não no início do deck.
      expect(generateAll).toHaveBeenCalledWith(target, 0, {
        userPrompt: 'aquarela',
        referenceImageUrl: undefined,
      });
    });

    it(`${style}: não sobrou nenhum botão de lote fora do painel de IA`, () => {
      // Os dois caminhos não podem coexistir — o de fora ignorava o prompt.
      montaDeck(style);
      abrePainelImagem();

      expect(screen.queryByText(/Gerar para todos os/)).toBeNull();
      expect(screen.queryByText(/Gerar nos/)).toBeNull();
      expect(screen.queryByText('Deste em diante')).toBeNull();
    });
  }
});

describe('Editorial — a geração sai de "Fundo do slide"', () => {
  it('a CAPA agora tem o painel "Imagem", com a geração dentro dele', () => {
    // Antes panels.ts escondia o painel na capa (`when: !isEditorialCover`) e o
    // AiGenPanel dela morava dentro de "Fundo do slide".
    montaDeck('editorial', 0);
    const painel = abrePainelDeIa();
    expect(within(painel).getByText('Gerar')).toBeTruthy();
  });

  it('"Fundo do slide" da capa NÃO tem mais geração por IA', () => {
    montaDeck('editorial', 0);
    const fundo = screen.getByText('Fundo do slide').closest('[data-panel]') as HTMLElement;
    const fechado = within(fundo).queryAllByRole('button', { expanded: false });
    if (fechado.length > 0) fireEvent.click(fechado[0]);

    expect(within(fundo).queryByText(/Gerar imagem com IA/)).toBeNull();
  });

  it('a capa gera só a si mesma: nada de lote', () => {
    // No Editorial só a capa usa imagem de FUNDO. Um lote em 'background'
    // gravaria imagem invisível nos internos, onde ela vai no card.
    montaDeck('editorial', 0);
    const painel = abrePainelDeIa();

    expect(within(painel).queryByText('Deste em diante')).toBeNull();
    fireEvent.click(within(painel).getByText('Gerar'));

    expect(generateOne).toHaveBeenCalledWith(0, 'background', expect.anything());
    expect(generateAll).not.toHaveBeenCalled();
  });

  it('nos internos o lote continua existindo, em conteúdo', () => {
    montaDeck('editorial', 1);
    const painel = abrePainelDeIa();

    fireEvent.click(within(painel).getByText('Deste em diante'));
    fireEvent.click(within(painel).getByText(/Gerar nos \d+ slides restantes/));

    expect(generateAll).toHaveBeenCalledWith('content', 1, expect.anything());
  });
});

/**
 * O CAMPO "CONTEÚDO DO SLIDE" MENTIA NO LOTE — achado do Rafael testando.
 *
 * O campo readonly mostrava o texto do slide ATIVO nos dois escopos. No modo
 * "todos os slides" isso dava a entender que aquele texto geraria as N imagens,
 * quando o worker do `generateAll` sempre mandou `title`/`description` do
 * PRÓPRIO slide em cada iteração — só o prompt e a referência são comuns ao
 * lote. A geração estava certa; a tela é que mentia.
 */
describe('o campo de conteúdo acompanha o escopo', () => {
  it('"este slide": rótulo e texto do slide ativo, como sempre foi', () => {
    montaDeck('minimalist', 2);
    const painel = abrePainelDeIa();

    expect(within(painel).getByText('Conteúdo do slide')).toBeTruthy();
    expect(within(painel).queryByText('Conteúdo de cada slide')).toBeNull();
    const campo = within(painel).getAllByRole('textbox').find(
      (el) => (el as HTMLTextAreaElement).readOnly
    ) as HTMLTextAreaElement;
    expect(campo.value).toContain('Slide 3');
  });

  it('"deste em diante": rótulo muda e o campo lista só os slides do lote', () => {
    montaDeck('minimalist', 2);
    const painel = abrePainelDeIa();
    fireEvent.click(within(painel).getByText('Deste em diante'));

    expect(within(painel).getByText('Conteúdo de cada slide')).toBeTruthy();
    const campo = within(painel).getAllByRole('textbox').find(
      (el) => (el as HTMLTextAreaElement).readOnly
    ) as HTMLTextAreaElement;

    // Uma linha por slide do lote, na ordem do deck, começando no ATIVO — o
    // slide 3 aqui. Os anteriores não entram: o lote é deste em diante.
    expect(campo.value.split('\n')).toEqual([
      '3. Slide 3', '4. Slide 4', '5. Slide 5', '6. Slide 6',
    ]);
    expect(campo.readOnly).toBe(true);
  });

  it('a linha de apoio explica que cada imagem usa o texto do próprio slide', () => {
    montaDeck('minimalist', 0);
    const painel = abrePainelDeIa();

    expect(within(painel).queryByText(/Cada imagem usa o texto do próprio slide/)).toBeNull();
    fireEvent.click(within(painel).getByText('Deste em diante'));
    expect(within(painel).getByText(/Cada imagem usa o texto do próprio slide/)).toBeTruthy();
  });

  it('EDITORIAL em conteúdo: a lista pula a capa, igual o lote pula', () => {
    // É o caso que revela se a lista e o lote são a mesma conta ou duas.
    montaDeck('editorial', 1);
    const painel = abrePainelDeIa();
    fireEvent.click(within(painel).getByText('Deste em diante'));

    const campo = within(painel).getAllByRole('textbox').find(
      (el) => (el as HTMLTextAreaElement).readOnly
    ) as HTMLTextAreaElement;
    const linhas = campo.value.split('\n');

    expect(linhas).not.toContain('1. Slide 1');
    expect(linhas[0]).toBe('2. Slide 2');
    // E o rótulo do botão conta a mesma coisa que a lista mostra.
    expect(linhas).toHaveLength(N - 1);
    expect(within(painel).getByText(`Gerar nos ${N - 1} slides restantes`)).toBeTruthy();
  });

  it('título longo é cortado com reticências', () => {
    useEditorStore.setState({
      slides: [
        { ...DEFAULT_SLIDE, id: 'a', position: 0, title: 'x'.repeat(120) },
        { ...DEFAULT_SLIDE, id: 'b', position: 1, title: 'curto' },
      ] as Slide[],
      activeSlideIndex: 0,
      style: 'minimalist',
      globalSettings: DEFAULT_GLOBAL_SETTINGS,
    });
    render(<EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />);
    const painel = abrePainelDeIa();
    fireEvent.click(within(painel).getByText('Deste em diante'));

    const campo = within(painel).getAllByRole('textbox').find(
      (el) => (el as HTMLTextAreaElement).readOnly
    ) as HTMLTextAreaElement;
    const primeira = campo.value.split('\n')[0];

    expect(primeira.endsWith('…')).toBe(true);
    expect(primeira.length).toBeLessThan(60);
    expect(campo.value.split('\n')[1]).toBe('2. curto');
  });
});

/**
 * O SEGUNDO ESCOPO É "DESTE EM DIANTE" — rodada 4.
 *
 * O caso concreto do Rafael: Atelier de 5 slides, no slide 4. Antes o botão
 * dizia "Gerar nos 4 slides" (os elegíveis do deck, capa fora); agora tem de
 * dizer 2 — o slide 4 e o 5.
 */
describe('escopo "deste em diante"', () => {
  /** Lê o campo readonly do painel de IA aberto. */
  function listaDoLote(painel: HTMLElement): string[] {
    const campo = within(painel).getAllByRole('textbox').find(
      (el) => (el as HTMLTextAreaElement).readOnly
    ) as HTMLTextAreaElement;
    return campo.value.split('\n');
  }

  it('o caso do Rafael: no slide 4 de 5, o lote é 4 e 5', () => {
    montaDeck('minimalist', 3);
    const painel = abrePainelDeIa();
    fireEvent.click(within(painel).getByText('Deste em diante'));

    expect(listaDoLote(painel)).toEqual(['4. Slide 4', '5. Slide 5', '6. Slide 6']);
    expect(within(painel).getByText('Gerar nos 3 slides restantes')).toBeTruthy();
  });

  it('o rótulo do escopo é "Deste em diante", não "Todos os slides"', () => {
    montaDeck('minimalist', 0);
    const painel = abrePainelDeIa();

    expect(within(painel).getByText('Deste em diante')).toBeTruthy();
    expect(within(painel).queryByText('Todos os slides')).toBeNull();
  });

  it('último slide: lote de um, e o rótulo vai para o SINGULAR', () => {
    // "Gerar no 1 slides restantes" seria o texto que ninguém revisou.
    montaDeck('minimalist', N - 1);
    const painel = abrePainelDeIa();
    fireEvent.click(within(painel).getByText('Deste em diante'));

    expect(listaDoLote(painel)).toEqual([`${N}. Slide ${N}`]);
    expect(within(painel).getByText('Gerar no slide restante')).toBeTruthy();
    expect(within(painel).queryByText(/1 slides/)).toBeNull();
  });

  it('no último slide o seletor CONTINUA aparecendo', () => {
    // Os dois escopos fazem a mesma coisa aqui, mas sumir com o controle faria
    // a barra mudar de forma no último slide sem explicação.
    montaDeck('minimalist', N - 1);
    const painel = abrePainelDeIa();

    expect(within(painel).getByText('Este slide')).toBeTruthy();
    expect(within(painel).getByText('Deste em diante')).toBeTruthy();
  });

  it('o lote dispara a partir do slide ativo, não do começo do deck', () => {
    montaDeck('minimalist', 3);
    const painel = abrePainelDeIa();
    fireEvent.click(within(painel).getByText('Deste em diante'));
    fireEvent.click(within(painel).getByText(/Gerar nos \d+ slides restantes/));

    expect(generateAll).toHaveBeenCalledWith('content', 3, expect.anything());
  });

  it('Editorial: partindo de um interno, a lista começa nele', () => {
    // A capa do Editorial não tem lote nenhum (ela gera só a si mesma, ver
    // acima), então o caso de "em diante" no Editorial começa nos internos.
    montaDeck('editorial', 3);
    const painel = abrePainelDeIa();
    fireEvent.click(within(painel).getByText('Deste em diante'));

    expect(listaDoLote(painel)).toEqual(['4. Slide 4', '5. Slide 5', '6. Slide 6']);
    expect(within(painel).getByText('Gerar nos 3 slides restantes')).toBeTruthy();
  });
});

/**
 * O SLIDE SEM IMAGEM SOME DO LOTE NA TELA TAMBÉM — bug nosso.
 *
 * O contrato da rodada 3: a lista que o usuário lê e o número no botão têm de
 * bater exatamente com o que vai ser gerado e COBRADO. O modelo 6 do Manifesto
 * não tem imagem no desenho, então não pode aparecer em nenhum dos dois.
 */
describe('Manifesto: o modelo 6 não entra no lote', () => {
  it('o botão conta 5, não os 6 slides do deck', () => {
    montaDeck('template01');
    const painel = abrePainelDeIa();
    fireEvent.click(within(painel).getByText('Deste em diante'));

    expect(within(painel).getByText('Gerar nos 5 slides restantes')).toBeTruthy();
    expect(within(painel).queryByText('Gerar nos 6 slides restantes')).toBeNull();
  });

  it('a lista do painel não mostra o slide 6', () => {
    montaDeck('template01');
    const painel = abrePainelDeIa();
    fireEvent.click(within(painel).getByText('Deste em diante'));

    const campo = within(painel).getAllByRole('textbox').find(
      (el) => (el as HTMLTextAreaElement).readOnly
    ) as HTMLTextAreaElement;
    const linhas = campo.value.split('\n');

    expect(linhas).toEqual(['1. Slide 1', '2. Slide 2', '3. Slide 3', '4. Slide 4', '5. Slide 5']);
    expect(campo.value).not.toContain('6. Slide 6');
  });

  it('no PRÓPRIO slide 6 o painel de imagem nem existe', () => {
    // `panels.ts` já escondia o painel ali; o que faltava era o lote respeitar
    // a mesma verdade.
    montaDeck('template01', 5);
    expect(screen.queryByText('Imagem')).toBeNull();
  });
});

/**
 * OS TRÊS CHECKBOXES SAÍRAM — correção de rumo pedida pelo Rafael.
 *
 * A primeira versão das fatias 2 e 3 pôs três switches aqui, um por modo. Ele
 * olhou a tela e disse: "isso aqui não tem que ter esse checkbox. O usuário só
 * tem que conseguir gerar."
 *
 * O recurso não foi embora com eles: as direções de marca, de figura pública e
 * de identidade continuam no prompt, escritas na forma CONDICIONAL que o
 * material já usava. Quem avalia a condição é o modelo, que recebe a copy
 * inteira e, quando há referência, a própria foto. O que sumiu foi o clique.
 *
 * Este describe trava o painel de VOLTA no que ele era: referência, prompt,
 * escopo e gerar. Nada mais.
 */
describe('AiGenPanel — sem controles de modo', () => {
  afterEach(cleanup);

  function abrePainel(props: Partial<React.ComponentProps<typeof AiGenPanel>> = {}) {
    const r = render(
      <AiGenPanel
        buttonLabel="Gerar imagem com IA"
        generating={false}
        slideTitle="t"
        slideDescription="d"
        onGenerate={vi.fn()}
        {...props}
      />
    );
    fireEvent.click(screen.getByText(/Gerar imagem com IA/));
    return r;
  }

  it('🔴 não existe switch nenhum no painel', () => {
    abrePainel();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
  });

  it('🔴 nem os rótulos dos três modos que existiram', () => {
    abrePainel();
    for (const morto of [/preservar identidade/i, /marcas citadas/i, /pessoas p[úu]blicas/i]) {
      expect(screen.queryByText(morto)).toBeNull();
    }
  });

  it('o painel continua sendo referência + prompt + gerar', () => {
    abrePainel();
    expect(screen.getByText(/Imagem de refer[êe]ncia \(opcional\)/)).toBeTruthy();
    expect(screen.getByText('Prompt')).toBeTruthy();
    expect(screen.getByText('Gerar')).toBeTruthy();
  });

  it('🔴 a chamada carrega SÓ prompt e referência', () => {
    // Se algum campo de modo voltar a vazar daqui, este teste pega.
    const onGenerate = vi.fn();
    abrePainel({ onGenerate });
    fireEvent.click(screen.getByText('Gerar'));
    expect(onGenerate).toHaveBeenCalledWith({
      userPrompt: undefined,
      referenceImageUrl: undefined,
    });
  });

  it('com prompt escrito, a chamada continua sendo só esses dois campos', () => {
    const onGenerate = vi.fn();
    abrePainel({ onGenerate });
    fireEvent.change(screen.getByPlaceholderText(/Descreva a imagem/), {
      target: { value: 'luz de fim de tarde' },
    });
    fireEvent.click(screen.getByText('Gerar'));
    expect(onGenerate).toHaveBeenCalledWith({
      userPrompt: 'luz de fim de tarde',
      referenceImageUrl: undefined,
    });
  });
});
