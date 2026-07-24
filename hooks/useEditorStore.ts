'use client';

import { create } from 'zustand';
import {
  Slide,
  GlobalSettings,
  DEFAULT_GLOBAL_SETTINGS,
  SlideStyle,
  SlideFormat,
} from '@/types';
import { createEmptySlide, createDeterministicSlide, generateId } from '@/lib/utils';

interface HistoryEntry {
  slides: Slide[];
}

interface EditorState {
  carouselId: string | null;
  carouselTitle: string;
  style: SlideStyle;
  slides: Slide[];
  activeSlideIndex: number;
  globalSettings: GlobalSettings;
  saveStatus: 'saved' | 'saving' | 'unsaved';
  // Momento do último save concluído (epoch ms). null => nunca salvou nesta sessão.
  lastSavedAt: number | null;
  history: HistoryEntry[];
  historyIndex: number;
  caption: string;
  hashtags: string[];

  setCarouselId: (id: string) => void;
  setCarouselTitle: (title: string) => void;
  setStyle: (style: SlideStyle) => void;
  setSlides: (slides: Slide[]) => void;
  setActiveSlideIndex: (index: number) => void;
  setSaveStatus: (status: 'saved' | 'saving' | 'unsaved') => void;
  setCaption: (caption: string) => void;
  setHashtags: (hashtags: string[]) => void;

  addSlide: () => void;
  removeSlide: (index: number) => void;
  duplicateSlide: (index: number) => void;
  reorderSlides: (fromIndex: number, toIndex: number) => void;

  updateSlide: (index: number, updates: Partial<Slide>) => void;
  updateActiveSlide: (updates: Partial<Slide>) => void;

  updateGlobalSettings: (updates: Partial<GlobalSettings>) => void;
  updateCornersConfig: (updates: Partial<GlobalSettings['corners']>) => void;
  setFormat: (format: SlideFormat) => void;

  pushHistory: () => void;
  undo: () => void;

  applyLayoutToNext: () => void;

  resetEditor: () => void;
  loadCarousel: (data: {
    id: string | null;
    title: string;
    style: SlideStyle;
    slides: Slide[];
    globalSettings: GlobalSettings;
    caption?: string;
    hashtags?: string[];
  }) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  carouselId: null,
  carouselTitle: 'Novo Carrossel',
  style: 'minimalist',
  slides: [createDeterministicSlide(0)],
  activeSlideIndex: 0,
  globalSettings: JSON.parse(JSON.stringify(DEFAULT_GLOBAL_SETTINGS)),
  saveStatus: 'saved',
  lastSavedAt: null,
  history: [],
  historyIndex: -1,
  caption: '',
  hashtags: [],

  setCarouselId: (id) => set({ carouselId: id }),
  setCarouselTitle: (title) => set({ carouselTitle: title }),
  setStyle: (style) => set({ style }),
  setSlides: (slides) => set({ slides }),
  setActiveSlideIndex: (index) => set({ activeSlideIndex: index }),
  // Ao concluir um save, registra o horário; demais estados não mexem no relógio.
  setSaveStatus: (status) =>
    set(status === 'saved' ? { saveStatus: status, lastSavedAt: Date.now() } : { saveStatus: status }),
  setCaption: (caption) => set({ caption }),
  setHashtags: (hashtags) => set({ hashtags }),

  addSlide: () =>
    set((s) => {
      const newSlide = createEmptySlide(s.slides.length);
      return {
        slides: [...s.slides, newSlide],
        activeSlideIndex: s.slides.length,
        saveStatus: 'unsaved' as const,
      };
    }),

  removeSlide: (index) =>
    set((s) => {
      if (s.slides.length <= 1) return s;
      const newSlides = s.slides.filter((_, i) => i !== index).map((sl, i) => ({ ...sl, position: i }));
      return {
        slides: newSlides,
        activeSlideIndex: Math.min(s.activeSlideIndex, newSlides.length - 1),
        saveStatus: 'unsaved' as const,
      };
    }),

  duplicateSlide: (index) =>
    set((s) => {
      const original = s.slides[index];
      const copy = { ...original, id: generateId(), position: index + 1 };
      const newSlides = [
        ...s.slides.slice(0, index + 1),
        copy,
        ...s.slides.slice(index + 1),
      ].map((sl, i) => ({ ...sl, position: i }));
      return { slides: newSlides, activeSlideIndex: index + 1, saveStatus: 'unsaved' as const };
    }),

  reorderSlides: (fromIndex, toIndex) =>
    set((s) => {
      const newSlides = [...s.slides];
      const [removed] = newSlides.splice(fromIndex, 1);
      newSlides.splice(toIndex, 0, removed);
      return {
        slides: newSlides.map((sl, i) => ({ ...sl, position: i })),
        activeSlideIndex: toIndex,
        saveStatus: 'unsaved' as const,
      };
    }),

  updateSlide: (index, updates) =>
    set((s) => ({
      slides: s.slides.map((sl, i) => (i === index ? { ...sl, ...updates } : sl)),
      saveStatus: 'unsaved' as const,
    })),

  updateActiveSlide: (updates) =>
    set((s) => ({
      slides: s.slides.map((sl, i) =>
        i === s.activeSlideIndex ? { ...sl, ...updates } : sl
      ),
      saveStatus: 'unsaved' as const,
    })),

  updateGlobalSettings: (updates) =>
    set((s) => ({
      globalSettings: { ...s.globalSettings, ...updates },
      saveStatus: 'unsaved' as const,
    })),

  updateCornersConfig: (updates) =>
    set((s) => ({
      globalSettings: {
        ...s.globalSettings,
        corners: { ...s.globalSettings.corners, ...updates },
      },
      saveStatus: 'unsaved' as const,
    })),

  // O formato ativo vive em globalSettings.format (serializa junto no jsonb).
  setFormat: (format) =>
    set((s) => ({
      globalSettings: { ...s.globalSettings, format },
      saveStatus: 'unsaved' as const,
    })),

  pushHistory: () =>
    set((s) => {
      const entry: HistoryEntry = { slides: JSON.parse(JSON.stringify(s.slides)) };
      const newHistory = [...s.history.slice(0, s.historyIndex + 1), entry].slice(-30);
      return { history: newHistory, historyIndex: newHistory.length - 1 };
    }),

  undo: () =>
    set((s) => {
      if (s.historyIndex <= 0) return s;
      const newIndex = s.historyIndex - 1;
      return {
        slides: JSON.parse(JSON.stringify(s.history[newIndex].slides)),
        historyIndex: newIndex,
        saveStatus: 'unsaved' as const,
      };
    }),

  applyLayoutToNext: () =>
    set((s) => {
      const current = s.slides[s.activeSlideIndex];
      const nextIndex = s.activeSlideIndex + 1;
      if (!s.slides[nextIndex]) return s;
      return {
        slides: s.slides.map((sl, i) =>
          i === nextIndex
            ? { ...sl, fontSize: { ...current.fontSize }, lineHeight: current.lineHeight, textPosition: current.textPosition }
            : sl
        ),
        saveStatus: 'unsaved' as const,
      };
    }),

  resetEditor: () =>
    set({
      carouselId: null,
      carouselTitle: 'Novo Carrossel',
      style: 'minimalist',
      slides: [createDeterministicSlide(0)],
      activeSlideIndex: 0,
      globalSettings: JSON.parse(JSON.stringify(DEFAULT_GLOBAL_SETTINGS)),
      saveStatus: 'saved',
      lastSavedAt: null,
      history: [],
      historyIndex: -1,
      caption: '',
      hashtags: [],
    }),

  loadCarousel: ({ id, title, style, slides, globalSettings, caption = '', hashtags = [] }) =>
    set({
      carouselId: id,
      carouselTitle: title,
      style,
      slides,
      globalSettings,
      activeSlideIndex: 0,
      saveStatus: 'saved',
      lastSavedAt: null,
      history: [],
      historyIndex: -1,
      caption,
      hashtags,
    }),
}));
