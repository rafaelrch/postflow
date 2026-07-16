'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import {
  Download,
  Newspaper,
  Upload,
  X,
  ChevronLeft,
  ChevronRight,
  FileJson,
  Package,
  ExternalLink,
  Pencil,
  Trash2,
  Save,
} from 'lucide-react';
import toast from 'react-hot-toast';
import NewsCard, { NewsCardItem, DEFAULT_STYLE, parseNewsJSON } from '@/components/news/NewsCard';
import { createClient } from '@/lib/supabase';

// ── Canvas export helpers ─────────────────────────────────────────────────────

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Only set crossOrigin for http URLs (blob: and data: don't need it)
    if (src.startsWith('http')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Falha ao carregar imagem: ${src.slice(0, 60)}`));
    img.src = src;
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxW) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

async function captureCardToCanvas(item: NewsCardItem): Promise<HTMLCanvasElement> {
  const W = 1080, H = 1350, DPR = 2;

  const canvas = document.createElement('canvas');
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(DPR, DPR);

  // ── Clip to rounded card shape ──────────────────────────────────────────────
  ctx.save();
  ctx.beginPath();
  const r = item.card_radius;
  ctx.moveTo(r, 0);
  ctx.lineTo(W - r, 0); ctx.arcTo(W, 0, W, r, r);
  ctx.lineTo(W, H - r); ctx.arcTo(W, H, W - r, H, r);
  ctx.lineTo(r, H);     ctx.arcTo(0, H, 0, H - r, r);
  ctx.lineTo(0, r);     ctx.arcTo(0, 0, r, 0, r);
  ctx.closePath();
  ctx.fillStyle = '#0A0A0A';
  ctx.fill();
  ctx.clip();

  // ── Background image ────────────────────────────────────────────────────────
  const imgSrc = item.localImageUrl ?? item.imagem_url;
  if (imgSrc) {
    try {
      // Proxy external URLs to avoid CORS taint
      const fetchSrc = imgSrc.startsWith('http')
        ? `/api/proxy-image?url=${encodeURIComponent(imgSrc)}`
        : imgSrc;
      const img = await loadImg(fetchSrc);

      let dw: number, dh: number;
      if (item.image_scale === 1) {
        // CSS background-size: cover
        const scale = Math.max(W / img.width, H / img.height);
        dw = img.width * scale;
        dh = img.height * scale;
      } else {
        // CSS background-size: N% (relative to container width)
        dw = W * item.image_scale;
        dh = (img.height / img.width) * dw;
      }
      // CSS background-position: calc(50% + image_x) calc(0% + image_y)
      // 50% X means: (containerW - renderedW) * 0.5 + offset
      // 0%  Y means: 0 + offset
      const dx = (W - dw) * 0.5 + item.image_x;
      const dy = item.image_y;
      ctx.drawImage(img, dx, dy, dw, dh);
    } catch {
      // Sem imagem carregável → fundo preto
      ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, W, H);
    }
  } else {
    ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, W, H);
  }

  // ── Gradient overlay ────────────────────────────────────────────────────────
  const hex = (item.gradient_color || '#000000').replace('#', '');
  const cr = parseInt(hex.slice(0, 2), 16);
  const cg = parseInt(hex.slice(2, 4), 16);
  const cb = parseInt(hex.slice(4, 6), 16);
  const op = (item.gradient_opacity ?? 97) / 100;
  // Ensure sz >= dist to keep gradient stops in ascending order
  const sz  = Math.min((item.gradient_size ?? 85), 100) / 100;
  const dist = Math.min((item.gradient_distance ?? 55), (item.gradient_size ?? 85) * 0.95) / 100;

  const og = ctx.createLinearGradient(0, H, 0, 0); // bottom → top
  const stops: [number, number][] = [
    [0,                         op],
    [dist * 0.22,               Math.min(op * 0.96, 1)],
    [dist * 0.45,               Math.min(op * 0.85, 1)],
    [dist * 0.73,               op * 0.57],
    [dist,                      op * 0.26],
    [Math.min((dist + sz) / 2, sz * 0.99), op * 0.05],
    [sz,                        0],
  ];
  // Clamp to [0,1] and deduplicate
  const seen = new Set<number>();
  for (const [pos, alpha] of stops) {
    const p = Math.min(Math.max(pos, 0), 1);
    if (!seen.has(p)) { seen.add(p); og.addColorStop(p, `rgba(${cr},${cg},${cb},${alpha})`); }
  }
  if (sz < 1) og.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
  ctx.fillStyle = og; ctx.fillRect(0, 0, W, H);

  // ── Logo ────────────────────────────────────────────────────────────────────
  if (item.logo_url) {
    try {
      const logo = await loadImg(item.logo_url);
      const lh = Math.round(46 * item.logo_size);
      const lw = Math.round((logo.width / logo.height) * lh);
      ctx.drawImage(logo, item.logo_x ?? 52, item.logo_y, lw, lh);
    } catch { /* logo not critical */ }
  }

  // ── Text ────────────────────────────────────────────────────────────────────
  await document.fonts.ready;

  const PAD = 52;
  const maxTextW = W - PAD * 2; // 976px

  const temaFont  = `italic 500 ${item.tema_size}px ${item.tema_font || "'IvyOra Text', Georgia, serif"}`;
  const titleFont = `${item.titulo_weight} ${item.titulo_size}px ${item.titulo_font || "'SF Pro Display', -apple-system, 'Helvetica Neue', Arial, sans-serif"}`;
  const temaLineH  = item.tema_size * 1.2;
  const titleLineH = item.titulo_size * 1.1;

  // Apply letter-spacing before measuring so wrapText is accurate
  if ('letterSpacing' in ctx) (ctx as any).letterSpacing = `${item.titulo_letter_spacing ?? 0}px`;

  ctx.font = temaFont;
  const temaLines  = item.tema       ? wrapText(ctx, item.tema, maxTextW)       : [];
  ctx.font = titleFont;
  const titleLines = item.titulo_card ? wrapText(ctx, item.titulo_card, maxTextW) : [];

  const gap    = temaLines.length > 0 ? 12 : 0;
  const temaH  = temaLines.length  * temaLineH;
  const titleH = titleLines.length * titleLineH;
  const blockBottom = H - item.text_y;
  const blockTop    = blockBottom - temaH - gap - titleH;

  ctx.textBaseline = 'top';

  // Tema
  if (temaLines.length) {
    ctx.font = temaFont;
    if ('letterSpacing' in ctx) (ctx as any).letterSpacing = '0px';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    temaLines.forEach((line, i) => ctx.fillText(line, PAD, blockTop + i * temaLineH));
  }

  // Title
  if (titleLines.length) {
    ctx.font = titleFont;
    if ('letterSpacing' in ctx) (ctx as any).letterSpacing = `${item.titulo_letter_spacing ?? 0}px`;
    ctx.fillStyle = '#ffffff';
    const titleTop = blockTop + temaH + gap;
    titleLines.forEach((line, i) => ctx.fillText(line, PAD, titleTop + i * titleLineH));
  }

  ctx.restore();

  // ── Circular inset element ──────────────────────────────────────────────────
  if (item.inset_enabled && !item.inset_image_url) {
    // Placeholder: círculo branco sólido enquanto não há imagem
    const cx = item.inset_x + item.inset_size / 2;
    const cy = item.inset_y + item.inset_size / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, item.inset_size / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
  }
  if (item.inset_enabled && item.inset_image_url) {
    const cx = item.inset_x + item.inset_size / 2;
    const cy = item.inset_y + item.inset_size / 2;
    const r  = item.inset_size / 2;

    try {
      const src = item.inset_image_url;
      const fetchSrc = src.startsWith('http') ? `/api/proxy-image?url=${encodeURIComponent(src)}` : src;
      const insetImg = await loadImg(fetchSrc);

      // Clip to circle, draw image
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r - 1.5, 0, Math.PI * 2); // -1.5 so image doesn't bleed past border
      ctx.clip();

      const zoom = item.inset_image_zoom;
      // zoom=1 → image width = circle diameter
      const dw = item.inset_size * zoom;
      const dh = (insetImg.height / insetImg.width) * dw;
      const dx = item.inset_x + (item.inset_size - dw) / 2 + item.inset_image_x;
      const dy = item.inset_y + (item.inset_size - dh) / 2 + item.inset_image_y;
      ctx.drawImage(insetImg, dx, dy, dw, dh);
      ctx.restore();

      // White border ring
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    } catch { /* inset not critical */ }
  }

  return canvas;
}

// ── Template type ─────────────────────────────────────────────────────────────

type NewsTemplateStyle = Pick<NewsCardItem,
  | 'titulo_size' | 'titulo_weight' | 'titulo_letter_spacing' | 'titulo_font'
  | 'tema_size' | 'tema_font'
  | 'card_radius' | 'logo_y' | 'logo_x' | 'logo_size'
  | 'text_y' | 'gradient_opacity' | 'gradient_color'
  | 'gradient_size' | 'gradient_distance'
>;

type SavedTemplate = {
  id: string;
  name: string;
  style: NewsTemplateStyle;
  createdAt: string;
};

/** Lote de cards salvos em news_entries (agrupados por batch_id). */
type SavedNewsBatch = {
  batchId: string | null;
  createdAt: string;
  items: NewsCardItem[];
};

const TEMPLATES_LS_KEY = (userId: string) => `news_templates_${userId}`;

const DEFAULT_TEMPLATE: NewsTemplateStyle = {
  titulo_size: DEFAULT_STYLE.titulo_size,
  titulo_weight: DEFAULT_STYLE.titulo_weight,
  titulo_letter_spacing: DEFAULT_STYLE.titulo_letter_spacing,
  titulo_font: DEFAULT_STYLE.titulo_font,
  tema_size: DEFAULT_STYLE.tema_size,
  tema_font: DEFAULT_STYLE.tema_font,
  card_radius: DEFAULT_STYLE.card_radius,
  logo_y: DEFAULT_STYLE.logo_y,
  logo_x: DEFAULT_STYLE.logo_x,
  logo_size: DEFAULT_STYLE.logo_size,
  text_y: DEFAULT_STYLE.text_y,
  gradient_opacity: DEFAULT_STYLE.gradient_opacity,
  gradient_color: DEFAULT_STYLE.gradient_color,
  gradient_size: DEFAULT_STYLE.gradient_size,
  gradient_distance: DEFAULT_STYLE.gradient_distance,
};

// ── Constants ─────────────────────────────────────────────────────────────────

const THUMB_SCALE = 0.18;
const PREVIEW_SCALE = 0.38;

const NEWS_TITLE_FONTS: { label: string; value: string }[] = [
  { label: 'SF Pro Display', value: "'SF Pro Display', -apple-system, 'Helvetica Neue', Arial, sans-serif" },
  { label: 'Bebas Neue', value: "'Bebas Neue', Impact, sans-serif" },
  { label: 'Anton', value: "'Anton', Impact, sans-serif" },
  { label: 'Archivo Black', value: "'Archivo Black', sans-serif" },
  { label: 'Oswald', value: "'Oswald', sans-serif" },
  { label: 'Barlow Condensed', value: "'Barlow Condensed', sans-serif" },
  { label: 'Montserrat', value: "'Montserrat', sans-serif" },
  { label: 'Inter', value: "'Inter', sans-serif" },
  { label: 'Poppins', value: "'Poppins', sans-serif" },
  { label: 'Raleway', value: "'Raleway', sans-serif" },
  { label: 'Space Grotesk', value: "'Space Grotesk', sans-serif" },
  { label: 'Syne', value: "'Syne', sans-serif" },
  { label: 'Playfair Display', value: "'Playfair Display', Georgia, serif" },
];

const NEWS_TEMA_FONTS: { label: string; value: string }[] = [
  { label: 'IvyOra Text', value: "'IvyOra Text', Georgia, 'Times New Roman', serif" },
  { label: 'Cormorant Garamond', value: "'Cormorant Garamond', Georgia, serif" },
  { label: 'Lora', value: "'Lora', Georgia, serif" },
  { label: 'DM Serif Display', value: "'DM Serif Display', Georgia, serif" },
  { label: 'Playfair Display', value: "'Playfair Display', Georgia, serif" },
  { label: 'Montserrat', value: "'Montserrat', sans-serif" },
  { label: 'Inter', value: "'Inter', sans-serif" },
  { label: 'Poppins', value: "'Poppins', sans-serif" },
  { label: 'Open Sans', value: "'Open Sans', sans-serif" },
  { label: 'Space Grotesk', value: "'Space Grotesk', sans-serif" },
];

const FONT_WEIGHTS = [
  { label: 'Light', value: 300 },
  { label: 'Regular', value: 400 },
  { label: 'Medium', value: 500 },
  { label: 'SemiBold', value: 600 },
  { label: 'Bold', value: 700 },
  { label: 'ExtraBold', value: 800 },
  { label: 'Black', value: 900 },
];

const EXAMPLE_JSON = `[
  {
    "numero": 1,
    "tema": "IA",
    "titulo_card": "OpenAI capta US$ 122 bi e vale US$ 852 bi",
    "imagem_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/OpenAI_Logo.svg/1200px-OpenAI_Logo.svg.png",
    "legenda": "A maior captação da história das startups acaba de acontecer. 🚀"
  }
]`;

// ── Page ──────────────────────────────────────────────────────────────────────

// Guarda em escopo de módulo: em dev o React monta o componente 2× (StrictMode)
// e a migração do localStorage disparava dois inserts — duplicando templates.
let legacyTemplateMigrationStarted = false;

export default function NewsPage() {
  const [step, setStep] = useState<'choose' | 'import' | 'manual' | 'editor' | 'template'>('choose');

  // ── Template state ────────────────────────────────────────────────────────
  const [newsTemplate, setNewsTemplate] = useState<NewsTemplateStyle>({ ...DEFAULT_TEMPLATE });
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);
  // Evita o flash de "crie seu primeiro template" enquanto os templates
  // salvos ainda estão sendo carregados do banco.
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [modalTemplateId, setModalTemplateId] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // ── JSON import state ─────────────────────────────────────────────────────
  const [jsonInput, setJsonInput] = useState('');

  // ── Manual creation state ─────────────────────────────────────────────────
  const [manualCount, setManualCount] = useState(5);
  const [manualCards, setManualCards] = useState<{ tema: string; titulo_card: string; legenda: string }[]>(
    Array.from({ length: 10 }, () => ({ tema: '', titulo_card: '', legenda: '' }))
  );

  // ── Shared brand state ────────────────────────────────────────────────────
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | undefined>(undefined);
  const [brandLogoUploading, setBrandLogoUploading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Load the user's saved brand logo (from profile) once on mount.
  useEffect(() => {
    let active = true;
    const load = async () => {
      const supabase = createClient();
      // getSession lê do storage local (instantâneo); getUser fazia uma
      // round-trip ao Supabase antes de qualquer outra coisa.
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user || !active) {
        if (active) setTemplatesLoading(false);
        return;
      }
      setUserId(user.id);

      // Perfil (logo) e templates em paralelo — eram 2 round-trips em série.
      const [{ data: profile }, { data: tplRows }] = await Promise.all([
        supabase
          .from('profiles')
          .select('brand_logo_url')
          .eq('id', user.id)
          .single(),
        supabase
          .from('templates')
          .select('id, name, content_schema, created_at')
          .eq('kind', 'news')
          .order('created_at', { ascending: true }),
      ]);

      if (!active) return;
      const savedLogo = (profile?.brand_logo_url as string | undefined)?.trim();
      if (savedLogo) setBrandLogoUrl(savedLogo);

      let templates: SavedTemplate[] = (tplRows || []).map((row: { id: string; name: string; content_schema: NewsTemplateStyle; created_at: string }) => ({
        id: row.id,
        name: row.name,
        style: { ...DEFAULT_TEMPLATE, ...(row.content_schema || {}) },
        createdAt: row.created_at,
      }));

      // Migração one-time: templates antigos do localStorage sobem pro banco.
      if (templates.length === 0 && !legacyTemplateMigrationStarted) {
        legacyTemplateMigrationStarted = true;
        try {
          const raw = localStorage.getItem(TEMPLATES_LS_KEY(user.id));
          const legacy = raw ? (JSON.parse(raw) as SavedTemplate[]) : [];
          if (Array.isArray(legacy) && legacy.length > 0) {
            const { data: inserted } = await supabase
              .from('templates')
              .insert(legacy.map((t) => ({
                name: t.name || 'Template',
                kind: 'news',
                content_schema: t.style || {},
              })))
              .select('id, name, content_schema, created_at');
            if (inserted?.length) {
              templates = (inserted as { id: string; name: string; content_schema: NewsTemplateStyle; created_at: string }[]).map((row) => ({
                id: row.id,
                name: row.name,
                style: { ...DEFAULT_TEMPLATE, ...(row.content_schema || {}) },
                createdAt: row.created_at,
              }));
              localStorage.removeItem(TEMPLATES_LS_KEY(user.id));
            }
          }
        } catch { /* localStorage indisponível — segue sem migrar */ }
      }

      if (active) {
        setSavedTemplates(templates);
        setTemplatesLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, []);

  const createTemplateInDb = useCallback(async (style: NewsTemplateStyle): Promise<SavedTemplate | null> => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('templates')
      .insert({ name: `Template ${savedTemplates.length + 1}`, kind: 'news', content_schema: style })
      .select('id, name, content_schema, created_at')
      .single();
    if (error || !data) {
      console.error('[news-templates] create', error);
      toast.error('Erro ao salvar template');
      return null;
    }
    const tpl: SavedTemplate = { id: data.id, name: data.name, style: { ...DEFAULT_TEMPLATE, ...(data.content_schema || {}) }, createdAt: data.created_at };
    setSavedTemplates((prev) => [...prev, tpl]);
    return tpl;
  }, [savedTemplates.length]);

  const updateTemplateInDb = useCallback(async (id: string, style: NewsTemplateStyle) => {
    const supabase = createClient();
    const { error } = await supabase.from('templates').update({ content_schema: style }).eq('id', id);
    if (error) {
      console.error('[news-templates] update', error);
      toast.error('Erro ao atualizar template');
      return;
    }
    setSavedTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, style: { ...style } } : t)));
  }, []);

  const deleteTemplateInDb = useCallback(async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.from('templates').delete().eq('id', id);
    if (error) {
      console.error('[news-templates] delete', error);
      toast.error('Erro ao remover template');
      return;
    }
    setSavedTemplates((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Editor state ──────────────────────────────────────────────────────────
  const [items, setItems] = useState<NewsCardItem[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [localImages, setLocalImages] = useState<Record<number, string>>({});

  const previewRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonFileRef = useRef<HTMLInputElement>(null);
  const insetFileRef = useRef<HTMLInputElement>(null);
  const brandLogoRef = useRef<HTMLInputElement>(null);

  // ── Logo upload ───────────────────────────────────────────────────────────

  const handleBrandLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (brandLogoRef.current) brandLogoRef.current.value = '';
    if (!file) return;

    if (!userId) {
      toast.error('Sessão ainda carregando. Tente novamente em instantes.');
      return;
    }

    setBrandLogoUploading(true);
    const loadingId = toast.loading('Salvando logo…');

    const describe = (err: unknown, stage: 'upload' | 'profile'): string => {
      const e = err as { message?: string; error?: string; statusCode?: string | number; code?: string };
      const raw = e?.message || e?.error || '';
      if (stage === 'upload') {
        if (/bucket.*not.*found/i.test(raw)) {
          return 'Bucket "postflow-assets" não encontrado no Supabase. Rode o schema SQL.';
        }
        if (/row.level.security|unauthorized|403/i.test(raw) || e?.statusCode === 403) {
          return 'Sem permissão pra subir no Storage. Verifique as policies do bucket.';
        }
        return `Upload falhou: ${raw || 'erro desconhecido'}`;
      }
      if (/column .*brand_logo_url.* does not exist/i.test(raw) || e?.code === '42703') {
        return 'Coluna brand_logo_url ainda não existe em profiles. Rode o SQL mais recente.';
      }
      return `Falha ao atualizar perfil: ${raw || 'erro desconhecido'}`;
    };

    try {
      const supabase = createClient();
      const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
      const path = `${userId}/brand-logo/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('postflow-assets')
        .upload(path, file, { cacheControl: '3600', upsert: true, contentType: file.type || undefined });
      if (uploadError) {
        console.error('[brand-logo] upload error', uploadError);
        toast.error(describe(uploadError, 'upload'), { id: loadingId });
        return;
      }

      const { data: publicData } = supabase.storage.from('postflow-assets').getPublicUrl(path);
      const publicUrl = publicData?.publicUrl;
      if (!publicUrl) {
        toast.error('Não foi possível obter a URL pública do logo.', { id: loadingId });
        return;
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ brand_logo_url: publicUrl })
        .eq('id', userId);
      if (profileError) {
        console.error('[brand-logo] profile update error', profileError);
        toast.error(describe(profileError, 'profile'), { id: loadingId });
        return;
      }

      setBrandLogoUrl(publicUrl);
      setItems(prev => prev.map(it => ({ ...it, logo_url: publicUrl })));
      toast.success('Logo salvo como padrão', { id: loadingId });
    } catch (err) {
      console.error('[brand-logo] unexpected', err);
      const message = err instanceof Error ? err.message : 'Falha inesperada ao salvar logo';
      toast.error(message, { id: loadingId });
    } finally {
      setBrandLogoUploading(false);
    }
  };

  const handleRemoveBrandLogo = async () => {
    if (!userId) {
      setBrandLogoUrl(undefined);
      setItems(prev => prev.map(it => ({ ...it, logo_url: undefined })));
      return;
    }
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('profiles')
        .update({ brand_logo_url: '' })
        .eq('id', userId);
      if (error) throw error;
      setBrandLogoUrl(undefined);
      setItems(prev => prev.map(it => ({ ...it, logo_url: undefined })));
      toast.success('Logo padrão removido');
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Falha ao remover logo');
    }
  };

  // ── Manual card field updater ──────────────────────────────────────────────

  const updateManualCard = (idx: number, patch: Partial<typeof manualCards[0]>) => {
    setManualCards(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  };

  const updateTemplate = (patch: Partial<NewsTemplateStyle>) => {
    setNewsTemplate(prev => ({ ...prev, ...patch }));
  };

  // ── Create cards from manual form ─────────────────────────────────────────

  const handleCreateManual = async () => {
    const built: NewsCardItem[] = manualCards.slice(0, manualCount).map((c, i) => ({
      numero: i + 1,
      tema: c.tema,
      titulo_card: c.titulo_card,
      imagem_url: '',
      legenda: c.legenda,
      ...DEFAULT_STYLE,
      ...newsTemplate,
      logo_url: brandLogoUrl,
    }));
    const saved = await persistNewBatch(built);
    setItems(saved);
    setSelectedIdx(0);
    setLocalImages({});
    setStep('editor');
    toast.success(`${saved.length} cards criados!`);
  };

  // ── Import ────────────────────────────────────────────────────────────────

  const handleParse = async () => {
    try {
      const parsed = parseNewsJSON(jsonInput.trim());
      if (parsed.length === 0) throw new Error('Array vazio');
      const withLogo = parsed.map(it => ({ ...DEFAULT_STYLE, ...it, ...newsTemplate, logo_url: brandLogoUrl }));
      const saved = await persistNewBatch(withLogo);
      setItems(saved);
      setSelectedIdx(0);
      setLocalImages({});
      setStep('editor');
      toast.success(`${parsed.length} cards carregados!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'JSON inválido');
    }
  };

  const handleJsonFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setJsonInput(text);
    };
    reader.readAsText(file);
  };

  // ── Persistência dos cards em news_entries (por usuário, via RLS) ─────────

  const itemsRef = useRef<NewsCardItem[]>([]);
  useEffect(() => { itemsRef.current = items; }, [items]);
  const saveTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const currentBatchIdRef = useRef<string | null>(null);
  const [savedBatches, setSavedBatches] = useState<SavedNewsBatch[]>([]);

  // blob: URLs morrem no reload — não vão para o banco.
  const sanitizeForPayload = (item: NewsCardItem): Record<string, unknown> => {
    const { dbId: _dbId, localImageUrl: _local, ...rest } = item;
    const payload = { ...rest } as Record<string, unknown>;
    if (typeof payload.inset_image_url === 'string' && (payload.inset_image_url as string).startsWith('blob:')) {
      delete payload.inset_image_url;
    }
    return payload;
  };

  /** Insere um lote novo de cards e devolve os itens com dbId preenchido. */
  const persistNewBatch = useCallback(async (built: NewsCardItem[]): Promise<NewsCardItem[]> => {
    try {
      const supabase = createClient();
      const batchId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? crypto.randomUUID()
        : `b_${Date.now()}`;
      const { data, error } = await supabase
        .from('news_entries')
        .insert(built.map((it) => ({
          title: it.titulo_card || '',
          topic: it.tema || '',
          image_url: it.imagem_url || '',
          caption: it.legenda || '',
          status: 'draft',
          raw_payload: { batch_id: batchId, ...sanitizeForPayload(it) },
        })))
        .select('id');
      if (error || !data) {
        console.error('[news] erro ao salvar lote:', error);
        toast.error('Cards criados, mas não foi possível salvar no banco.');
        return built;
      }
      currentBatchIdRef.current = batchId;
      return built.map((it, i) => ({ ...it, dbId: (data[i] as { id: string } | undefined)?.id }));
    } catch (err) {
      console.error('[news] erro inesperado ao salvar lote:', err);
      return built;
    }
  }, []);

  /** Carrega todos os lotes de cards salvos, agrupados por batch_id. */
  const loadBatches = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('news_entries')
      .select('id, title, topic, image_url, caption, raw_payload, created_at')
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error || !data) return;

    type EntryRow = { id: string; title: string; topic: string; image_url: string; caption: string; raw_payload: Record<string, unknown> | null; created_at: string };
    const rows = data as EntryRow[];

    const groups = new Map<string, EntryRow[]>();
    for (const r of rows) {
      const key = (r.raw_payload?.batch_id as string | undefined) || `single_${r.id}`;
      const g = groups.get(key);
      if (g) g.push(r); else groups.set(key, [r]);
    }

    const batches: SavedNewsBatch[] = Array.from(groups.entries()).map(([key, groupRows]) => ({
      batchId: key.startsWith('single_') ? null : key,
      createdAt: groupRows[groupRows.length - 1].created_at,
      items: groupRows
        .map((r, i) => ({
          ...DEFAULT_STYLE,
          numero: i + 1,
          ...(r.raw_payload || {}),
          dbId: r.id,
          titulo_card: r.title,
          tema: r.topic,
          imagem_url: r.image_url,
          legenda: r.caption,
        } as NewsCardItem))
        .sort((a, b) => a.numero - b.numero),
    }));
    setSavedBatches(batches);
  }, []);

  // Recarrega a lista sempre que voltamos para a página principal.
  useEffect(() => {
    if (step === 'choose') loadBatches();
  }, [step, loadBatches]);

  /** Salva (upsert) todos os cards do lote atual no banco. */
  const saveAllCards = useCallback(async () => {
    const current = itemsRef.current;
    if (!current.length) return;
    toast.loading('Salvando notícias…', { id: 'save-news' });
    try {
      const supabase = createClient();
      if (!currentBatchIdRef.current) {
        currentBatchIdRef.current = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
          ? crypto.randomUUID()
          : `b_${Date.now()}`;
      }
      const batchId = currentBatchIdRef.current;
      const rowFor = (it: NewsCardItem) => ({
        title: it.titulo_card || '',
        topic: it.tema || '',
        image_url: it.imagem_url || '',
        caption: it.legenda || '',
        status: 'draft',
        raw_payload: { batch_id: batchId, ...sanitizeForPayload(it) },
      });

      await Promise.all(
        current.filter((it) => it.dbId).map((it) =>
          supabase.from('news_entries').update(rowFor(it)).eq('id', it.dbId!)),
      );

      const missing = current.map((it, idx) => ({ it, idx })).filter((x) => !x.it.dbId);
      if (missing.length) {
        const { data, error } = await supabase
          .from('news_entries')
          .insert(missing.map((x) => rowFor(x.it)))
          .select('id');
        if (error) throw error;
        setItems((prev) => {
          const next = [...prev];
          missing.forEach((x, i) => {
            const id = (data?.[i] as { id: string } | undefined)?.id;
            if (id && next[x.idx]) next[x.idx] = { ...next[x.idx], dbId: id };
          });
          return next;
        });
      }

      toast.success('Notícias salvas!', { id: 'save-news' });
      loadBatches();
    } catch (err) {
      console.error('[news] erro ao salvar cards:', err);
      toast.error('Erro ao salvar notícias', { id: 'save-news' });
    }
  }, [loadBatches]);

  // ── Item updater (com sync debounced pro banco) ───────────────────────────

  const updateItem = useCallback((idx: number, patch: Partial<NewsCardItem>) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));

    if (saveTimersRef.current[idx]) clearTimeout(saveTimersRef.current[idx]);
    saveTimersRef.current[idx] = setTimeout(async () => {
      const item = itemsRef.current[idx];
      if (!item?.dbId) return;
      const supabase = createClient();
      const { error } = await supabase
        .from('news_entries')
        .update({
          title: item.titulo_card || '',
          topic: item.tema || '',
          image_url: item.imagem_url || '',
          caption: item.legenda || '',
          raw_payload: {
            ...(currentBatchIdRef.current ? { batch_id: currentBatchIdRef.current } : {}),
            ...sanitizeForPayload(item),
          },
        })
        .eq('id', item.dbId);
      if (error) console.error('[news] erro ao sincronizar card:', error);
    }, 2000);
  }, []);

  // ── Image upload per card ────────────────────────────────────────────────

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setLocalImages(prev => ({ ...prev, [selectedIdx]: url }));
    updateItem(selectedIdx, { localImageUrl: url });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveImage = () => {
    setLocalImages(prev => {
      const next = { ...prev };
      delete next[selectedIdx];
      return next;
    });
    updateItem(selectedIdx, { localImageUrl: undefined });
  };

  // ── Inset image upload ─────────────────────────────────────────────────────

  const handleInsetImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    updateItem(selectedIdx, { inset_image_url: url, inset_enabled: true });
    if (insetFileRef.current) insetFileRef.current.value = '';
  };

  const handleRemoveInsetImage = () => {
    updateItem(selectedIdx, { inset_image_url: undefined, inset_enabled: false });
  };

  // ── Export ────────────────────────────────────────────────────────────────

  // captureCardToCanvas is defined above the component — pure canvas, no DOM/html2canvas
  const captureCard = useCallback(
    (item: NewsCardItem) => captureCardToCanvas(item),
    []
  );

  const downloadCard = async (idx: number) => {
    const item = items[idx];
    if (!item) return;
    toast.loading(`Gerando card ${item.numero}…`, { id: 'export' });
    try {
      const canvas = await captureCard(item);
      const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/png'));
      if (!blob) throw new Error('Falha ao gerar imagem');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `arke-news-${String(item.numero).padStart(2, '0')}.png`;
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`Card ${item.numero} baixado!`, { id: 'export' });
    } catch (err) {
      console.error(err);
      toast.error('Erro ao exportar card', { id: 'export' });
    }
  };

  const downloadAll = async () => {
    toast.loading('Iniciando exportação de todos os cards…', { id: 'zip' });
    try {
      const { default: JSZip } = await import('jszip');
      const { saveAs } = await import('file-saver');
      const zip = new JSZip();
      let added = 0;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        toast.loading(`Processando card ${i + 1} de ${items.length}…`, { id: 'zip' });
        try {
          const canvas = await captureCard(item);
          const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/png'));
          if (!blob) throw new Error('toBlob retornou null');
          zip.file(`arke-news-${String(item.numero).padStart(2, '0')}.png`, blob);
          added++;
        } catch (cardErr) {
          console.error(`Card ${item.numero} falhou:`, cardErr);
          // continua com o próximo card em vez de abortar o zip inteiro
        }
      }

      if (added === 0) throw new Error('Nenhum card foi gerado');

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      saveAs(zipBlob, 'arke-news-cards.zip');
      const skipped = items.length - added;
      toast.success(
        skipped > 0
          ? `ZIP baixado! (${skipped} card(s) pulado(s) por erro)`
          : 'ZIP baixado!',
        { id: 'zip' }
      );
    } catch (err) {
      console.error(err);
      toast.error('Erro ao gerar ZIP', { id: 'zip' });
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const BrandLogoSection = ({ compact = false }: { compact?: boolean }) => (
    <div className={compact ? '' : 'mb-6'}>
      {!compact && (
        <p className="text-[10px] font-bold text-gray-900/30 dark:text-white/30 uppercase tracking-widest mb-3">
          Logo / Marca
        </p>
      )}
      {brandLogoUrl ? (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--surface)] border border-black/10 dark:border-white/10">
          <img src={brandLogoUrl} alt="logo" className="h-8 w-auto object-contain max-w-[100px]" />
          <span className="flex-1 text-[10px] text-gray-900/50 dark:text-white/50">Logo padrão salvo</span>
          <button
            onClick={handleRemoveBrandLogo}
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 text-gray-900/40 dark:text-white/40 transition-colors"
            aria-label="Remover logo"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => brandLogoRef.current?.click()}
          disabled={brandLogoUploading}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-black/15 dark:border-white/15 text-xs text-gray-900/40 dark:text-white/40 hover:border-black/30 dark:hover:border-white/30 hover:text-gray-900/60 dark:hover:text-white/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Upload className="w-3.5 h-3.5" />
          {brandLogoUploading ? 'Salvando…' : (compact ? 'Adicionar logo' : 'Adicionar logo / marca')}
        </button>
      )}
      <input ref={brandLogoRef} type="file" accept="image/*" className="hidden" onChange={handleBrandLogoUpload} />
    </div>
  );

  // ── Render: Choose step ──────────────────────────────────────────────────

  if (step === 'choose') {
    // Skeleton enquanto os templates carregam — sem isso, quem já tem
    // templates via primeiro a tela de usuário novo e depois o conteúdo.
    if (templatesLoading) {
      return (
        <div className="flex-1 overflow-y-auto" style={{ background: 'var(--paper)' }}>
          <div className="max-w-3xl mx-auto px-8 py-14 animate-pulse">
            <div className="h-3 w-32 rounded bg-black/10 dark:bg-white/10 mb-5" />
            <div className="h-12 w-72 rounded bg-black/10 dark:bg-white/10 mb-4" />
            <div className="h-4 w-96 max-w-full rounded bg-black/[0.06] dark:bg-white/[0.06] mb-10" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="aspect-[4/5] rounded-xl bg-black/[0.05] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.06]" />
              ))}
            </div>
          </div>
        </div>
      );
    }

    const hasTemplates = savedTemplates.length > 0;
    const modalTemplate = savedTemplates.find(t => t.id === modalTemplateId) ?? null;

    const previewItemFor = (style: NewsTemplateStyle): NewsCardItem => ({
      numero: 1,
      tema: 'Tecnologia',
      titulo_card: 'OpenAI capta US$ 122 bi e vale US$ 852 bi',
      imagem_url: '',
      legenda: '',
      image_scale: DEFAULT_STYLE.image_scale,
      image_x: DEFAULT_STYLE.image_x,
      image_y: DEFAULT_STYLE.image_y,
      inset_enabled: false,
      inset_size: DEFAULT_STYLE.inset_size,
      inset_x: DEFAULT_STYLE.inset_x,
      inset_y: DEFAULT_STYLE.inset_y,
      inset_image_zoom: DEFAULT_STYLE.inset_image_zoom,
      inset_image_x: DEFAULT_STYLE.inset_image_x,
      inset_image_y: DEFAULT_STYLE.inset_image_y,
      logo_url: brandLogoUrl,
      ...style,
    });

    const CARD_PREVIEW_SCALE = 0.18;

    const handleOpenTemplateModal = (tpl: SavedTemplate) => {
      setModalTemplateId(tpl.id);
    };

    const handleEditTemplate = (tpl: SavedTemplate) => {
      setEditingTemplateId(tpl.id);
      setNewsTemplate({ ...tpl.style });
      setStep('template');
    };

    const handleDeleteTemplate = async (tpl: SavedTemplate) => {
      await deleteTemplateInDb(tpl.id);
      if (modalTemplateId === tpl.id) setModalTemplateId(null);
      toast.success('Template removido');
    };

    const handleCreateNew = () => {
      setEditingTemplateId(null);
      setNewsTemplate({ ...DEFAULT_TEMPLATE });
      setStep('template');
    };

    const handleChooseMode = (mode: 'manual' | 'import') => {
      if (modalTemplate) setNewsTemplate({ ...modalTemplate.style });
      setModalTemplateId(null);
      setStep(mode);
    };

    const handleOpenBatch = (batch: SavedNewsBatch) => {
      setItems(batch.items);
      setSelectedIdx(0);
      setLocalImages({});
      currentBatchIdRef.current = batch.batchId;
      setStep('editor');
    };

    const formatBatchDate = (iso: string) =>
      new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

    return (
      <div className="flex-1 overflow-y-auto" style={{ background: 'var(--paper)' }}>
        <div className="max-w-3xl mx-auto px-8 py-14">
          <span className="section-kicker flex items-center gap-2 mb-3">
            <span className="dot-live" aria-hidden />
            Studio · Notícias
          </span>
          <h1 className="section-title mb-3" style={{ fontSize: 'clamp(40px, 5vw, 64px)' }}>
            Cards de <span style={{ fontStyle: 'italic', color: 'var(--accent)' }}>hoje</span>
          </h1>
          <p className="text-[14px] mb-10" style={{ color: 'var(--ink-dim)' }}>
            {hasTemplates
              ? 'Selecione um template salvo ou crie um novo.'
              : 'Comece salvando o template da sua marca. Ele define fonte, gradiente, logo e cor — e passa a ser o padrão de todos os cards.'}
          </p>

          {hasTemplates && (
            <div className="mb-8">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--ink-dim)' }}>
                Seus templates
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {savedTemplates.map((tpl) => {
                  const previewW = 1080 * CARD_PREVIEW_SCALE;
                  const previewH = 1350 * CARD_PREVIEW_SCALE;
                  return (
                    <div
                      key={tpl.id}
                      className="brand-card interactive p-3 flex flex-col gap-3"
                      onClick={() => handleOpenTemplateModal(tpl)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenTemplateModal(tpl); } }}
                      style={{ cursor: 'pointer' }}
                    >
                      <div
                        style={{
                          width: '100%',
                          aspectRatio: '1080 / 1350',
                          overflow: 'hidden',
                          borderRadius: 8,
                          background: '#0A0A0A',
                          position: 'relative',
                        }}
                      >
                        <div style={{
                          position: 'absolute',
                          inset: 0,
                          width: previewW,
                          height: previewH,
                        }}>
                          <div style={{ transform: `scale(${CARD_PREVIEW_SCALE})`, transformOrigin: 'top left' }}>
                            <NewsCard item={previewItemFor(tpl.style)} scale={1} />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-medium truncate" style={{ color: 'var(--ink)' }}>
                          {tpl.name}
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); handleEditTemplate(tpl); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); handleEditTemplate(tpl); } }}
                            className="p-1.5 rounded-md inline-flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                            style={{ color: 'var(--ink-dim)', cursor: 'pointer' }}
                            aria-label="Editar template"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </span>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(tpl); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); handleDeleteTemplate(tpl); } }}
                            className="p-1.5 rounded-md inline-flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                            style={{ color: 'var(--ink-dim)', cursor: 'pointer' }}
                            aria-label="Remover template"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Tile de criar novo template, dentro da própria grade */}
                <button
                  onClick={handleCreateNew}
                  className="rounded-[14px] p-4 flex flex-col items-center justify-center gap-2 text-center transition-all"
                  style={{ border: '1.5px dashed var(--line-strong)', background: 'transparent' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translate(-2px,-2px)';
                    e.currentTarget.style.boxShadow = 'var(--sh-2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = '';
                    e.currentTarget.style.boxShadow = '';
                  }}
                >
                  <span
                    className="w-9 h-9 rounded-[8px] grid place-items-center mb-1"
                    style={{ background: 'var(--ink)', color: 'var(--paper)' }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                  <p className="font-display text-[18px] leading-none" style={{ color: 'var(--ink)' }}>
                    Criar novo template
                  </p>
                  <p className="text-[11.5px]" style={{ color: 'var(--ink-dim)' }}>
                    Adicione mais um estilo à sua biblioteca
                  </p>
                </button>
              </div>
            </div>
          )}

          {!hasTemplates ? (
            <div className="flex flex-col gap-4">
              <button
                onClick={handleCreateNew}
                className="brand-card interactive text-left flex items-center gap-5 p-7"
                style={{ border: '1.5px solid var(--ink)' }}
              >
                <span
                  className="brand-mark lg shrink-0"
                  style={{ background: 'var(--ink)', color: 'var(--paper)' }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 9h18M9 21V9" />
                  </svg>
                </span>
                <div className="flex-1">
                  <p className="section-kicker mb-1">Passo 1</p>
                  <p className="font-display text-[26px] leading-tight" style={{ color: 'var(--ink)' }}>
                    Criar template
                  </p>
                  <p className="text-[13px] mt-1.5" style={{ color: 'var(--ink-dim)' }}>
                    Fonte, tamanho, gradiente, logo e cor do seu card. Depois disso a criação de notícias é liberada.
                  </p>
                </div>
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ color: 'var(--ink-dim)' }}>
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>

              <div
                className="mt-2 p-5 rounded-[14px] flex items-center gap-3 opacity-60"
                style={{ background: 'var(--paper-2)', border: '1.5px dashed var(--line-strong)' }}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ color: 'var(--ink-dim)' }}>
                  <rect x="3" y="11" width="18" height="10" rx="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                <p className="text-[12.5px]" style={{ color: 'var(--ink-dim)' }}>
                  Criar manualmente e importar JSON ficam disponíveis após salvar o template.
                </p>
              </div>
            </div>
          ) : null}

          {savedBatches.length > 0 && (
            <div className="mt-2">
              <div className="h-px mb-8" style={{ background: 'var(--line)' }} />
              <p className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--ink-dim)' }}>
                Notícias salvas
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {savedBatches.map((batch) => (
                  <div
                    key={batch.batchId ?? batch.items[0]?.dbId}
                    className="brand-card interactive p-3 flex flex-col gap-3"
                    onClick={() => handleOpenBatch(batch)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenBatch(batch); } }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div
                      style={{
                        width: '100%',
                        aspectRatio: '1080 / 1350',
                        overflow: 'hidden',
                        borderRadius: 8,
                        background: '#0A0A0A',
                        position: 'relative',
                      }}
                    >
                      <div style={{ position: 'absolute', inset: 0, width: 1080 * CARD_PREVIEW_SCALE, height: 1350 * CARD_PREVIEW_SCALE }}>
                        <div style={{ transform: `scale(${CARD_PREVIEW_SCALE})`, transformOrigin: 'top left' }}>
                          <NewsCard item={batch.items[0]} scale={1} />
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-[13px] font-medium truncate" style={{ color: 'var(--ink)' }}>
                        {formatBatchDate(batch.createdAt)}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-dim)' }}>
                        {batch.items.length} card{batch.items.length === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {modalTemplate && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
            style={{ background: 'rgba(0,0,0,0.55)' }}
            onClick={() => setModalTemplateId(null)}
          >
            <div
              className="relative w-full max-w-[760px] rounded-[18px] p-7"
              style={{ background: 'var(--paper)', border: '1.5px solid var(--line-strong)', boxShadow: 'var(--sh-2)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setModalTemplateId(null)}
                aria-label="Fechar"
                className="absolute top-4 right-4 w-8 h-8 grid place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                style={{ color: 'var(--ink-dim)' }}
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex flex-col sm:flex-row gap-6 items-stretch">
                <div
                  className="shrink-0 mx-auto sm:mx-0"
                  style={{
                    width: 1080 * 0.18,
                    aspectRatio: '1080 / 1350',
                    overflow: 'hidden',
                    borderRadius: 10,
                    background: '#0A0A0A',
                    position: 'relative',
                  }}
                >
                  <div style={{ position: 'absolute', inset: 0, width: 1080 * 0.18, height: 1350 * 0.18 }}>
                    <div style={{ transform: `scale(${0.18})`, transformOrigin: 'top left' }}>
                      <NewsCard item={previewItemFor(modalTemplate.style)} scale={1} />
                    </div>
                  </div>
                </div>

                <div className="flex-1 flex flex-col">
                  <p className="section-kicker mb-2">Template</p>
                  <h2 className="font-display text-[28px] leading-tight mb-2" style={{ color: 'var(--ink)' }}>
                    {modalTemplate.name}
                  </h2>
                  <p className="text-[13px] mb-5" style={{ color: 'var(--ink-dim)' }}>
                    Como você quer criar os cards de hoje usando este template?
                  </p>

                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => handleChooseMode('manual')}
                      className="brand-card interactive text-left flex items-center gap-4 p-4"
                    >
                      <span className="brand-mark lg shrink-0">
                        <Newspaper className="w-5 h-5" />
                      </span>
                      <div className="flex-1">
                        <p className="font-display text-[18px] leading-tight" style={{ color: 'var(--ink)' }}>
                          Criar manualmente
                        </p>
                        <p className="text-[12px] mt-1" style={{ color: 'var(--ink-dim)' }}>
                          Escolha a quantidade e preencha cada notícia.
                        </p>
                      </div>
                      <span className="chip">Recomendado</span>
                    </button>

                    <button
                      onClick={() => handleChooseMode('import')}
                      className="brand-card interactive text-left flex items-center gap-4 p-4"
                    >
                      <span className="brand-mark lg shrink-0">
                        <FileJson className="w-5 h-5" />
                      </span>
                      <div className="flex-1">
                        <p className="font-display text-[18px] leading-tight" style={{ color: 'var(--ink)' }}>
                          Importar JSON
                        </p>
                        <p className="text-[12px] mt-1" style={{ color: 'var(--ink-dim)' }}>
                          Cole ou carregue um arquivo .json com as notícias.
                        </p>
                      </div>
                      <span className="chip soft">Batch</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Render: Template editor step ────────────────────────────────────────

  if (step === 'template') {
    const templateCard: NewsCardItem = {
      numero: 1,
      tema: 'Tecnologia',
      titulo_card: 'OpenAI capta US$ 122 bi e vale US$ 852 bi',
      imagem_url: '',
      legenda: '',
      image_scale: DEFAULT_STYLE.image_scale,
      image_x: DEFAULT_STYLE.image_x,
      image_y: DEFAULT_STYLE.image_y,
      inset_enabled: false,
      inset_size: DEFAULT_STYLE.inset_size,
      inset_x: DEFAULT_STYLE.inset_x,
      inset_y: DEFAULT_STYLE.inset_y,
      inset_image_zoom: DEFAULT_STYLE.inset_image_zoom,
      inset_image_x: DEFAULT_STYLE.inset_image_x,
      inset_image_y: DEFAULT_STYLE.inset_image_y,
      logo_url: brandLogoUrl,
      ...newsTemplate,
    };

    return (
      <div className="flex-1 flex overflow-hidden bg-[var(--background)]">

        {/* Center: Preview */}
        <div className="flex-1 flex flex-col items-center justify-start overflow-y-auto py-8 px-6 gap-4">
          <div className="w-full flex items-center justify-between" style={{ maxWidth: 1080 * PREVIEW_SCALE }}>
            <button
              onClick={() => { setEditingTemplateId(null); setStep('choose'); }}
              className="text-gray-900/40 dark:text-white/40 hover:text-gray-900 dark:hover:text-white transition-colors text-sm"
            >
              ← Voltar
            </button>
            <h1 className="text-sm font-bold text-gray-900 dark:text-white">
              {editingTemplateId ? 'Editar template' : 'Novo template'}
            </h1>
            <button
              onClick={async () => {
                if (savingTemplate) return;
                setSavingTemplate(true);
                try {
                  if (editingTemplateId) {
                    await updateTemplateInDb(editingTemplateId, { ...newsTemplate });
                    toast.success('Template atualizado!');
                  } else {
                    const created = await createTemplateInDb({ ...newsTemplate });
                    if (!created) return;
                    toast.success('Template salvo!');
                  }
                  setEditingTemplateId(null);
                  setStep('choose');
                } finally {
                  setSavingTemplate(false);
                }
              }}
              disabled={savingTemplate}
              className="px-4 py-1.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-black text-xs font-bold hover:bg-gray-900/90 dark:hover:bg-white/90 transition-colors disabled:opacity-50"
            >
              {savingTemplate ? 'Salvando…' : 'Salvar'}
            </button>
          </div>

          <div style={{
            width: 1080 * PREVIEW_SCALE,
            height: 1350 * PREVIEW_SCALE,
            overflow: 'hidden',
            borderRadius: 12,
            border: '1px solid rgba(128,128,128,0.15)',
            flexShrink: 0,
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
          }}>
            <div style={{ transform: `scale(${PREVIEW_SCALE})`, transformOrigin: 'top left' }}>
              <NewsCard item={templateCard} scale={1} />
            </div>
          </div>

          <p className="text-[11px] text-gray-900/30 dark:text-white/30 text-center">
            Prévia com texto de exemplo. O estilo será aplicado a todos os cards.
          </p>
        </div>

        {/* Right: Controls */}
        <div className="w-72 shrink-0 border-l border-black/[0.06] dark:border-white/[0.06] flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.06]">
            <span className="text-xs font-semibold text-gray-900/50 dark:text-white/50 uppercase tracking-wider">
              Estilo do template
            </span>
          </div>

          <div className="flex-1 overflow-y-auto flex flex-col gap-5 px-4 py-4">

            {/* LOGO */}
            <p className="text-[10px] font-bold text-gray-900/30 dark:text-white/30 uppercase tracking-widest -mb-2">Logo / Marca</p>
            <BrandLogoSection compact />

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Tamanho</label>
                <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">{newsTemplate.logo_size.toFixed(1)}×</span>
              </div>
              <input type="range" min={0.3} max={4} step={0.1} value={newsTemplate.logo_size}
                onChange={(e) => updateTemplate({ logo_size: Number(e.target.value) })}
                className="w-full accent-gray-900 dark:accent-white" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Posição vertical</label>
                <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">{newsTemplate.logo_y}px</span>
              </div>
              <input type="range" min={0} max={400} step={4} value={newsTemplate.logo_y}
                onChange={(e) => updateTemplate({ logo_y: Number(e.target.value) })}
                className="w-full accent-gray-900 dark:accent-white" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Posição horizontal</label>
                <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">{newsTemplate.logo_x}px</span>
              </div>
              <input type="range" min={0} max={900} step={4} value={newsTemplate.logo_x}
                onChange={(e) => updateTemplate({ logo_x: Number(e.target.value) })}
                className="w-full accent-gray-900 dark:accent-white" />
              <div className="flex justify-between text-[9px] text-gray-900/25 dark:text-white/25 mt-0.5">
                <span>← esq</span><span>dir →</span>
              </div>
            </div>

            <div className="h-px bg-black/[0.06] dark:bg-white/[0.06]" />

            {/* TÍTULO */}
            <p className="text-[10px] font-bold text-gray-900/30 dark:text-white/30 uppercase tracking-widest -mb-2">Estilo do título</p>

            <div>
              <label className="block text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider mb-1.5">Fonte</label>
              <select
                value={newsTemplate.titulo_font}
                onChange={(e) => updateTemplate({ titulo_font: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm border border-black/10 dark:border-white/10 bg-[var(--surface)] text-gray-900 dark:text-white hover:border-black/20 dark:hover:border-white/20 focus:outline-none focus:border-gray-900 dark:focus:border-white transition-colors"
                style={{ fontFamily: newsTemplate.titulo_font, fontWeight: newsTemplate.titulo_weight }}
              >
                {NEWS_TITLE_FONTS.map((f) => (
                  <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Tamanho</label>
                <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">{newsTemplate.titulo_size}px</span>
              </div>
              <input type="range" min={20} max={96} step={1} value={newsTemplate.titulo_size}
                onChange={(e) => updateTemplate({ titulo_size: Number(e.target.value) })}
                className="w-full accent-gray-900 dark:accent-white" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Espaçamento</label>
                <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">{newsTemplate.titulo_letter_spacing}px</span>
              </div>
              <input type="range" min={-5} max={20} step={0.5} value={newsTemplate.titulo_letter_spacing}
                onChange={(e) => updateTemplate({ titulo_letter_spacing: Number(e.target.value) })}
                className="w-full accent-gray-900 dark:accent-white" />
              <div className="flex justify-between text-[9px] text-gray-900/25 dark:text-white/25 mt-0.5">
                <span>−5</span><span>+20</span>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider mb-1.5">Peso</label>
              <div className="grid grid-cols-4 gap-1">
                {FONT_WEIGHTS.map((fw) => (
                  <button key={fw.value}
                    onClick={() => updateTemplate({ titulo_weight: fw.value })}
                    className={`py-1.5 rounded-lg text-[10px] transition-colors border ${
                      newsTemplate.titulo_weight === fw.value
                        ? 'border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-black'
                        : 'border-black/10 dark:border-white/10 text-gray-900/50 dark:text-white/50 hover:border-black/20 dark:hover:border-white/20'
                    }`}
                    style={{ fontWeight: fw.value }}
                  >
                    {fw.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-black/[0.06] dark:bg-white/[0.06]" />

            <p className="text-[10px] font-bold text-gray-900/30 dark:text-white/30 uppercase tracking-widest -mb-2">Estilo do tema</p>

            <div>
              <label className="block text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider mb-1.5">Fonte</label>
              <select
                value={newsTemplate.tema_font}
                onChange={(e) => updateTemplate({ tema_font: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm border border-black/10 dark:border-white/10 bg-[var(--surface)] text-gray-900 dark:text-white hover:border-black/20 dark:hover:border-white/20 focus:outline-none focus:border-gray-900 dark:focus:border-white transition-colors"
                style={{ fontFamily: newsTemplate.tema_font, fontStyle: 'italic' }}
              >
                {NEWS_TEMA_FONTS.map((f) => (
                  <option key={f.value} value={f.value} style={{ fontFamily: f.value, fontStyle: 'italic' }}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Tamanho do tema</label>
                <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">{newsTemplate.tema_size}px</span>
              </div>
              <input type="range" min={14} max={48} step={1} value={newsTemplate.tema_size}
                onChange={(e) => updateTemplate({ tema_size: Number(e.target.value) })}
                className="w-full accent-gray-900 dark:accent-white" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Posição vertical</label>
                <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">{newsTemplate.text_y}px da base</span>
              </div>
              <input type="range" min={20} max={400} step={4} value={newsTemplate.text_y}
                onChange={(e) => updateTemplate({ text_y: Number(e.target.value) })}
                className="w-full accent-gray-900 dark:accent-white" />
              <div className="flex justify-between text-[9px] text-gray-900/25 dark:text-white/25 mt-0.5">
                <span>base</span><span>topo</span>
              </div>
            </div>

            <div className="h-px bg-black/[0.06] dark:bg-white/[0.06]" />

            {/* DEGRADÊ */}
            <p className="text-[10px] font-bold text-gray-900/30 dark:text-white/30 uppercase tracking-widest -mb-2">Degradê</p>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Opacidade</label>
                <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">{newsTemplate.gradient_opacity}%</span>
              </div>
              <input type="range" min={0} max={100} step={1} value={newsTemplate.gradient_opacity}
                onChange={(e) => updateTemplate({ gradient_opacity: Number(e.target.value) })}
                className="w-full accent-gray-900 dark:accent-white" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Tamanho</label>
                <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">{newsTemplate.gradient_size}%</span>
              </div>
              <input type="range" min={10} max={100} step={1} value={newsTemplate.gradient_size}
                onChange={(e) => updateTemplate({ gradient_size: Number(e.target.value) })}
                className="w-full accent-gray-900 dark:accent-white" />
              <div className="flex justify-between text-[9px] text-gray-900/25 dark:text-white/25 mt-0.5">
                <span>pequeno</span><span>grande</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Distância</label>
                <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">{newsTemplate.gradient_distance}%</span>
              </div>
              <input type="range" min={10} max={100} step={1} value={newsTemplate.gradient_distance}
                onChange={(e) => updateTemplate({ gradient_distance: Number(e.target.value) })}
                className="w-full accent-gray-900 dark:accent-white" />
              <div className="flex justify-between text-[9px] text-gray-900/25 dark:text-white/25 mt-0.5">
                <span>compacto</span><span>espalhado</span>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider mb-1.5">Cor</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newsTemplate.gradient_color}
                  onChange={(e) => updateTemplate({ gradient_color: e.target.value })}
                  className="w-8 h-8 rounded cursor-pointer border border-black/10 dark:border-white/10"
                />
                <input
                  type="text"
                  value={newsTemplate.gradient_color}
                  onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) updateTemplate({ gradient_color: e.target.value }); }}
                  className="flex-1 px-2 py-1.5 rounded-lg bg-[var(--surface)] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-xs font-mono focus:outline-none"
                />
              </div>
            </div>

            <button
              onClick={() => setNewsTemplate({ ...DEFAULT_TEMPLATE })}
              className="text-[10px] text-gray-900/30 dark:text-white/30 hover:text-gray-900/60 dark:hover:text-white/60 transition-colors mb-4"
            >
              Resetar para padrão
            </button>

          </div>
        </div>
      </div>
    );
  }

  // ── Render: JSON import step ─────────────────────────────────────────────

  if (step === 'import') {
    return (
      <div className="flex-1 overflow-y-auto bg-[var(--background)]">
        <div className="max-w-2xl mx-auto px-6 py-12">
          <div className="flex items-center gap-3 mb-8">
            <button onClick={() => setStep('choose')} className="text-gray-900/40 dark:text-white/40 hover:text-gray-900 dark:hover:text-white transition-colors text-sm">
              ←
            </button>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Importar JSON</h1>
          </div>

          <BrandLogoSection />

          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-900/50 dark:text-white/50 uppercase tracking-wider">
                JSON das notícias
              </label>
              <button
                onClick={() => jsonFileRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-black/10 dark:border-white/10 text-xs text-gray-900/60 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:border-black/25 dark:hover:border-white/25 transition-colors"
              >
                <FileJson className="w-3.5 h-3.5" />
                Carregar .json
              </button>
              <input ref={jsonFileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleJsonFileUpload} />
            </div>

            <textarea
              className="w-full h-72 px-4 py-3 rounded-xl bg-[var(--surface)] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-xs font-mono placeholder-black/25 dark:placeholder-white/25 focus:outline-none focus:border-black/25 dark:focus:border-white/25 transition-colors resize-none"
              placeholder={EXAMPLE_JSON}
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              spellCheck={false}
            />

            <button
              onClick={handleParse}
              disabled={!jsonInput.trim()}
              className="w-full py-3 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-black text-sm font-bold hover:bg-gray-900/90 dark:hover:bg-white/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Gerar cards →
            </button>

            <p className="text-center text-xs text-gray-900/30 dark:text-white/30">
              Campos: <span className="font-mono">numero, tema, titulo_card, imagem_url, legenda</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Manual creation step ─────────────────────────────────────────

  if (step === 'manual') {
    const canCreate = manualCards.slice(0, manualCount).some(c => c.titulo_card.trim() !== '');
    const countOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    return (
      <div className="flex-1 overflow-y-auto bg-[var(--background)]">
        <div className="max-w-2xl mx-auto px-6 py-12">
          <div className="flex items-center gap-3 mb-8">
            <button onClick={() => setStep('choose')} className="text-gray-900/40 dark:text-white/40 hover:text-gray-900 dark:hover:text-white transition-colors text-sm">
              ←
            </button>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Criar manualmente</h1>
          </div>

          {/* Logo upload */}
          <BrandLogoSection />

          {/* Card count */}
          <div className="mb-8">
            <p className="text-xs font-semibold text-gray-900/50 dark:text-white/50 uppercase tracking-wider mb-3">
              Quantas notícias?
            </p>
            <div className="flex flex-wrap gap-2">
              {countOptions.map(n => (
                <button
                  key={n}
                  onClick={() => setManualCount(n)}
                  className={`w-10 h-10 rounded-xl text-sm font-bold transition-all ${
                    manualCount === n
                      ? 'bg-gray-900 dark:bg-white text-white dark:text-black'
                      : 'bg-[var(--surface)] border border-black/10 dark:border-white/10 text-gray-900/60 dark:text-white/60 hover:border-black/30 dark:hover:border-white/30'
                  }`}
                >
                  {n}
                </button>
              ))}
              {/* Custom input */}
              <div className="flex items-center gap-1.5 bg-[var(--surface)] border border-black/10 dark:border-white/10 rounded-xl px-3 h-10">
                <span className="text-[10px] text-gray-900/30 dark:text-white/30">#</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={!countOptions.includes(manualCount) ? manualCount : ''}
                  placeholder="outro"
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (v > 0 && v <= 50) setManualCount(v);
                  }}
                  className="w-12 bg-transparent text-sm text-gray-900 dark:text-white focus:outline-none placeholder-black/20 dark:placeholder-white/20"
                />
              </div>
            </div>
          </div>

          {/* Per-card fields */}
          <div className="flex flex-col gap-4 mb-8">
            {Array.from({ length: manualCount }, (_, i) => (
              <div key={i} className="rounded-2xl border border-black/8 dark:border-white/8 bg-[var(--surface)] overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-black/6 dark:border-white/6 bg-black/[0.02] dark:bg-white/[0.02]">
                  <span className="w-5 h-5 rounded-md bg-gray-900 dark:bg-white text-white dark:text-black text-[10px] font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-[10px] font-semibold text-gray-900/50 dark:text-white/50 uppercase tracking-wider">
                    Notícia {i + 1}
                  </span>
                </div>
                <div className="p-4 flex flex-col gap-3">
                  <input
                    className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-sm placeholder-black/25 dark:placeholder-white/25 focus:outline-none focus:border-black/25 dark:focus:border-white/25 transition-colors"
                    placeholder="Tema (ex: Política, Tecnologia...)"
                    value={manualCards[i]?.tema || ''}
                    onChange={(e) => updateManualCard(i, { tema: e.target.value })}
                  />
                  <textarea
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-sm placeholder-black/25 dark:placeholder-white/25 focus:outline-none focus:border-black/25 dark:focus:border-white/25 transition-colors resize-none"
                    placeholder="Título da notícia..."
                    value={manualCards[i]?.titulo_card || ''}
                    onChange={(e) => updateManualCard(i, { titulo_card: e.target.value })}
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleCreateManual}
            disabled={!canCreate}
            className="w-full py-3.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-black text-sm font-bold hover:bg-gray-900/90 dark:hover:bg-white/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Criar {manualCount} card{manualCount !== 1 ? 's' : ''} →
          </button>
        </div>
      </div>
    );
  }

  // ── Render: Editor step ──────────────────────────────────────────────────

  const selected = items[selectedIdx];

  return (
    <div className="flex-1 flex overflow-hidden bg-[var(--background)]">

      {/* Left: Card grid */}
      <div className="w-56 shrink-0 border-r border-black/[0.06] dark:border-white/[0.06] flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-900/50 dark:text-white/50 uppercase tracking-wider">
            {items.length} cards
          </span>
          <button
            onClick={() => setStep('choose')}
            className="text-xs text-gray-900/40 dark:text-white/40 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            ← Voltar
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-3 px-3 flex flex-col gap-2">
          {items.map((item, idx) => (
            <button
              key={item.numero}
              onClick={() => setSelectedIdx(idx)}
              className={`relative rounded-lg overflow-hidden border-2 transition-all text-left ${
                idx === selectedIdx
                  ? 'border-gray-900 dark:border-white shadow-md'
                  : 'border-transparent hover:border-black/20 dark:hover:border-white/20'
              }`}
              style={{
                width: 1080 * THUMB_SCALE,
                height: 1350 * THUMB_SCALE,
              }}
            >
              <div style={{ transform: `scale(${THUMB_SCALE})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
                <NewsCard item={item} scale={1} />
              </div>
              {/* Number badge */}
              <div className="absolute top-1 left-1 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                {item.numero}
              </div>
            </button>
          ))}
        </div>

        {/* Save + Download all */}
        <div className="p-3 border-t border-black/[0.06] dark:border-white/[0.06] flex flex-col gap-2">
          <button
            onClick={saveAllCards}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-black/10 dark:border-white/10 text-xs font-bold text-gray-900/60 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:border-black/25 dark:hover:border-white/25 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            Salvar cards
          </button>
          <button
            onClick={downloadAll}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-black text-xs font-bold hover:bg-gray-900/90 dark:hover:bg-white/90 transition-colors"
          >
            <Package className="w-3.5 h-3.5" />
            Baixar todos
          </button>
        </div>
      </div>

      {/* Center: Preview */}
      <div className="flex-1 flex flex-col items-center justify-start overflow-y-auto bg-[var(--background-subtle,var(--background))] py-8 px-6 gap-4">
        {/* Nav */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedIdx(i => Math.max(0, i - 1))}
            disabled={selectedIdx === 0}
            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-gray-900 dark:text-white" />
          </button>
          <span className="text-xs font-medium text-gray-900/50 dark:text-white/50">
            Card {selectedIdx + 1} de {items.length}
          </span>
          <button
            onClick={() => setSelectedIdx(i => Math.min(items.length - 1, i + 1))}
            disabled={selectedIdx === items.length - 1}
            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-gray-900 dark:text-white" />
          </button>
        </div>

        {/* Card preview */}
        <div
          style={{
            width: 1080 * PREVIEW_SCALE,
            height: 1350 * PREVIEW_SCALE,
            overflow: 'hidden',
            borderRadius: 12,
            border: '1px solid rgba(128,128,128,0.15)',
            flexShrink: 0,
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
          }}
        >
          <div ref={previewRef} style={{ transform: `scale(${PREVIEW_SCALE})`, transformOrigin: 'top left' }}>
            <NewsCard item={selected} scale={1} />
          </div>
        </div>

        {/* Download this card */}
        <button
          onClick={() => downloadCard(selectedIdx)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-black text-xs font-bold hover:bg-gray-900/90 dark:hover:bg-white/90 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Baixar este card
        </button>
      </div>

      {/* Right: Editor */}
      <div className="w-72 shrink-0 border-l border-black/[0.06] dark:border-white/[0.06] flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.06]">
          <span className="text-xs font-semibold text-gray-900/50 dark:text-white/50 uppercase tracking-wider">
            Editar — Card {selected.numero}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col gap-5 px-4 py-4">

          {/* ── TEXTO ─────────────────────────────────────────── */}
          <p className="text-[10px] font-bold text-gray-900/30 dark:text-white/30 uppercase tracking-widest -mb-2">Texto</p>

          {/* Tema */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider mb-1.5">
              Tema
            </label>
            <input
              className="w-full px-3 py-2 rounded-lg bg-[var(--surface)] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-black/25 dark:focus:border-white/25 transition-colors"
              value={selected.tema}
              onChange={(e) => updateItem(selectedIdx, { tema: e.target.value })}
            />
          </div>

          {/* Título */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">
                Título
              </label>
              <span className={`text-[9px] font-mono ${selected.titulo_card.length > 100 ? 'text-yellow-500' : 'text-gray-900/25 dark:text-white/25'}`}>
                {selected.titulo_card.length} chars
              </span>
            </div>
            <textarea
              className="w-full px-3 py-2 rounded-lg bg-[var(--surface)] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-black/25 dark:focus:border-white/25 transition-colors resize-none"
              rows={3}
              value={selected.titulo_card}
              onChange={(e) => updateItem(selectedIdx, { titulo_card: e.target.value })}
            />
          </div>

          {/* Legenda */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">
                Legenda Instagram
              </label>
              <button
                onClick={async () => { await navigator.clipboard.writeText(selected.legenda); toast.success('Copiada!'); }}
                className="text-[9px] text-gray-900/35 dark:text-white/35 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                copiar
              </button>
            </div>
            <textarea
              className="w-full px-3 py-2 rounded-lg bg-[var(--surface)] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-xs focus:outline-none focus:border-black/25 dark:focus:border-white/25 transition-colors resize-none"
              rows={4}
              value={selected.legenda}
              onChange={(e) => updateItem(selectedIdx, { legenda: e.target.value })}
            />
          </div>

          <div className="h-px bg-black/[0.06] dark:bg-white/[0.06]" />

          {/* ── ESTILO DO TÍTULO ──────────────────────────────── */}
          <p className="text-[10px] font-bold text-gray-900/30 dark:text-white/30 uppercase tracking-widest -mb-2">Estilo do título</p>

          {/* Tamanho */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Tamanho</label>
              <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">{selected.titulo_size}px</span>
            </div>
            <input type="range" min={20} max={96} step={1} value={selected.titulo_size}
              onChange={(e) => updateItem(selectedIdx, { titulo_size: Number(e.target.value) })}
              className="w-full accent-gray-900 dark:accent-white" />
          </div>

          {/* Espaçamento de letras */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Espaçamento</label>
              <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">{selected.titulo_letter_spacing}px</span>
            </div>
            <input type="range" min={-5} max={20} step={0.5} value={selected.titulo_letter_spacing}
              onChange={(e) => updateItem(selectedIdx, { titulo_letter_spacing: Number(e.target.value) })}
              className="w-full accent-gray-900 dark:accent-white" />
            <div className="flex justify-between text-[9px] text-gray-900/25 dark:text-white/25 mt-0.5">
              <span>−5</span><span>+20</span>
            </div>
          </div>

          {/* Peso */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider mb-1.5">Peso</label>
            <div className="grid grid-cols-4 gap-1">
              {FONT_WEIGHTS.map((fw) => (
                <button key={fw.value}
                  onClick={() => updateItem(selectedIdx, { titulo_weight: fw.value })}
                  className={`py-1.5 rounded-lg text-[10px] transition-colors border ${
                    selected.titulo_weight === fw.value
                      ? 'border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-black'
                      : 'border-black/10 dark:border-white/10 text-gray-900/50 dark:text-white/50 hover:border-black/20 dark:hover:border-white/20'
                  }`}
                  style={{ fontWeight: fw.value }}
                >
                  {fw.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tamanho tema */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Tamanho do tema</label>
              <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">{selected.tema_size}px</span>
            </div>
            <input type="range" min={14} max={48} step={1} value={selected.tema_size}
              onChange={(e) => updateItem(selectedIdx, { tema_size: Number(e.target.value) })}
              className="w-full accent-gray-900 dark:accent-white" />
          </div>

          {/* Posição vertical do texto */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Posição vertical</label>
              <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">{selected.text_y}px da base</span>
            </div>
            <input type="range" min={20} max={400} step={4} value={selected.text_y}
              onChange={(e) => updateItem(selectedIdx, { text_y: Number(e.target.value) })}
              className="w-full accent-gray-900 dark:accent-white" />
            <div className="flex justify-between text-[9px] text-gray-900/25 dark:text-white/25 mt-0.5">
              <span>base</span><span>topo</span>
            </div>
          </div>

          <div className="h-px bg-black/[0.06] dark:bg-white/[0.06]" />

          {/* ── LOGO ─────────────────────────────────────────── */}
          <p className="text-[10px] font-bold text-gray-900/30 dark:text-white/30 uppercase tracking-widest -mb-2">Logo / Marca</p>

          {/* Upload / swap logo */}
          <BrandLogoSection compact />

          {/* Tamanho da logo */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Tamanho</label>
              <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">{selected.logo_size.toFixed(1)}×</span>
            </div>
            <input type="range" min={0.3} max={4} step={0.1} value={selected.logo_size}
              onChange={(e) => updateItem(selectedIdx, { logo_size: Number(e.target.value) })}
              className="w-full accent-gray-900 dark:accent-white" />
            <div className="flex justify-between text-[9px] text-gray-900/25 dark:text-white/25 mt-0.5">
              <span>0.3×</span><span>4×</span>
            </div>
          </div>

          {/* Posição vertical da logo */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Posição vertical</label>
              <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">{selected.logo_y}px do topo</span>
            </div>
            <input type="range" min={0} max={400} step={4} value={selected.logo_y}
              onChange={(e) => updateItem(selectedIdx, { logo_y: Number(e.target.value) })}
              className="w-full accent-gray-900 dark:accent-white" />
            <div className="flex justify-between text-[9px] text-gray-900/25 dark:text-white/25 mt-0.5">
              <span>topo</span><span>base</span>
            </div>
          </div>

          <div className="h-px bg-black/[0.06] dark:bg-white/[0.06]" />

          {/* ── IMAGEM DE FUNDO ───────────────────────────────── */}
          <p className="text-[10px] font-bold text-gray-900/30 dark:text-white/30 uppercase tracking-widest -mb-2">Imagem de fundo</p>

          {/* URL editável */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider mb-1.5">
              URL da imagem
            </label>
            <div className="flex items-center gap-1.5">
              <input
                className="flex-1 min-w-0 px-2.5 py-2 rounded-lg bg-[var(--surface)] border border-black/10 dark:border-white/10 text-[10px] font-mono text-gray-900 dark:text-white placeholder-black/25 dark:placeholder-white/25 focus:outline-none focus:border-black/25 dark:focus:border-white/25 transition-colors"
                placeholder="https://..."
                value={selected.imagem_url}
                onChange={(e) => updateItem(selectedIdx, { imagem_url: e.target.value })}
                spellCheck={false}
              />
              {selected.imagem_url && (
                <a
                  href={selected.imagem_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5 text-gray-900/40 dark:text-white/40 hover:text-gray-900 dark:hover:text-white transition-colors"
                  title="Abrir URL"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>

          {/* Local upload */}
          {selected.localImageUrl ? (
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-cover bg-center border border-black/10 dark:border-white/10 shrink-0"
                style={{ backgroundImage: `url(${selected.localImageUrl})` }} />
              <span className="text-[10px] text-gray-900/50 dark:text-white/50 flex-1">Upload local</span>
              <button onClick={handleRemoveImage}
                className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 text-gray-900/40 dark:text-white/40 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-black/15 dark:border-white/15 text-[10px] text-gray-900/40 dark:text-white/40 hover:border-black/30 dark:hover:border-white/30 hover:text-gray-900/60 dark:hover:text-white/60 transition-colors">
              <Upload className="w-3 h-3" />
              Substituir por upload local
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

          {/* Zoom da imagem */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Zoom</label>
              <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">
                {selected.image_scale === 1 ? 'auto' : `${Math.round(selected.image_scale * 100)}%`}
              </span>
            </div>
            <input type="range" min={0.5} max={3} step={0.05} value={selected.image_scale}
              onChange={(e) => updateItem(selectedIdx, { image_scale: Number(e.target.value) })}
              className="w-full accent-gray-900 dark:accent-white" />
            <div className="flex justify-between text-[9px] text-gray-900/25 dark:text-white/25 mt-0.5">
              <span>50%</span><span>300%</span>
            </div>
          </div>

          {/* Mover horizontal */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Mover horizontal</label>
              <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">{selected.image_x > 0 ? '+' : ''}{selected.image_x}px</span>
            </div>
            <input type="range" min={-540} max={540} step={10} value={selected.image_x}
              onChange={(e) => updateItem(selectedIdx, { image_x: Number(e.target.value) })}
              className="w-full accent-gray-900 dark:accent-white" />
            <div className="flex justify-between text-[9px] text-gray-900/25 dark:text-white/25 mt-0.5">
              <span>← esq</span><span>dir →</span>
            </div>
          </div>

          {/* Mover vertical */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Mover vertical</label>
              <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">{selected.image_y > 0 ? '+' : ''}{selected.image_y}px</span>
            </div>
            <input type="range" min={-675} max={675} step={10} value={selected.image_y}
              onChange={(e) => updateItem(selectedIdx, { image_y: Number(e.target.value) })}
              className="w-full accent-gray-900 dark:accent-white" />
            <div className="flex justify-between text-[9px] text-gray-900/25 dark:text-white/25 mt-0.5">
              <span>↑ cima</span><span>baixo ↓</span>
            </div>
          </div>

          <div className="h-px bg-black/[0.06] dark:bg-white/[0.06]" />

          {/* ── DEGRADÊ ───────────────────────────────────────── */}
          <p className="text-[10px] font-bold text-gray-900/30 dark:text-white/30 uppercase tracking-widest -mb-2">Degradê</p>

          {/* Opacidade */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Opacidade</label>
              <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">{selected.gradient_opacity}%</span>
            </div>
            <input type="range" min={0} max={100} step={1} value={selected.gradient_opacity}
              onChange={(e) => updateItem(selectedIdx, { gradient_opacity: Number(e.target.value) })}
              className="w-full accent-gray-900 dark:accent-white" />
          </div>

          {/* Tamanho */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Tamanho</label>
              <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">{selected.gradient_size}%</span>
            </div>
            <input type="range" min={10} max={100} step={1} value={selected.gradient_size}
              onChange={(e) => updateItem(selectedIdx, { gradient_size: Number(e.target.value) })}
              className="w-full accent-gray-900 dark:accent-white" />
            <div className="flex justify-between text-[9px] text-gray-900/25 dark:text-white/25 mt-0.5">
              <span>pequeno</span><span>grande</span>
            </div>
          </div>

          {/* Distância */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Distância</label>
              <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">{selected.gradient_distance}%</span>
            </div>
            <input type="range" min={10} max={100} step={1} value={selected.gradient_distance}
              onChange={(e) => updateItem(selectedIdx, { gradient_distance: Number(e.target.value) })}
              className="w-full accent-gray-900 dark:accent-white" />
            <div className="flex justify-between text-[9px] text-gray-900/25 dark:text-white/25 mt-0.5">
              <span>compacto</span><span>espalhado</span>
            </div>
          </div>

          {/* Cor */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider mb-1.5">Cor</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={selected.gradient_color}
                onChange={(e) => updateItem(selectedIdx, { gradient_color: e.target.value })}
                className="w-8 h-8 rounded cursor-pointer border border-black/10 dark:border-white/10"
              />
              <input
                type="text"
                value={selected.gradient_color}
                onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) updateItem(selectedIdx, { gradient_color: e.target.value }); }}
                className="flex-1 px-2 py-1.5 rounded-lg bg-[var(--surface)] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-xs font-mono focus:outline-none"
              />
            </div>
          </div>

          {/* Reset */}
          <button
            onClick={() => updateItem(selectedIdx, { ...DEFAULT_STYLE })}
            className="text-[10px] text-gray-900/30 dark:text-white/30 hover:text-gray-900/60 dark:hover:text-white/60 transition-colors"
          >
            Resetar todos os estilos
          </button>

          <div className="h-px bg-black/[0.06] dark:bg-white/[0.06]" />

          {/* ── DESTAQUE CIRCULAR ─────────────────────────────── */}
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-gray-900/30 dark:text-white/30 uppercase tracking-widest">Destaque circular</p>
            <button
              onClick={() => updateItem(selectedIdx, { inset_enabled: !selected.inset_enabled })}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                selected.inset_enabled ? 'bg-gray-900 dark:bg-white' : 'bg-black/15 dark:bg-white/15'
              }`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white dark:bg-black transition-all ${
                selected.inset_enabled ? 'left-[18px]' : 'left-0.5'
              }`} />
            </button>
          </div>

          {/* Upload imagem do inset */}
          {selected.inset_image_url ? (
            <div className="flex items-center gap-2">
              <div
                className="w-10 h-10 rounded-full border-2 border-white dark:border-gray-900 bg-cover bg-center shrink-0"
                style={{ backgroundImage: `url(${selected.inset_image_url})` }}
              />
              <span className="text-[10px] text-gray-900/50 dark:text-white/50 flex-1">Imagem carregada</span>
              <button
                onClick={handleRemoveInsetImage}
                className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 text-gray-900/40 dark:text-white/40 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => insetFileRef.current?.click()}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-black/15 dark:border-white/15 text-[10px] text-gray-900/40 dark:text-white/40 hover:border-black/30 dark:hover:border-white/30 hover:text-gray-900/60 dark:hover:text-white/60 transition-colors"
            >
              <Upload className="w-3 h-3" />
              Adicionar imagem circular
            </button>
          )}
          <input ref={insetFileRef} type="file" accept="image/*" className="hidden" onChange={handleInsetImageUpload} />

          {selected.inset_enabled && (
            <>
              {/* Tamanho do círculo */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Tamanho do círculo</label>
                  <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">{selected.inset_size}px</span>
                </div>
                <input type="range" min={80} max={600} step={10} value={selected.inset_size}
                  onChange={(e) => updateItem(selectedIdx, { inset_size: Number(e.target.value) })}
                  className="w-full accent-gray-900 dark:accent-white" />
                <div className="flex justify-between text-[9px] text-gray-900/25 dark:text-white/25 mt-0.5">
                  <span>pequeno</span><span>grande</span>
                </div>
              </div>

              {/* Posição X */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Posição X</label>
                  <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">{selected.inset_x}px</span>
                </div>
                <input type="range" min={-200} max={900} step={5} value={selected.inset_x}
                  onChange={(e) => updateItem(selectedIdx, { inset_x: Number(e.target.value) })}
                  className="w-full accent-gray-900 dark:accent-white" />
                <div className="flex justify-between text-[9px] text-gray-900/25 dark:text-white/25 mt-0.5">
                  <span>← esq</span><span>dir →</span>
                </div>
              </div>

              {/* Posição Y */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Posição Y</label>
                  <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">{selected.inset_y}px</span>
                </div>
                <input type="range" min={-200} max={1200} step={5} value={selected.inset_y}
                  onChange={(e) => updateItem(selectedIdx, { inset_y: Number(e.target.value) })}
                  className="w-full accent-gray-900 dark:accent-white" />
                <div className="flex justify-between text-[9px] text-gray-900/25 dark:text-white/25 mt-0.5">
                  <span>↑ cima</span><span>baixo ↓</span>
                </div>
              </div>

              <div className="h-px bg-black/[0.06] dark:bg-white/[0.06]" />

              {/* Zoom da imagem dentro do círculo */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Zoom da imagem</label>
                  <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">{Math.round(selected.inset_image_zoom * 100)}%</span>
                </div>
                <input type="range" min={0.3} max={4} step={0.05} value={selected.inset_image_zoom}
                  onChange={(e) => updateItem(selectedIdx, { inset_image_zoom: Number(e.target.value) })}
                  className="w-full accent-gray-900 dark:accent-white" />
                <div className="flex justify-between text-[9px] text-gray-900/25 dark:text-white/25 mt-0.5">
                  <span>30%</span><span>400%</span>
                </div>
              </div>

              {/* Offset X da imagem */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Imagem — horizontal</label>
                  <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">{selected.inset_image_x > 0 ? '+' : ''}{selected.inset_image_x}px</span>
                </div>
                <input type="range" min={-400} max={400} step={5} value={selected.inset_image_x}
                  onChange={(e) => updateItem(selectedIdx, { inset_image_x: Number(e.target.value) })}
                  className="w-full accent-gray-900 dark:accent-white" />
                <div className="flex justify-between text-[9px] text-gray-900/25 dark:text-white/25 mt-0.5">
                  <span>← esq</span><span>dir →</span>
                </div>
              </div>

              {/* Offset Y da imagem */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Imagem — vertical</label>
                  <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">{selected.inset_image_y > 0 ? '+' : ''}{selected.inset_image_y}px</span>
                </div>
                <input type="range" min={-400} max={400} step={5} value={selected.inset_image_y}
                  onChange={(e) => updateItem(selectedIdx, { inset_image_y: Number(e.target.value) })}
                  className="w-full accent-gray-900 dark:accent-white" />
                <div className="flex justify-between text-[9px] text-gray-900/25 dark:text-white/25 mt-0.5">
                  <span>↑ cima</span><span>baixo ↓</span>
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
