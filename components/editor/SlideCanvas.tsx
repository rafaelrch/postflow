'use client';

import { useEffect, useRef, useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Trash2, Plus, GripVertical, Save, CalendarPlus, Coins, Moon, Sun, CircleCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEditorStore } from '@/hooks/useEditorStore';
import { useCreditsStore } from '@/hooks/useCreditsStore';
import { useTheme } from '@/components/ThemeProvider';
import { getFormat } from '@/lib/formats';
import { fitCard } from '@/lib/canvas-fit';
import SlidePreview from './SlidePreview';
import FormatDropdown from './FormatDropdown';
import Template01ModelPicker from './Template01ModelPicker';
import TemplateModelPicker from './TemplateModelPicker';
import Template02Slide from '@/components/slides/Template02Slide';
import {
  TEMPLATE_02_HEIGHT,
  TEMPLATE_02_MODELS,
  TEMPLATE_02_WIDTH,
  template02ModelOf,
  template02NewSlideSlots,
  template02NextModel,
} from '@/lib/templates/template-02';
import { Slide } from '@/types';

// Margem vertical total (topo + base) reservada em volta dos cards na faixa —
// o card ocupa a altura da área menos isto, e o scale deriva daí (fit-to-height).
// O desenho reserva ~80 (37 em cima, 48,5 embaixo) entre a base da barra
// superior e a régua da barra de status. Os 56 de antes apertavam demais.
const V_MARGIN = 80;
// Teto de largura da faixa. Só entra em janela estreita e alta — a altura é que
// manda no scale. O trilho não tem mais padding lateral: no desenho o primeiro
// card começa na borda da coluna de conteúdo e a faixa sangra na direita.
const H_MARGIN = 24;
// Gap entre cards e passo do badge — fixos, não escalam com a janela.
const CARD_GAP = 18;
/**
 * Onde a coluna de conteúdo começa: 15 de margem + 285 do painel + 34 de
 * respiro. A faixa começa em x=0 (passa por baixo do painel) e recupera esta
 * posição com padding, para o primeiro card continuar exatamente em 334 quando
 * a rolagem está no início.
 */
const CONTENT_LEFT = 334;

/**
 * Terciário — hoje só o "Salvar": transparente, borda fina, tinta cinza em
 * repouso. ("+ Adicionar" e "Deletar" saíram daqui para o grupo de controle do
 * slide, à esquerda.)
 *
 * O cinza em repouso é o do desenho. Ele NÃO quer dizer "morto": o hover leva a
 * tinta a `--ink` e é aí que o botão se anuncia. Desabilitado de verdade
 * (salvamento em curso) some com o hover e marca o cursor — é o que separa os
 * dois estados, já que o mock desenha só um deles.
 */
const TERTIARY_BTN =
  'shrink-0 h-[40px] w-[112px] flex items-center justify-center gap-1.5 rounded-[10px] text-[14px] ' +
  'bg-transparent border border-[var(--studio-line)] text-[var(--studio-ink-disabled)] ' +
  'hover:text-[var(--ink)] hover:border-[var(--studio-line-strong)] transition-colors ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-[var(--studio-ink-disabled)] ' +
  'disabled:hover:border-[var(--studio-line)]';

/** Neutro — "100 créditos" e o toggle: branco, borda fina, tinta cheia. */
const NEUTRAL_BTN =
  'shrink-0 h-[40px] px-4 flex items-center gap-2 rounded-[10px] text-[14px] tabular-nums ' +
  'bg-[var(--studio-surface)] border border-[var(--studio-line)] text-[var(--ink)]';

/**
 * Seta dentro do agrupamento de navegação. Sem borda e sem fundo próprios: o
 * fundo é do agrupamento, e as setas são segmentos dele.
 */
const SEG_BTN =
  'shrink-0 w-[36px] h-full grid place-items-center text-[var(--ink)] ' +
  'hover:bg-[var(--studio-row)] transition-colors ' +
  'disabled:text-[var(--studio-ink-disabled)] disabled:hover:bg-transparent ' +
  'disabled:cursor-not-allowed';

const STYLE_LABEL: Record<string, string> = {
  minimalist: 'Minimalista',
  profile: 'Profile',
  editorial: 'Atelier',
  template01: 'Manifesto',
  template02: 'Radar',
};

interface SlideCanvasProps {
  generatingProgress?: { current: number; total: number; label: string } | null;
  onSave?: () => void;
  onSchedule?: () => void;
  saveStatus?: 'saved' | 'saving' | 'unsaved';
}

export default function SlideCanvas({ generatingProgress, onSave, onSchedule, saveStatus: saveStatusProp }: SlideCanvasProps) {
  const {
    slides, activeSlideIndex, style, globalSettings, saveStatus, lastSavedAt,
    setActiveSlideIndex, reorderSlides, removeSlide, addSlide, setFormat,
    updateGlobalSettings, updateActiveSlide,
  } = useEditorStore();

  // Nos templates de forma fixa, adicionar passa pelo popup de MODELO. Nos
  // outros estilos o slide novo continua genérico — lá a forma é editável e não
  // existe modelo para escolher.
  const [pickingModel, setPickingModel] = useState(false);
  const isTemplate01 = style === 'template01';
  const isTemplate02 = style === 'template02';
  const isSpecTemplate = isTemplate01 || isTemplate02;
  const handleAdd = () => (isSpecTemplate ? setPickingModel(true) : addSlide());

  // O que CONTINUA a alternância do T2: depois da capa vem o modelo 2, e depois
  // de um slide de conteúdo vem o outro. Pedido do Rafael com todas as letras.
  const lastModel = slides.length
    ? template02ModelOf(slides[slides.length - 1], slides.length - 1)
    : 1;
  const suggestedModel = template02NextModel(lastModel);

  // Créditos e tema vinham do trilho global, que não monta mais no editor — a
  // barra superior é dona dos dois agora. `fetch` é idempotente.
  const credits = useCreditsStore((s) => s.balance);
  const fetchCredits = useCreditsStore((s) => s.fetch);
  const { theme, toggleTheme } = useTheme();
  // Saldo indisponível mostra "—" e pronto: o editor não depende dele para
  // funcionar, então a falha não pode virar erro não tratado.
  useEffect(() => { fetchCredits().catch(() => {}); }, [fetchCredits]);

  const previewRef = useRef<HTMLDivElement>(null); // área que mede a altura disponível
  const scrollRef = useRef<HTMLDivElement>(null);  // faixa rolável horizontal
  const [avail, setAvail] = useState({ w: 0, h: 0 });

  const format = getFormat(globalSettings.format);

  // Mede a área disponível e recalcula no resize. Ao trocar de formato, o
  // scale abaixo recomputa sozinho (depende de `avail` + dimensões do formato).
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    // Objeto novo a cada callback tiraria a bail-out do React: o observer
    // dispara a cada mudança de layout da faixa (a barra de rolagem horizontal
    // aparecendo já basta) e o render voltaria a mexer no layout — laço.
    const apply = (w: number, h: number) =>
      setAvail((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    apply(el.clientWidth, el.clientHeight);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) apply(entry.contentRect.width, entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Altura manda; a largura entra só como teto, para o card não escapar da
  // faixa em janela estreita e alta (ver lib/canvas-fit).
  // A faixa mede a largura INTEIRA agora, mas a parte visível começa em 334 —
  // o resto vive embaixo do painel. O teto de largura usa só o que se vê.
  const { scale, cardW, cardH: cardHpx } = fitCard(
    Math.max(0, avail.w - CONTENT_LEFT - H_MARGIN),
    Math.max(0, avail.h - V_MARGIN),
    format
  );

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    reorderSlides(result.source.index, result.destination.index);
  };

  // Edição inline (estilo profile) fica ligada só ao card ATIVO.
  const handleUpdateProfile = style === 'profile'
    ? (updates: { name?: string; handle?: string }) => {
        updateGlobalSettings({ profileBadge: { ...globalSettings.profileBadge, ...updates } });
      }
    : undefined;

  const handleUpdateText = (updates: { title?: string; description?: string; subtitle?: string }) => {
    updateActiveSlide(updates);
  };

  // As setas ←/→ da barra saíram com o redesenho; o atalho de teclado que fazia
  // a mesma coisa continua vivo em GeneratorClient, e o clique no card também.

  // O elemento do card ativo, guardado para o efeito abaixo poder reposicionar
  // a faixa depois — o callback de `ref` só dispara quando o nó muda, e o
  // problema aparece justamente quando ele NÃO muda.
  const activeCardRef = useRef<HTMLElement | null>(null);

  /**
   * Mantém o card ativo inteiro dentro da área visível.
   *
   * 🔴 Depende do TAMANHO do card, não só de qual é o ativo: ao redimensionar a
   * janela o `cardW` muda, todos os cards andam de lugar e o `scrollLeft`
   * continua onde estava — o ativo aparecia cortado pela esquerda. Por isso o
   * efeito observa `cardW` além do índice.
   */
  useEffect(() => {
    const el = activeCardRef.current;
    if (!el) return;

    // Quem posiciona é o navegador, com o layout do instante da chamada.
    // `inline: 'nearest'` não mexe na faixa quando o card já está inteiro
    // visível, e encosta pela borda mais próxima quando não está — inclusive
    // quando o card é mais largo que a área, em janela estreita.
    // `block: 'nearest'` impede que a página role na vertical de brinde.
    const trazerParaVista = () => el.scrollIntoView({ block: 'nearest', inline: 'nearest' });

    // 🔴 Observar o CARD, não só reagir ao `cardW` no efeito. Ao redimensionar
    // a janela, a faixa ainda relayouta DEPOIS que o efeito roda — mesmo num
    // rAF —, e reposicionar antes disso deixava o card ativo fora da área (foi
    // o que apareceu ao passar de 1907 para 1280). O ResizeObserver dispara
    // depois do layout, que é exatamente a hora certa.
    const ro = new ResizeObserver(trazerParaVista);
    ro.observe(el);

    const frame = requestAnimationFrame(trazerParaVista);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [activeSlideIndex, slides.length]);

  const savedTime = lastSavedAt
    ? new Date(lastSavedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;
  const statusText = savedTime
    ? `Salvo às ${savedTime}`
    : saveStatus === 'saving' ? 'Salvando…' : saveStatus === 'unsaved' ? 'Não salvo' : 'Salvo';

  return (
    // Ocupa a largura inteira (a barra lateral flutua por cima) e recupera a
    // coluna de conteúdo com padding. A barra superior NÃO atravessa a tela:
    // ela nasce aqui dentro, já deslocada pelo padding.
    <div
      className="flex-1 bg-[var(--background)] flex flex-col overflow-hidden pr-[21px]"
      style={{ paddingLeft: CONTENT_LEFT }}
    >
      {/* ── Barra superior ──────────────────────────────────────────────────
          Três níveis de hierarquia, e é esse o ponto do desenho:
            terciário  → transparente + borda fina + tinta cinza
            neutro     → branco + borda fina
            principal  → branco + borda preta 2px + sombra dura  ("Agendar")
          As setas ←/→ e o contador "Slide X de Y" saíram: o contador vive na
          barra de status agora, e a navegação continua pelo clique no card e
          pelas setas do teclado (ver GeneratorClient). */}
      {/* 🔴 `relative z-10` não é enfeite: a sombra dura do "Agendar" passa 3px
          abaixo desta linha, e a faixa — irmã seguinte, com fundo OPACO —
          pintava por cima e comia a sombra. Só aparecia inteira no hover, que
          aplica um `translate` e cria contexto de empilhamento. */}
      <div className="shrink-0 relative z-10 flex items-center justify-between pt-[36px] pb-[1px] pr-[26px]">
        <div className="flex items-center gap-[10px]">
          {/* Dropdown de formato — aplica a todos os slides. */}
          <FormatDropdown value={globalSettings.format} onChange={setFormat} />

          {/* ── Controle do SLIDE ativo ────────────────────────────────────
              Vive à esquerda, junto do contexto do documento; a direita
              continua sendo ação de documento. Absorveu as setas soltas, o
              "+ Adicionar" e o "Deletar" da barra da direita. */}
          <div data-testid="slide-control" className="flex items-center gap-[6px]">
            {/* Navegar: setas e contador num agrupamento com fundo próprio.
                As setas chamam a MESMA ação da store que o teclado — a faixa
                segue o card ativo pelo efeito de scroll que já existe. */}
            <div className="h-[40px] flex items-center rounded-[10px] bg-[var(--studio-surface)] border border-[var(--studio-line)] overflow-hidden">
              <button
                onClick={() => setActiveSlideIndex(Math.max(0, activeSlideIndex - 1))}
                disabled={activeSlideIndex === 0}
                title="Slide anterior (←)"
                aria-label="Slide anterior"
                className={SEG_BTN}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span
                data-testid="slide-control-contador"
                className="px-1 text-[14px] tabular-nums whitespace-nowrap text-[var(--ink)]"
              >
                Slide {activeSlideIndex + 1} de {slides.length}
              </span>
              <button
                onClick={() => setActiveSlideIndex(Math.min(slides.length - 1, activeSlideIndex + 1))}
                disabled={activeSlideIndex >= slides.length - 1}
                title="Próximo slide (→)"
                aria-label="Próximo slide"
                className={SEG_BTN}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Preenchido no acento da marca — o token que o produto já tem,
                chapado. `handleAdd` é o mesmo caminho de antes, então nos
                templates de forma fixa (T1/T2) continua abrindo o popup de
                MODELO em vez de criar um slide genérico. */}
            <button
              onClick={handleAdd}
              title="Adicionar slide"
              aria-label="Adicionar slide"
              className="shrink-0 w-[40px] h-[40px] grid place-items-center rounded-[10px] bg-[var(--accent)] text-[var(--paper)] hover:opacity-90 active:opacity-100 transition-opacity"
            >
              <Plus className="w-5 h-5" />
            </button>

            {/* Discreta ao lado. Alcance diferente da lixeira do hover do card:
                aquela exclui o card sob o cursor, esta exclui o slide ATIVO. */}
            <button
              onClick={() => slides.length > 1 && removeSlide(activeSlideIndex)}
              disabled={slides.length <= 1}
              title={slides.length <= 1 ? 'O carrossel precisa de pelo menos um slide' : 'Excluir o slide ativo'}
              aria-label="Excluir slide ativo"
              className="shrink-0 w-[40px] h-[40px] grid place-items-center rounded-[10px] bg-transparent text-[var(--studio-ink-secondary)] hover:text-[var(--danger)] hover:bg-[var(--studio-row)] disabled:text-[var(--studio-ink-disabled)] disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
            >
              <Trash2 className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-[6px]">
          {onSave && (
            <button
              onClick={onSave}
              disabled={saveStatusProp === 'saving'}
              title="Salvar agora (Ctrl+S)"
              className={TERTIARY_BTN}
            >
              <Save className="w-[18px] h-[18px]" />
              Salvar
            </button>
          )}

          <span className={NEUTRAL_BTN} title="Seu saldo de créditos">
            <Coins className="w-[18px] h-[18px]" />
            {credits ?? '—'} créditos
          </span>

          <button
            onClick={toggleTheme}
            aria-label={theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'}
            title={theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'}
            // O único com borda forte no desenho.
            className="shrink-0 w-[40px] h-[40px] grid place-items-center rounded-[10px] bg-[var(--studio-surface)] border border-[var(--studio-line-strong)] text-[var(--ink)] hover:border-[var(--ink)] transition-colors"
          >
            {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </button>

          {onSchedule && (
            <button
              onClick={onSchedule}
              title="Agendar publicação na agenda"
              className="shrink-0 h-[42px] px-4 flex items-center gap-2 rounded-[10px] text-[14px] font-medium bg-[var(--studio-surface)] text-[var(--ink)] border-2 border-[var(--ink)] shadow-[var(--sh-studio)] hover:-translate-y-px active:translate-y-0 active:shadow-[var(--sh-press)] transition-all"
            >
              <CalendarPlus className="w-[18px] h-[18px]" />
              Agendar
            </button>
          )}
        </div>
      </div>

      {/* ── Faixa horizontal com TODOS os slides (fit-to-height) ── */}
      {/* A faixa SANGRA nos DOIS lados: `-mr` desfaz o respiro da direita (o
          próximo card aparece cortado no limite da tela, dica de que rola) e
          `-ml` desfaz o padding da coluna, levando o rolável até x=0 para o
          card deslizar POR BAIXO do painel em vez de ser cortado na borda. */}
      {/* 🔴 `relative z-0` PRENDE o empilhamento da faixa. Sem isso o `z-20` do
          badge e o da alça escapavam para o contexto do pai e disputavam de
          igual para igual com a barra lateral (também z-20), que perde por vir
          antes no DOM — o número do slide aparecia POR CIMA do painel. Com um
          contexto próprio em z-0, nada de dentro da faixa passa por cima da
          barra (z-20) nem da barra superior (z-10). */}
      <div
        ref={previewRef}
        className="relative z-0 flex-1 min-h-0 -mr-[21px] bg-[var(--background)] overflow-hidden"
        style={{ marginLeft: -CONTENT_LEFT }}
      >
        <div
          ref={scrollRef}
          className="h-full overflow-x-auto overflow-y-hidden"
          // 🔴 `scrollPaddingLeft` é o que impede o `scrollIntoView` de parar o
          // card ativo embaixo do painel: para a rolagem, a área "visível"
          // começa em 334, não em 0.
          style={{ scrollbarWidth: 'thin', scrollPaddingLeft: CONTENT_LEFT }}
        >
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="slides" direction="horizontal">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="flex items-center h-full"
                  // O padding devolve a coluna de conteúdo: com a rolagem no
                  // início, o primeiro card fica exatamente em 334.
                  style={{ minWidth: 'min-content', gap: CARD_GAP, paddingLeft: CONTENT_LEFT }}
                >
                  {slides.map((slide, i) => {
                    const isActive = i === activeSlideIndex;
                    return (
                      <Draggable key={slide.id} draggableId={slide.id} index={i}>
                        {(drag, snapshot) => (
                          <div
                            ref={(el) => {
                              drag.innerRef(el);
                              if (isActive) activeCardRef.current = el;
                            }}
                            {...drag.draggableProps}
                            onClick={() => setActiveSlideIndex(i)}
                            className="relative group shrink-0 select-none"
                            style={{
                              ...drag.draggableProps.style,
                              opacity: snapshot.isDragging ? 0.6 : 1,
                            }}
                          >
                            {/* Badge do número: 18×18, raio 5, montado em cima da
                                quina superior esquerda (sobra ~4 para fora). */}
                            <div
                              data-testid={`slide-badge-${i}`}
                              data-active={isActive ? 'true' : 'false'}
                              className="absolute -top-1 -left-1 z-20 w-[18px] h-[18px] rounded-[5px] text-[11px] leading-none font-bold flex items-center justify-center"
                              style={{
                                background: isActive ? 'var(--studio-select)' : 'var(--studio-badge-idle)',
                                color: isActive ? 'var(--studio-select-ink)' : 'var(--studio-badge-idle-ink)',
                              }}
                            >
                              {i + 1}
                            </div>

                            {/* O desenho não mostra alça nem lixeira — mas reordenar
                                e excluir não podem sumir. Ficam no HOVER do card,
                                fora do caminho do badge: alça no topo ao centro,
                                lixeira na quina superior direita. */}
                            <div
                              {...drag.dragHandleProps}
                              onClick={(e) => e.stopPropagation()}
                              title="Arraste para reordenar"
                              className="absolute -top-1 left-1/2 -translate-x-1/2 z-20 h-[18px] px-1.5 rounded-[5px] bg-[var(--ink)] text-[var(--paper)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity flex items-center justify-center cursor-grab active:cursor-grabbing"
                            >
                              <GripVertical className="w-3 h-3" />
                            </div>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (slides.length > 1) removeSlide(i);
                              }}
                              disabled={slides.length <= 1}
                              title="Excluir este slide"
                              aria-label={`Excluir slide ${i + 1}`}
                              // 🔴 O `disabled:` NÃO pode mexer na opacidade base:
                              // variante ganha de `opacity-0`, e o deck de um
                              // slide só passava a exibir a lixeira o tempo todo.
                              // Quem some é o hover; desabilitado só a apaga mais.
                              className="absolute -top-1 -right-1 z-20 w-[18px] h-[18px] rounded-[5px] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--danger)] disabled:hover:bg-[var(--ink)] disabled:cursor-not-allowed opacity-0 group-hover:opacity-100 disabled:group-hover:opacity-40 focus-visible:opacity-100 transition-opacity flex items-center justify-center"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>

                            {/* Card do slide.
                                🔴 O contorno do ativo é OUTLINE, não border: ele
                                cresce 2px para FORA sem empurrar o layout, e o
                                passo de 18 da faixa continua idêntico. */}
                            <div
                              data-testid={`slide-card-${i}`}
                              data-active={isActive ? 'true' : 'false'}
                              // 🔴 Transiciona só a COR do contorno. Com
                              // `transition-all` a largura/altura do card
                              // entravam na animação e eram reanimadas a cada
                              // recálculo do fit: além de deixar o redimensiona-
                              // mento mole, o card ficava PRESO no tamanho
                              // antigo quando a aba não avança animação (medido
                              // 432 de largura com o estilo já dizendo 686).
                              className={`rounded-[5px] overflow-hidden transition-[outline-color] ${
                                isActive
                                  ? 'outline outline-2 outline-[var(--studio-select)]'
                                  : 'outline outline-1 outline-[var(--studio-line)] hover:outline-[var(--studio-line-strong)] cursor-pointer'
                              }`}
                              style={{ width: cardW, height: cardHpx }}
                            >
                              <SlidePreview
                                slide={slide}
                                globalSettings={globalSettings}
                                style={style}
                                slideIndex={i}
                                totalSlides={slides.length}
                                scale={scale}
                                isActive={isActive}
                                onClick={() => setActiveSlideIndex(i)}
                                onUpdateProfile={isActive ? handleUpdateProfile : undefined}
                                onUpdateText={isActive ? handleUpdateText : undefined}
                              />
                            </div>
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}

                  {/* Botão adicionar ao fim da faixa */}
                  <button
                    onClick={handleAdd}
                    className="flex flex-col items-center justify-center gap-1 border border-dashed border-[var(--studio-line)] hover:border-[var(--studio-line-strong)] transition-colors rounded-[5px] text-[var(--studio-ink-secondary)] hover:text-[var(--ink)] shrink-0 mr-[21px]"
                    style={{ width: cardW, height: cardHpx }}
                  >
                    <Plus className="w-6 h-6" />
                    <span className="text-[11px] font-medium">Adicionar</span>
                  </button>
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      </div>

      {pickingModel && isTemplate02 && slides[activeSlideIndex] && (
        <TemplateModelPicker
          models={TEMPLATE_02_MODELS}
          labels={{ 1: 'Capa', 2: 'Texto à esquerda', 3: 'Texto à direita' }}
          suggested={suggestedModel}
          title="Escolha o modelo do slide"
          subtitle="Os 3 modelos do Template 2. Depois da capa, os internos alternam entre os dois — o sugerido é o que continua a alternância."
          canvas={{ width: TEMPLATE_02_WIDTH, height: TEMPLATE_02_HEIGHT }}
          baseSlide={slides[activeSlideIndex] as Slide}
          slotsForModel={(model) => template02NewSlideSlots(model)}
          renderPreview={(slide, model) => (
            <Template02Slide
              slide={slide}
              globalSettings={globalSettings}
              slideIndex={model - 1}
              totalSlides={TEMPLATE_02_MODELS.length}
            />
          )}
          onPick={(patch) => {
            addSlide(patch);
            setPickingModel(false);
          }}
          onClose={() => setPickingModel(false)}
          testIdPrefix="t02-model"
        />
      )}

      {pickingModel && isTemplate01 && slides[activeSlideIndex] && (
        <Template01ModelPicker
          globalSettings={globalSettings}
          baseSlide={slides[activeSlideIndex] as Slide}
          onPick={(patch) => {
            addSlide(patch);
            setPickingModel(false);
          }}
          onClose={() => setPickingModel(false)}
        />
      )}

      {/* ── Barra de status ─────────────────────────────────────────────────
          Quatro campos separados por •. Só o primeiro tem tinta cheia — é o
          único que muda de estado; o resto é metadado. */}
      <div className="shrink-0 h-px bg-[var(--studio-divider)]" />
      <div
        data-testid="studio-status-bar"
        className="shrink-0 flex items-center gap-[18px] pt-[21px] pb-[26px] text-[14px]"
      >
        <CircleCheck className="w-[18px] h-[18px] shrink-0 text-[var(--ink)]" />
        <span data-testid="status-save" className="font-semibold text-[var(--ink)] whitespace-nowrap">
          {statusText}
        </span>
        <span aria-hidden className="text-[var(--studio-ink-status)]">•</span>
        <span data-testid="status-slide" className="text-[var(--studio-ink-status)] tabular-nums whitespace-nowrap">
          Slide {activeSlideIndex + 1}/{slides.length}
        </span>
        <span aria-hidden className="text-[var(--studio-ink-status)]">•</span>
        {/* × de multiplicação, não a letra x. */}
        <span data-testid="status-format" className="text-[var(--studio-ink-status)] tabular-nums whitespace-nowrap">
          {format.width} × {format.height}px
        </span>
        <span aria-hidden className="text-[var(--studio-ink-status)]">•</span>
        <span data-testid="status-template" className="text-[var(--studio-ink-status)] truncate">
          {STYLE_LABEL[style] ?? style}
        </span>

        {generatingProgress && (
          <div className="flex items-center gap-3 flex-1 ml-6 mr-[21px]">
            <span className="text-[12px] text-[var(--studio-ink-status)] whitespace-nowrap">
              {generatingProgress.label}
            </span>
            <div className="flex-1 h-1 rounded-full overflow-hidden bg-[var(--studio-row)]">
              <div
                className="h-full rounded-full bg-[var(--studio-select)] transition-all duration-300"
                style={{ width: `${(generatingProgress.current / generatingProgress.total) * 100}%` }}
              />
            </div>
            <span className="text-[12px] text-[var(--studio-ink-status)] whitespace-nowrap tabular-nums">
              {Math.round((generatingProgress.current / generatingProgress.total) * 100)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
