'use client';

import { useRef, useState, useCallback } from 'react';
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
} from 'lucide-react';
import toast from 'react-hot-toast';
import NewsCard, { NewsCardItem, DEFAULT_STYLE, parseNewsJSON } from '@/components/news/NewsCard';

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
      // Fallback gradient when image can't be loaded
      const fg = ctx.createLinearGradient(0, 0, W, H);
      fg.addColorStop(0, '#1a1a2e'); fg.addColorStop(0.5, '#16213e'); fg.addColorStop(1, '#0f3460');
      ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H);
    }
  } else {
    const fg = ctx.createLinearGradient(0, 0, W, H);
    fg.addColorStop(0, '#1a1a2e'); fg.addColorStop(0.5, '#16213e'); fg.addColorStop(1, '#0f3460');
    ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H);
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
  try {
    const logo = await loadImg('/theArkeNews-logo.png');
    const lh = Math.round(46 * item.logo_size);
    const lw = Math.round((logo.width / logo.height) * lh);
    ctx.drawImage(logo, 52, item.logo_y, lw, lh);
  } catch { /* logo not critical */ }

  // ── Text ────────────────────────────────────────────────────────────────────
  await document.fonts.ready;

  const PAD = 52;
  const maxTextW = W - PAD * 2; // 976px

  const temaFont  = `italic 500 ${item.tema_size}px 'IvyOra Text', Georgia, serif`;
  const titleFont = `${item.titulo_weight} ${item.titulo_size}px 'SF Pro Display', -apple-system, 'Helvetica Neue', Arial, sans-serif`;
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
  return canvas;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const THUMB_SCALE = 0.18;
const PREVIEW_SCALE = 0.38;

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

export default function NewsPage() {
  const [step, setStep] = useState<'import' | 'editor'>('import');
  const [jsonInput, setJsonInput] = useState('');
  const [items, setItems] = useState<NewsCardItem[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [localImages, setLocalImages] = useState<Record<number, string>>({});

  const previewRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonFileRef = useRef<HTMLInputElement>(null);

  // ── Import ────────────────────────────────────────────────────────────────

  const handleParse = () => {
    try {
      const parsed = parseNewsJSON(jsonInput.trim());
      if (parsed.length === 0) throw new Error('Array vazio');
      setItems(parsed);
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

  // ── Item updater ──────────────────────────────────────────────────────────

  const updateItem = useCallback((idx: number, patch: Partial<NewsCardItem>) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
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

  // ── Render: Import step ──────────────────────────────────────────────────

  if (step === 'import') {
    return (
      <div className="flex-1 overflow-y-auto bg-[var(--background)]">
        <div className="max-w-2xl mx-auto px-6 py-12">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-xl bg-gray-900 dark:bg-white flex items-center justify-center">
              <Newspaper className="w-4 h-4 text-white dark:text-black" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Arke News Cards</h1>
          </div>
          <p className="text-gray-900/50 dark:text-white/50 text-sm mb-8">
            Cole o JSON com as 10 notícias para gerar os cards automaticamente.
          </p>

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
                Carregar arquivo .json
              </button>
              <input ref={jsonFileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleJsonFileUpload} />
            </div>

            <textarea
              className="w-full h-80 px-4 py-3 rounded-xl bg-[var(--surface)] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-xs font-mono placeholder-black/25 dark:placeholder-white/25 focus:outline-none focus:border-black/25 dark:focus:border-white/25 transition-colors resize-none"
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
              Carregar notícias →
            </button>

            <p className="text-center text-xs text-gray-900/30 dark:text-white/30">
              Campos esperados: <span className="font-mono">numero, tema, titulo_card, imagem_url, legenda</span>
            </p>
          </div>
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
            onClick={() => { setStep('import'); }}
            className="text-xs text-gray-900/40 dark:text-white/40 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            ← Reimportar
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

        {/* Download all */}
        <div className="p-3 border-t border-black/[0.06] dark:border-white/[0.06]">
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
          <p className="text-[10px] font-bold text-gray-900/30 dark:text-white/30 uppercase tracking-widest -mb-2">Logo</p>

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

          {/* ── CARD ─────────────────────────────────────────── */}
          <p className="text-[10px] font-bold text-gray-900/30 dark:text-white/30 uppercase tracking-widest -mb-2">Card</p>

          {/* Border radius */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider">Curva</label>
              <span className="text-[10px] font-mono text-gray-900/50 dark:text-white/50">{selected.card_radius}px</span>
            </div>
            <input type="range" min={0} max={80} step={2} value={selected.card_radius}
              onChange={(e) => updateItem(selectedIdx, { card_radius: Number(e.target.value) })}
              className="w-full accent-gray-900 dark:accent-white" />
          </div>

          <div className="h-px bg-black/[0.06] dark:bg-white/[0.06]" />

          {/* ── IMAGEM DE FUNDO ───────────────────────────────── */}
          <p className="text-[10px] font-bold text-gray-900/30 dark:text-white/30 uppercase tracking-widest -mb-2">Imagem de fundo</p>

          {/* URL clicável */}
          {selected.imagem_url && (
            <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-[var(--surface)] border border-black/[0.06] dark:border-white/[0.06]">
              <span className="text-[10px] text-gray-900/40 dark:text-white/40 truncate flex-1 font-mono">
                {selected.imagem_url}
              </span>
              <a
                href={selected.imagem_url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 text-gray-900/40 dark:text-white/40 hover:text-gray-900 dark:hover:text-white transition-colors"
                title="Abrir URL"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

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

        </div>
      </div>
    </div>
  );
}
