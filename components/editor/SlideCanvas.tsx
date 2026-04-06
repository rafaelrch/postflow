'use client';

import { useRef } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Trash2, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEditorStore } from '@/hooks/useEditorStore';
import SlidePreview from './SlidePreview';

// Thumbnail dimensions — fully visible, compact
const THUMB_SCALE = 0.11;
const THUMB_W = Math.round(1080 * THUMB_SCALE); // 119px
const THUMB_H = Math.round(1350 * THUMB_SCALE); // 149px
const CAROUSEL_H = THUMB_H + 48;               // room for number label + padding

interface SlideCanvasProps {
  generatingProgress?: { current: number; total: number; label: string } | null;
}

export default function SlideCanvas({ generatingProgress }: SlideCanvasProps) {
  const {
    slides, activeSlideIndex, style, globalSettings,
    setActiveSlideIndex, reorderSlides, removeSlide, addSlide,
    updateGlobalSettings, updateActiveSlide,
  } = useEditorStore();

  const scrollRef = useRef<HTMLDivElement>(null);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    reorderSlides(result.source.index, result.destination.index);
  };

  const handleUpdateProfile = style === 'profile'
    ? (updates: { name?: string; handle?: string }) => {
        updateGlobalSettings({
          profileBadge: { ...globalSettings.profileBadge, ...updates },
        });
      }
    : undefined;

  const handleUpdateText = (updates: { title?: string; description?: string; subtitle?: string }) => {
    updateActiveSlide(updates);
  };

  const handleUpdateTextPosition = style === 'minimalist'
    ? (x: number, y: number) => {
        updateActiveSlide({ textOffset: { x, y } });
      }
    : undefined;

  const goPrev = () => setActiveSlideIndex(Math.max(0, activeSlideIndex - 1));
  const goNext = () => setActiveSlideIndex(Math.min(slides.length - 1, activeSlideIndex + 1));

  // Scroll active thumbnail into view when it changes
  const scrollToThumb = (el: HTMLDivElement | null) => {
    if (!el || !scrollRef.current) return;
    const container = scrollRef.current;
    const thumbLeft = el.offsetLeft;
    const thumbRight = thumbLeft + el.offsetWidth;
    const visibleLeft = container.scrollLeft;
    const visibleRight = visibleLeft + container.clientWidth;
    if (thumbLeft < visibleLeft) container.scrollLeft = thumbLeft - 16;
    else if (thumbRight > visibleRight) container.scrollLeft = thumbRight - container.clientWidth + 16;
  };

  return (
    <div className="flex-1 bg-[var(--background)] flex flex-col overflow-hidden">
      {/* Top bar */}
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
        </div>
      </div>

      {/* Main slide view */}
      <div className="flex-1 bg-[var(--background)] flex items-center justify-center overflow-hidden p-6">
        {slides.length > 0 && (
          <div className="relative">
            <SlidePreview
              slide={slides[activeSlideIndex]}
              globalSettings={globalSettings}
              style={style}
              slideIndex={activeSlideIndex}
              totalSlides={slides.length}
              scale={0.45}
              isActive={true}
              onClick={() => {}}
              onUpdateProfile={handleUpdateProfile}
              onUpdateText={handleUpdateText}
              onUpdateTextPosition={handleUpdateTextPosition}
            />
          </div>
        )}
      </div>

      {/* Thumbnail carousel */}
      <div
        className="border-t border-black/[0.06] dark:border-white/[0.06] bg-[var(--surface)] flex flex-col"
        style={{ height: CAROUSEL_H }}
      >
        {/* Prev / scroll / Next */}
        <div className="flex items-center gap-2 px-2 flex-1 min-h-0">
          {/* Prev arrow */}
          <button
            onClick={goPrev}
            disabled={activeSlideIndex === 0}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-gray-900/30 dark:text-white/30 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-20"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Scrollable thumbnail strip */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-x-auto overflow-y-hidden"
            style={{ scrollbarWidth: 'none' }}
          >
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="slides" direction="horizontal">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="flex gap-2 py-3 px-1"
                  style={{ minWidth: 'min-content' }}
                >
                  {slides.map((slide, i) => (
                    <Draggable key={slide.id} draggableId={slide.id} index={i}>
                      {(drag, snapshot) => (
                        <div
                          ref={(el) => {
                            drag.innerRef(el);
                            if (i === activeSlideIndex && el) scrollToThumb(el);
                          }}
                          {...drag.draggableProps}
                          {...drag.dragHandleProps}
                          onClick={() => setActiveSlideIndex(i)}
                          className="relative group shrink-0 cursor-pointer select-none"
                          style={{
                            ...drag.draggableProps.style,
                            opacity: snapshot.isDragging ? 0.5 : 1,
                          }}
                        >
                          {/* Slide number badge */}
                          <div
                            className={`absolute -top-1 -left-1 z-10 w-4 h-4 rounded text-[7px] flex items-center justify-center font-bold ${
                              i === activeSlideIndex ? 'bg-blue-500 text-white' : 'bg-black/70 text-white/60'
                            }`}
                          >
                            {i + 1}
                          </div>

                          {/* Delete on hover */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (slides.length > 1) removeSlide(i);
                            }}
                            className="absolute -top-1 -right-1 z-10 w-4 h-4 rounded bg-black/70 text-white/50 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>

                          {/* Thumbnail */}
                          <div
                            className={`rounded-md overflow-hidden transition-all ${
                              i === activeSlideIndex
                                ? 'ring-2 ring-blue-500'
                                : 'ring-1 ring-black/10 dark:ring-white/10 hover:ring-black/30 dark:hover:ring-white/30'
                            }`}
                            style={{ width: THUMB_W, height: THUMB_H }}
                          >
                            <SlidePreview
                              slide={slide}
                              globalSettings={globalSettings}
                              style={style}
                              slideIndex={i}
                              totalSlides={slides.length}
                              scale={THUMB_SCALE}
                              isActive={i === activeSlideIndex}
                              onClick={() => setActiveSlideIndex(i)}
                            />
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}

                  {/* Add slide button */}
                  <button
                    onClick={addSlide}
                    className="flex items-center justify-center border border-dashed border-black/10 dark:border-white/10 hover:border-black/30 dark:hover:border-white/30 transition-colors rounded-md text-gray-900/20 dark:text-white/20 hover:text-gray-900/50 dark:hover:text-white/50 shrink-0 self-center"
                    style={{ width: THUMB_W, height: THUMB_H }}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              )}
            </Droppable>
          </DragDropContext>
          </div>

          {/* Next arrow */}
          <button
            onClick={goNext}
            disabled={activeSlideIndex === slides.length - 1}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-gray-900/30 dark:text-white/30 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-20"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="px-4 py-1.5 border-t border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between">
        <span className="text-[10px] text-gray-900/30 dark:text-white/30 tabular-nums">
          {activeSlideIndex + 1}/{slides.length} slides · 1080 × 1350 px · {style === 'minimalist' ? 'Minimalista' : 'Profile'}
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

        <span className="text-[10px] text-gray-900/20 dark:text-white/20">Arraste para reordenar</span>
      </div>
    </div>
  );
}
