'use client';

import { useEffect, useRef, useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Trash2, Plus, GripVertical, Save, CalendarPlus } from 'lucide-react';
import { useEditorStore } from '@/hooks/useEditorStore';
import { getFormat } from '@/lib/formats';
import SlidePreview from './SlidePreview';
import FormatDropdown from './FormatDropdown';

// Margem vertical total (topo + base) reservada em volta dos cards na faixa —
// o card ocupa a altura da área menos isto, e o scale deriva daí (fit-to-height).
const V_MARGIN = 56;

const STYLE_LABEL: Record<string, string> = {
  minimalist: 'Minimalista',
  profile: 'Profile',
  editorial: 'Editorial',
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

  const previewRef = useRef<HTMLDivElement>(null); // área que mede a altura disponível
  const scrollRef = useRef<HTMLDivElement>(null);  // faixa rolável horizontal
  const [availH, setAvailH] = useState(0);

  const format = getFormat(globalSettings.format);

  // Mede a altura disponível e recalcula no resize. Ao trocar de formato, o
  // scale abaixo recomputa sozinho (depende de availH + format.height).
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    setAvailH(el.clientHeight);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setAvailH(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit-to-height: card preenche a altura da área; largura segue a proporção.
  const cardH = Math.max(0, availH - V_MARGIN);
  const scale = cardH > 0 ? cardH / format.height : 0.4;
  const cardW = Math.round(format.width * scale);
  const cardHpx = Math.round(cardH);

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

  const goPrev = () => setActiveSlideIndex(Math.max(0, activeSlideIndex - 1));
  const goNext = () => setActiveSlideIndex(Math.min(slides.length - 1, activeSlideIndex + 1));

  // Rola o card ativo para dentro da área visível quando muda.
  const scrollActiveIntoView = (el: HTMLElement | null) => {
    if (!el || !scrollRef.current) return;
    const container = scrollRef.current;
    const left = el.offsetLeft;
    const right = left + el.offsetWidth;
    const visibleLeft = container.scrollLeft;
    const visibleRight = visibleLeft + container.clientWidth;
    if (left < visibleLeft) container.scrollLeft = left - 24;
    else if (right > visibleRight) container.scrollLeft = right - container.clientWidth + 24;
  };

  const savedTime = lastSavedAt
    ? new Date(lastSavedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;
  const statusText = savedTime
    ? `Salvo às ${savedTime}`
    : saveStatus === 'saving' ? 'Salvando…' : saveStatus === 'unsaved' ? 'Não salvo' : 'Salvo';

  return (
    <div className="flex-1 bg-[var(--background)] flex flex-col overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-black/[0.06] dark:border-white/[0.06]">
        <div className="flex items-center gap-3">
          <button
            onClick={goPrev}
            disabled={activeSlideIndex === 0}
            className="text-gray-900/30 dark:text-white/30 hover:text-gray-900 dark:hover:text-white transition-colors text-sm px-2 disabled:opacity-20"
          >
            ←
          </button>
          <span className="text-xs text-gray-900/50 dark:text-white/50 tabular-nums">
            Slide {activeSlideIndex + 1} de {slides.length}
          </span>
          <button
            onClick={goNext}
            disabled={activeSlideIndex === slides.length - 1}
            className="text-gray-900/30 dark:text-white/30 hover:text-gray-900 dark:hover:text-white transition-colors text-sm px-2 disabled:opacity-20"
          >
            →
          </button>

          {/* Dropdown de formato — aplica a todos os slides */}
          <FormatDropdown value={globalSettings.format} onChange={setFormat} />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={addSlide}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-gray-900/40 dark:text-white/40 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors border border-black/10 dark:border-white/10"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar
          </button>
          <button
            onClick={() => slides.length > 1 && removeSlide(activeSlideIndex)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-gray-900/40 dark:text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors border border-black/10 dark:border-white/10"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Deletar
          </button>

          {/* Separador */}
          <div className="w-px h-5 bg-black/10 dark:bg-white/10 mx-0.5" />

          {onSave && (
            <button
              onClick={onSave}
              disabled={saveStatusProp === 'saving'}
              title="Salvar agora (Ctrl+S)"
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-gray-900/60 dark:text-white/60 hover:text-gray-900 dark:hover:text-white bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 transition-colors disabled:opacity-40"
            >
              <Save className="w-3.5 h-3.5" />
              Salvar
            </button>
          )}
          {onSchedule && (
            <button
              onClick={onSchedule}
              title="Agendar publicação na agenda"
              className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold bg-gray-900 dark:bg-white text-white dark:text-black hover:opacity-90 transition-opacity ring-1 ring-black/10 dark:ring-white/10"
            >
              <CalendarPlus className="w-3.5 h-3.5" />
              Agendar
            </button>
          )}
        </div>
      </div>

      {/* ── Faixa horizontal com TODOS os slides (fit-to-height) ── */}
      <div ref={previewRef} className="flex-1 min-h-0 bg-[var(--background)] overflow-hidden">
        <div
          ref={scrollRef}
          className="h-full overflow-x-auto overflow-y-hidden"
          style={{ scrollbarWidth: 'thin' }}
        >
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="slides" direction="horizontal">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="flex items-center h-full gap-6 px-8"
                  style={{ minWidth: 'min-content' }}
                >
                  {slides.map((slide, i) => {
                    const isActive = i === activeSlideIndex;
                    return (
                      <Draggable key={slide.id} draggableId={slide.id} index={i}>
                        {(drag, snapshot) => (
                          <div
                            ref={(el) => {
                              drag.innerRef(el);
                              if (isActive) scrollActiveIntoView(el);
                            }}
                            {...drag.draggableProps}
                            onClick={() => setActiveSlideIndex(i)}
                            className="relative group shrink-0 select-none"
                            style={{
                              ...drag.draggableProps.style,
                              opacity: snapshot.isDragging ? 0.6 : 1,
                            }}
                          >
                            {/* Número do slide */}
                            <div
                              className={`absolute -top-2 -left-2 z-20 w-5 h-5 rounded text-[10px] flex items-center justify-center font-bold ${
                                isActive ? 'bg-blue-500 text-white' : 'bg-black/70 text-white/70'
                              }`}
                            >
                              {i + 1}
                            </div>

                            {/* Alça de arrastar — só ela dispara o reorder, pra não
                                conflitar com a edição inline do card ativo */}
                            <div
                              {...drag.dragHandleProps}
                              onClick={(e) => e.stopPropagation()}
                              title="Arraste para reordenar"
                              className="absolute -top-2 left-1/2 -translate-x-1/2 z-20 w-6 h-5 rounded bg-black/70 text-white/60 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-grab active:cursor-grabbing"
                            >
                              <GripVertical className="w-3 h-3" />
                            </div>

                            {/* Deletar */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (slides.length > 1) removeSlide(i);
                              }}
                              className="absolute -top-2 -right-2 z-20 w-5 h-5 rounded bg-black/70 text-white/60 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>

                            {/* Card do slide */}
                            <div
                              className={`rounded-lg overflow-hidden transition-all ${
                                isActive
                                  ? 'ring-2 ring-blue-500'
                                  : 'ring-1 ring-black/10 dark:ring-white/10 hover:ring-black/30 dark:hover:ring-white/30 cursor-pointer'
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
                    onClick={addSlide}
                    className="flex flex-col items-center justify-center gap-1 border border-dashed border-black/15 dark:border-white/15 hover:border-black/30 dark:hover:border-white/30 transition-colors rounded-lg text-gray-900/25 dark:text-white/25 hover:text-gray-900/50 dark:hover:text-white/50 shrink-0"
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

      {/* ── Status bar ── */}
      <div className="px-4 py-1.5 border-t border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between">
        <span className="text-[10px] text-gray-900/40 dark:text-white/40 tabular-nums">
          {statusText} · Slide {activeSlideIndex + 1}/{slides.length} · {format.width} × {format.height} px · {STYLE_LABEL[style] ?? style}
        </span>

        {generatingProgress && (
          <div className="flex items-center gap-3 flex-1 mx-6">
            <span className="text-[10px] text-gray-900/50 dark:text-white/50 whitespace-nowrap">{generatingProgress.label}</span>
            <div className="flex-1 h-1 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300 rounded-full"
                style={{ width: `${(generatingProgress.current / generatingProgress.total) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-gray-900/50 dark:text-white/50 whitespace-nowrap">
              {Math.round((generatingProgress.current / generatingProgress.total) * 100)}%
            </span>
          </div>
        )}

        <span className="text-[10px] text-gray-900/20 dark:text-white/20">Arraste a alça para reordenar</span>
      </div>
    </div>
  );
}
