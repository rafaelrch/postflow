// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEditorStore } from '@/hooks/useEditorStore';
import { TEMPLATE_01_DEFAULT_CORNERS } from '@/lib/templates/template-01';
import {
  type CornersConfig,
  DEFAULT_CORNERS,
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_SLIDE,
  type Slide,
  type SlideStyle,
} from '@/types';

/**
 * O AVISO ANTES DE O CANTO DE FÁBRICA VAZAR.
 *
 * Manifesto e Radar nascem com os cantos escritos 'LOREM IPSUM' e
 * '@LOREMIPSUM'. Não é preciso gatilho nenhum: é o estado padrão do deck. Um
 * assinante que não repare baixa o PNG com latim falso e publica assim no
 * Instagram dele.
 *
 * Estes testes travam o COMPORTAMENTO do guarda, não a aparência do popup:
 * quando ele aparece, quem ele segura, o que ele escreve na store e — o mais
 * importante — que a ação original SEMPRE acontece no fim, por qualquer das
 * três saídas. O aviso é um aviso, nunca um portão.
 */

const mocks = vi.hoisted(() => ({
  downloadSlide: vi.fn(),
  downloadAll: vi.fn(),
  saveNow: vi.fn(async () => {}),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock('@/hooks/useExport', () => ({
  useExport: () => ({
    registerSlideRef: vi.fn(),
    downloadSlide: mocks.downloadSlide,
    downloadAll: mocks.downloadAll,
  }),
}));

vi.mock('@/hooks/useAutoSave', () => ({
  useAutoSave: () => ({ saveNow: mocks.saveNow }),
}));

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

/**
 * A barra e o canvas viram botões nus que só disparam as props que o
 * GeneratorClient passa. É lá que o guarda mora — o desenho dos componentes
 * não tem nada a ver com a regra.
 */
vi.mock('@/components/editor/EditorSidebar', () => ({
  default: ({
    onDownloadSlide,
    onDownloadAll,
  }: {
    onDownloadSlide: () => void;
    onDownloadAll: () => void;
  }) => (
    <div>
      <button data-testid="btn-baixar-slide" onClick={onDownloadSlide}>baixar slide</button>
      <button data-testid="btn-baixar-tudo" onClick={onDownloadAll}>baixar tudo</button>
    </div>
  ),
}));

vi.mock('@/components/editor/SlideCanvas', () => ({
  default: ({ onSchedule, onSave }: { onSchedule: () => void; onSave: () => void }) => (
    <div>
      <button data-testid="btn-agendar" onClick={onSchedule}>agendar</button>
      <button data-testid="btn-salvar" onClick={onSave}>salvar</button>
    </div>
  ),
}));

vi.mock('@/components/editor/HiddenSlides', () => ({ default: () => null }));
vi.mock('@/components/editor/CreateWizard', () => ({ default: () => null }));
vi.mock('@/components/editor/ScheduleModal', () => ({
  default: () => <div data-testid="schedule-modal">agendamento</div>,
}));

import GeneratorClient from '@/app/(app)/generator/GeneratorClient';

const L1 = TEMPLATE_01_DEFAULT_CORNERS['cantos.left'];
const R1 = TEMPLATE_01_DEFAULT_CORNERS['cantos.right'];
/** Texto de fábrica do escopo deck (Atelier/Minimalista). */
const TL = DEFAULT_CORNERS.topLeft.text;
const TR = DEFAULT_CORNERS.topRight.text;

function slide(i: number, extra: Partial<Slide> = {}): Slide {
  return { ...DEFAULT_SLIDE, id: `s${i}`, position: i, ...extra } as Slide;
}

/**
 * Deck no estilo pedido, com a store limpa.
 *
 * `cantos` só interessa aos estilos de escopo deck (Atelier/Minimalista), onde
 * o canto mora em `globalSettings.corners` e não no slide.
 */
function montarDeck(style: SlideStyle, slides: Slide[], cantos: Partial<CornersConfig> = {}) {
  const globalSettings = JSON.parse(
    JSON.stringify(DEFAULT_GLOBAL_SETTINGS),
  ) as typeof DEFAULT_GLOBAL_SETTINGS;
  useEditorStore.setState({
    carouselId: 'deck-1',
    style,
    slides,
    activeSlideIndex: 0,
    saveStatus: 'saved',
    globalSettings: { ...globalSettings, corners: { ...globalSettings.corners, ...cantos } },
    history: [],
    historyIndex: -1,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  montarDeck('template01', [slide(0), slide(1)]);
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------

describe('quando o popup aparece', () => {
  it('deck com canto de fábrica: exportar ABRE o aviso e SEGURA o download', async () => {
    render(<GeneratorClient />);
    fireEvent.click(screen.getByTestId('btn-baixar-slide'));

    expect(screen.getByTestId('corner-placeholder-modal')).toBeTruthy();
    // O ponto do teste: o PNG ainda NÃO foi gerado. Avisar depois de exportar
    // seria avisar depois do vazamento.
    expect(mocks.downloadSlide).not.toHaveBeenCalled();
  });

  it('deck com os cantos já digitados: exporta direto, sem popup', () => {
    montarDeck('template01', [
      slide(0, { templateSlots: { 'cantos.left': 'MARCA', 'cantos.right': '@rafa' } }),
      slide(1, { templateSlots: { 'cantos.left': 'MARCA', 'cantos.right': '@rafa' } }),
    ]);
    render(<GeneratorClient />);
    fireEvent.click(screen.getByTestId('btn-baixar-slide'));

    expect(screen.queryByTestId('corner-placeholder-modal')).toBeNull();
    // Sem popup e sem atraso: quem já arrumou o canto não paga pedágio nenhum.
    expect(mocks.downloadSlide).toHaveBeenCalledTimes(1);
  });

  it('baixar o ZIP do deck inteiro passa pelo mesmo guarda', () => {
    render(<GeneratorClient />);
    fireEvent.click(screen.getByTestId('btn-baixar-tudo'));

    expect(screen.getByTestId('corner-placeholder-modal')).toBeTruthy();
    expect(mocks.downloadAll).not.toHaveBeenCalled();
  });

  it('agendar com canto de fábrica também abre o aviso', () => {
    render(<GeneratorClient />);
    fireEvent.click(screen.getByTestId('btn-agendar'));

    expect(screen.getByTestId('corner-placeholder-modal')).toBeTruthy();
    // O post agendado publica o mesmo PNG: o vazamento é idêntico ao do export.
    expect(screen.queryByTestId('schedule-modal')).toBeNull();
  });

  /**
   * O perfil é o único estilo sem canto: o card dele não desenha
   * `globalSettings.corners` (conferido por grep `corners.topLeft` — só
   * MinimalistSlide e EditorialSlide renderizam). O texto de fábrica está lá no
   * estado, mas não sai em PNG nenhum, então avisar seria pedir ao usuário para
   * arrumar algo que ele não vê.
   */
  it('estilo profile não abre o aviso — o card dele não tem canto', () => {
    montarDeck('profile', [slide(0), slide(1)]);
    render(<GeneratorClient />);
    fireEvent.click(screen.getByTestId('btn-baixar-slide'));

    expect(screen.queryByTestId('corner-placeholder-modal')).toBeNull();
    expect(mocks.downloadSlide).toHaveBeenCalledTimes(1);
  });

  it.each(['editorial', 'minimalist'] as const)(
    'estilo %s ABRE o aviso: o canto de fábrica dele também vai para o PNG',
    (style) => {
      // Decisão do Rafael (22/08): o aviso vale para todos os estilos que
      // desenham canto, não só os templates de spec. Um Atelier criado hoje
      // exporta '@handle' e 'Título do carrossel' escritos no topo.
      montarDeck(style, [slide(0), slide(1)]);
      render(<GeneratorClient />);
      fireEvent.click(screen.getByTestId('btn-baixar-slide'));

      expect(screen.getByTestId('corner-placeholder-modal')).toBeTruthy();
      expect(mocks.downloadSlide).not.toHaveBeenCalled();
    },
  );

  /**
   * DECISÃO D1, e este teste é o guardião dela.
   *
   * Salvar NÃO avisa. O autosave chama saveNow() 2,5s depois de cada edição, e
   * um aviso ali abriria o popup a cada 2,5 segundos enquanto o usuário digita:
   * viraria pedágio, não aviso. Além disso o carrossel salvo é privado do dono
   * (política `carousels_owner`) — o latim só sai da conta pelo PNG exportado
   * ou pelo post agendado.
   */
  it('salvar (manual e autosave) NÃO abre o aviso', async () => {
    render(<GeneratorClient />);

    fireEvent.click(screen.getByTestId('btn-salvar'));
    await waitFor(() => expect(mocks.saveNow).toHaveBeenCalled());
    expect(screen.queryByTestId('corner-placeholder-modal')).toBeNull();

    // E o autosave, que é quem dispararia o pedágio: uma edição qualquer marca
    // 'unsaved' e o efeito salva sozinho 2,5s depois.
    mocks.saveNow.mockClear();
    useEditorStore.getState().updateSlide(0, { title: 'digitando' });
    await waitFor(() => expect(mocks.saveNow).toHaveBeenCalled(), { timeout: 5000 });
    expect(screen.queryByTestId('corner-placeholder-modal')).toBeNull();
  }, 10000);
});

describe('as saídas do popup', () => {
  it('digitar nos dois campos: o texto vai para TODOS os slides e o export segue', async () => {
    render(<GeneratorClient />);
    fireEvent.click(screen.getByTestId('btn-baixar-slide'));

    fireEvent.change(screen.getByTestId('corner-placeholder-input-cantos.left'), {
      target: { value: 'CREATOOLS' },
    });
    fireEvent.change(screen.getByTestId('corner-placeholder-input-cantos.right'), {
      target: { value: '@creatools' },
    });
    fireEvent.click(screen.getByTestId('corner-placeholder-apply'));

    // O canto é a assinatura do carrossel: vale igual nos dois slides.
    for (const s of useEditorStore.getState().slides) {
      expect(s.templateSlots?.['cantos.left']).toBe('CREATOOLS');
      expect(s.templateSlots?.['cantos.right']).toBe('@creatools');
    }

    expect(screen.queryByTestId('corner-placeholder-modal')).toBeNull();
    // Corrigiu, exportou: o usuário não clica em baixar de novo.
    await waitFor(() => expect(mocks.downloadSlide).toHaveBeenCalledTimes(1));
  });

  it('digitar só um campo: o outro slot fica intacto, ainda de fábrica', async () => {
    render(<GeneratorClient />);
    fireEvent.click(screen.getByTestId('btn-baixar-slide'));

    fireEvent.change(screen.getByTestId('corner-placeholder-input-cantos.left'), {
      target: { value: 'CREATOOLS' },
    });
    fireEvent.click(screen.getByTestId('corner-placeholder-apply'));

    for (const s of useEditorStore.getState().slides) {
      expect(s.templateSlots?.['cantos.left']).toBe('CREATOOLS');
      // Campo em branco não é escolha de apagar: o slot continua sem chave, e o
      // aviso volta para ele na próxima exportação.
      expect(s.templateSlots?.['cantos.right']).toBeUndefined();
    }
    await waitFor(() => expect(mocks.downloadSlide).toHaveBeenCalledTimes(1));
  });

  it('desativar: os DOIS slots somem em TODOS os slides, e o export segue', async () => {
    render(<GeneratorClient />);
    fireEvent.click(screen.getByTestId('btn-baixar-slide'));
    // Deck novo: os dois cantos são de fábrica, e os dois somem.
    expect(screen.getByTestId('corner-placeholder-disable').textContent).toContain(
      'Desativar os cantos',
    );
    fireEvent.click(screen.getByTestId('corner-placeholder-disable'));

    for (const s of useEditorStore.getState().slides) {
      expect(s.templateSlotStyles?.['cantos.left']?.visible).toBe(false);
      expect(s.templateSlotStyles?.['cantos.right']?.visible).toBe(false);
    }
    // Por SLOT, nunca pelo interruptor global: só o T1 respeita corners.show,
    // e o Radar continuaria desenhando o cabeçalho.
    expect(useEditorStore.getState().globalSettings.corners.show).toBe(true);

    await waitFor(() => expect(mocks.downloadSlide).toHaveBeenCalledTimes(1));
  });

  it('desativar no Radar mexe nos slots do cabeçalho dele', async () => {
    montarDeck('template02', [slide(0), slide(1)]);
    render(<GeneratorClient />);
    fireEvent.click(screen.getByTestId('btn-baixar-slide'));
    fireEvent.click(screen.getByTestId('corner-placeholder-disable'));

    for (const s of useEditorStore.getState().slides) {
      expect(s.templateSlotStyles?.['header.category']?.visible).toBe(false);
      expect(s.templateSlotStyles?.['header.handle']?.visible).toBe(false);
    }
    await waitFor(() => expect(mocks.downloadSlide).toHaveBeenCalledTimes(1));
  });


  /**
   * DESATIVAR NÃO DESFAZ TRABALHO FEITO.
   *
   * Cenário real: o usuário escreveu a marca dele no canto esquerdo e deixou o
   * direito de fábrica. O popup abre falando só do direito — é o único que
   * ganha campo. Se "desativar" apagasse os dois, o botão teria sumido com a
   * marca que o usuário digitou e que o aviso nem estava questionando.
   */
  it('desativar com só um canto avisado: o canto já escrito fica intacto', async () => {
    montarDeck('template01', [
      slide(0, { templateSlots: { 'cantos.left': 'MARCA' } }),
      slide(1, { templateSlots: { 'cantos.left': 'MARCA' } }),
    ]);
    render(<GeneratorClient />);
    fireEvent.click(screen.getByTestId('btn-baixar-slide'));

    // O rótulo do botão fala de UM canto, porque é só um que ele apaga.
    expect(screen.getByTestId('corner-placeholder-disable').textContent).toContain(
      'Desativar este canto',
    );
    fireEvent.click(screen.getByTestId('corner-placeholder-disable'));

    for (const s of useEditorStore.getState().slides) {
      // O de fábrica some.
      expect(s.templateSlotStyles?.['cantos.right']?.visible).toBe(false);
      // O que o usuário escreveu continua lá, e visível.
      expect(s.templateSlotStyles?.['cantos.left']?.visible).toBeUndefined();
      expect(s.templateSlots?.['cantos.left']).toBe('MARCA');
    }
    await waitFor(() => expect(mocks.downloadSlide).toHaveBeenCalledTimes(1));
  });

  /**
   * DECISÃO D2: fechar adia SÓ aquela ação. Nada é persistido, e o usuário pode
   * mesmo querer exportar com o texto de exemplo — não é papel do aviso
   * bloquear o trabalho dele.
   */
  it('fechar no X: nada é escrito na store e o export acontece assim mesmo', async () => {
    const antes = JSON.stringify(useEditorStore.getState().slides);
    render(<GeneratorClient />);
    fireEvent.click(screen.getByTestId('btn-baixar-slide'));
    fireEvent.click(screen.getByTestId('corner-placeholder-close'));

    expect(JSON.stringify(useEditorStore.getState().slides)).toBe(antes);
    expect(useEditorStore.getState().saveStatus).toBe('saved');
    await waitFor(() => expect(mocks.downloadSlide).toHaveBeenCalledTimes(1));
  });

  it('fechar não persiste nada: na próxima exportação o aviso volta', async () => {
    render(<GeneratorClient />);
    fireEvent.click(screen.getByTestId('btn-baixar-slide'));
    fireEvent.click(screen.getByTestId('corner-placeholder-close'));
    await waitFor(() => expect(mocks.downloadSlide).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('btn-baixar-slide'));
    expect(screen.getByTestId('corner-placeholder-modal')).toBeTruthy();
  });

  it('Esc fecha e segue, igual ao X', async () => {
    render(<GeneratorClient />);
    fireEvent.click(screen.getByTestId('btn-baixar-slide'));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByTestId('corner-placeholder-modal')).toBeNull();
    await waitFor(() => expect(mocks.downloadSlide).toHaveBeenCalledTimes(1));
  });

  it('resolvido no agendar, o modal de agendamento é o que abre depois', async () => {
    render(<GeneratorClient />);
    fireEvent.click(screen.getByTestId('btn-agendar'));
    fireEvent.click(screen.getByTestId('corner-placeholder-disable'));

    await waitFor(() => expect(screen.getByTestId('schedule-modal')).toBeTruthy());
  });

  it('canto já digitado não ganha campo — o popup não convida a apagá-lo', () => {
    montarDeck('template01', [
      slide(0, { templateSlots: { 'cantos.left': 'MARCA' } }),
      slide(1, { templateSlots: { 'cantos.left': 'MARCA' } }),
    ]);
    render(<GeneratorClient />);
    fireEvent.click(screen.getByTestId('btn-baixar-slide'));

    expect(screen.queryByTestId('corner-placeholder-input-cantos.left')).toBeNull();
    const direito = screen.getByTestId('corner-placeholder-input-cantos.right');
    // O placeholder mostra o latim que está indo para o PNG hoje.
    expect(direito.getAttribute('placeholder')).toBe(R1);
    expect(L1).not.toBe(R1);

    // 🔸 O rótulo diz a POSIÇÃO do canto e mais nada. Nunca '(sua marca)' nem
    // '(seu @)': o canto é espaço livre — cabe marca, arroba, nicho, slogan —, e
    // presumir uma marca por usuário foi decisão rejeitada pelo Rafael (o
    // Creatools atende creators E agências). Se alguém 'melhorar' o rótulo de
    // volta para uma promessa de conteúdo, este teste cai.
    expect(screen.getByLabelText('Canto direito')).toBe(direito);
  });
});

/**
 * ESCOPO DECK — o Atelier e o Minimalista guardam o canto UMA VEZ, em
 * `globalSettings.corners`, não por slide. A experiência é a mesma; o que muda
 * é onde as duas saídas do popup escrevem. Estes testes travam justamente isso:
 * um dia alguém unifica as duas famílias no updateSlide e o Atelier volta a
 * exportar '@handle' sem ninguém perceber, porque a store até muda — só que no
 * lugar que o card não lê.
 */
describe('as saídas do popup no escopo deck (Atelier)', () => {
  beforeEach(() => {
    montarDeck('editorial', [slide(0), slide(1)]);
  });

  it('digitar grava em globalSettings.corners e em NENHUM templateSlots', async () => {
    render(<GeneratorClient />);
    fireEvent.click(screen.getByTestId('btn-baixar-slide'));

    fireEvent.change(screen.getByTestId('corner-placeholder-input-topLeft'), {
      target: { value: 'BRANDING & TECNOLOGIA' },
    });
    fireEvent.change(screen.getByTestId('corner-placeholder-input-topRight'), {
      target: { value: '@rafa' },
    });
    fireEvent.click(screen.getByTestId('corner-placeholder-apply'));

    const { corners } = useEditorStore.getState().globalSettings;
    expect(corners.topLeft.text).toBe('BRANDING & TECNOLOGIA');
    expect(corners.topRight.text).toBe('@rafa');
    // Visibilidade e o interruptor geral saem ilesos: digitar não desliga nada.
    expect(corners.topLeft.visible).toBe(true);
    expect(corners.show).toBe(true);

    // 🔴 Nenhum slide foi tocado — o card do Atelier nem olha templateSlots.
    for (const sl of useEditorStore.getState().slides) {
      expect(sl.templateSlots).toBeUndefined();
    }
    await waitFor(() => expect(mocks.downloadSlide).toHaveBeenCalledTimes(1));
  });

  it('digitar só um campo: o outro canto continua de fábrica', async () => {
    render(<GeneratorClient />);
    fireEvent.click(screen.getByTestId('btn-baixar-slide'));

    fireEvent.change(screen.getByTestId('corner-placeholder-input-topLeft'), {
      target: { value: 'BRANDING & TECNOLOGIA' },
    });
    fireEvent.click(screen.getByTestId('corner-placeholder-apply'));

    const { corners } = useEditorStore.getState().globalSettings;
    expect(corners.topLeft.text).toBe('BRANDING & TECNOLOGIA');
    expect(corners.topRight.text).toBe(TR);
    await waitFor(() => expect(mocks.downloadSlide).toHaveBeenCalledTimes(1));
  });

  it('desativar põe visible:false nos dois cantos e NÃO mexe em corners.show', async () => {
    render(<GeneratorClient />);
    fireEvent.click(screen.getByTestId('btn-baixar-slide'));
    fireEvent.click(screen.getByTestId('corner-placeholder-disable'));

    const { corners } = useEditorStore.getState().globalSettings;
    expect(corners.topLeft.visible).toBe(false);
    expect(corners.topRight.visible).toBe(false);
    // O interruptor geral fica de pé: ele é do usuário, e mexer nele apagaria
    // canto que o aviso não estava questionando.
    expect(corners.show).toBe(true);
    // O texto não é apagado — desativar esconde, não reescreve.
    expect(corners.topLeft.text).toBe(TL);
    await waitFor(() => expect(mocks.downloadSlide).toHaveBeenCalledTimes(1));
  });

  it('desativar com só um canto avisado não derruba o que o usuário escreveu', async () => {
    montarDeck('editorial', [slide(0)], {
      topLeft: { text: 'BRANDING & TECNOLOGIA', visible: true },
    });
    render(<GeneratorClient />);
    fireEvent.click(screen.getByTestId('btn-baixar-slide'));

    expect(screen.queryByTestId('corner-placeholder-input-topLeft')).toBeNull();
    expect(screen.getByTestId('corner-placeholder-disable').textContent).toContain(
      'Desativar este canto',
    );
    fireEvent.click(screen.getByTestId('corner-placeholder-disable'));

    const { corners } = useEditorStore.getState().globalSettings;
    expect(corners.topRight.visible).toBe(false);
    // Intacto: visível e com o texto dele.
    expect(corners.topLeft.visible).toBe(true);
    expect(corners.topLeft.text).toBe('BRANDING & TECNOLOGIA');
    await waitFor(() => expect(mocks.downloadSlide).toHaveBeenCalledTimes(1));
  });

  it('fechar no X não escreve nada e o export acontece assim mesmo', async () => {
    const antes = JSON.stringify(useEditorStore.getState().globalSettings.corners);
    render(<GeneratorClient />);
    fireEvent.click(screen.getByTestId('btn-baixar-slide'));
    fireEvent.click(screen.getByTestId('corner-placeholder-close'));

    expect(JSON.stringify(useEditorStore.getState().globalSettings.corners)).toBe(antes);
    await waitFor(() => expect(mocks.downloadSlide).toHaveBeenCalledTimes(1));
  });

  it('agendar no Atelier também passa pelo aviso', async () => {
    render(<GeneratorClient />);
    fireEvent.click(screen.getByTestId('btn-agendar'));
    expect(screen.getByTestId('corner-placeholder-modal')).toBeTruthy();
    expect(screen.queryByTestId('schedule-modal')).toBeNull();

    fireEvent.click(screen.getByTestId('corner-placeholder-disable'));
    await waitFor(() => expect(screen.getByTestId('schedule-modal')).toBeTruthy());
  });

  it('os rótulos são os mesmos, neutros, dos templates de spec', () => {
    render(<GeneratorClient />);
    fireEvent.click(screen.getByTestId('btn-baixar-slide'));

    // Nada de '(seu @)' nem '(título do carrossel)': o canto é espaço livre,
    // e prometer o conteúdo dele foi a correção que o Rafael pediu.
    expect(screen.getByLabelText('Canto esquerdo')).toBeTruthy();
    expect(screen.getByLabelText('Canto direito')).toBeTruthy();
  });
});

describe('escopo deck no Minimalista', () => {
  it('avisa, grava nos corners e exporta', async () => {
    montarDeck('minimalist', [slide(0)]);
    render(<GeneratorClient />);
    fireEvent.click(screen.getByTestId('btn-baixar-slide'));
    expect(screen.getByTestId('corner-placeholder-modal')).toBeTruthy();

    fireEvent.change(screen.getByTestId('corner-placeholder-input-topLeft'), {
      target: { value: 'ESTÚDIO' },
    });
    fireEvent.click(screen.getByTestId('corner-placeholder-apply'));

    expect(useEditorStore.getState().globalSettings.corners.topLeft.text).toBe('ESTÚDIO');
    await waitFor(() => expect(mocks.downloadSlide).toHaveBeenCalledTimes(1));
  });

  it('corners.show === false: não avisa, exporta direto', () => {
    montarDeck('minimalist', [slide(0)], { show: false });
    render(<GeneratorClient />);
    fireEvent.click(screen.getByTestId('btn-baixar-slide'));

    expect(screen.queryByTestId('corner-placeholder-modal')).toBeNull();
    expect(mocks.downloadSlide).toHaveBeenCalledTimes(1);
  });
});
