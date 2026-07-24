'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Clapperboard,
  Download,
  Upload,
  Video,
  Play,
  Pause,
  Volume2,
  VolumeX,
  X,
  Plus,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import ReelCard, { REEL_WIDTH } from '@/components/reels/ReelCard';
import { DEFAULT_REEL, REEL_FORMAT, formatReelDuration, stripHandle, type ReelData } from '@/lib/reels';
import {
  validateVideoMeta,
  isAllowedVideoMime,
  extForMime,
  MAX_VIDEO_DURATION_SEC,
  type AllowedVideoMime,
} from '@/lib/reels-media';
import { composeReelVideo, sanitizeReelFilename } from '@/lib/reels-export';
import { getFormat } from '@/lib/formats';
import { createClient } from '@/lib/supabase';

const REELS_BUCKET = 'postflow-reels';
const PREVIEW_SCALE = 0.34;
const SIGNED_URL_TTL = 60 * 60; // 1h de validade para a URL de playback
// Faixa do slider de posição vertical (px no espaço 1080). O layout ainda
// clampa ao espaço preto livre — este é só o alcance do controle.
const CONTENT_OFFSET_RANGE = 500;

/** Mede duração e dimensões nativas do vídeo via um <video> temporário. */
function probeVideo(file: File): Promise<{ durationSec: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    const cleanup = () => URL.revokeObjectURL(url);
    video.onloadedmetadata = () => {
      const meta = {
        durationSec: video.duration || 0,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
      };
      cleanup();
      resolve(meta);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('Não foi possível ler o vídeo. Arquivo corrompido ou não suportado.'));
    };
    video.src = url;
  });
}

type SavedReelRow = {
  id: string;
  name: string;
  handle: string;
  caption: string;
  avatar_url: string;
  verified: boolean;
  format: string;
  muted: boolean;
  content_offset_y: number | null;
  video_path: string;
  video_mime: string;
  video_width: number | null;
  video_height: number | null;
  video_duration_sec: number | null;
  video_size_bytes: number | null;
};

export default function ReelsPage() {
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [savedReels, setSavedReels] = useState<SavedReelRow[]>([]);
  // Posters do card da lista: signed URL do 1º frame do vídeo (#t=0.1), por id.
  // Carregado de forma preguiçosa (não bloqueia a UI da lista).
  const [posterUrls, setPosterUrls] = useState<Record<string, string>>({});

  const [reel, setReel] = useState<ReelData>({ ...DEFAULT_REEL });
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  // Modal de download (nome do arquivo + barra de progresso fiel).
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportName, setExportName] = useState('');

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  // Cabeçalho em tamanho real (escondido) — é o que o export rasteriza p/ PNG.
  const exportHeaderRef = useRef<HTMLDivElement>(null);

  // ── Load session + profile prefill + saved reels ──────────────────────────
  const loadReels = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('reels')
      .select(
        'id, name, handle, caption, avatar_url, verified, format, muted, content_offset_y, video_path, video_mime, video_width, video_height, video_duration_sec, video_size_bytes',
      )
      .eq('status', 'draft')
      .order('updated_at', { ascending: false })
      .limit(100);
    setSavedReels((data as SavedReelRow[] | null) ?? []);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user || !active) {
        if (active) setLoading(false);
        return;
      }
      setUserId(user.id);

      const [{ data: profile }] = await Promise.all([
        supabase
          .from('profiles')
          .select('brand_name, name, instagram_handle, news_instagram_handle, photo_url, brand_logo_url')
          .eq('id', user.id)
          .single(),
        loadReels(),
      ]);

      if (!active) return;
      if (profile) {
        setReel((prev) => ({
          ...prev,
          name: prev.name || profile.brand_name?.trim() || profile.name?.trim() || '',
          handle:
            prev.handle ||
            stripHandle(profile.news_instagram_handle || profile.instagram_handle || ''),
          avatarUrl: prev.avatarUrl || profile.photo_url?.trim() || profile.brand_logo_url?.trim() || undefined,
        }));
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [loadReels]);

  // Gera as signed URLs de poster (1º frame) para os reels com vídeo — em lote,
  // assíncrono, sem travar a renderização da lista. Só busca o que ainda falta.
  useEffect(() => {
    const pending = savedReels.filter((r) => r.video_path && !posterUrls[r.id]);
    if (pending.length === 0) return;
    let active = true;
    (async () => {
      const supabase = createClient();
      const entries = await Promise.all(
        pending.map(async (r) => {
          const { data } = await supabase.storage.from(REELS_BUCKET).createSignedUrl(r.video_path, SIGNED_URL_TTL);
          // Fragmento de mídia: mostra o frame ~0.1s sem autoplay/som.
          return [r.id, data?.signedUrl ? `${data.signedUrl}#t=0.1` : ''] as const;
        }),
      );
      if (!active) return;
      setPosterUrls((prev) => {
        const next = { ...prev };
        for (const [id, url] of entries) if (url) next[id] = url;
        return next;
      });
    })();
    return () => {
      active = false;
    };
  }, [savedReels, posterUrls]);

  const patch = useCallback((p: Partial<ReelData>) => setReel((prev) => ({ ...prev, ...p })), []);

  // ── Avatar upload (imagem → bucket público postflow-assets, como o logo) ───
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (avatarInputRef.current) avatarInputRef.current.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('O avatar precisa ser uma imagem.');
      return;
    }
    if (!userId) {
      toast.error('Sessão ainda carregando. Tente de novo em instantes.');
      return;
    }
    const loadingId = toast.loading('Enviando avatar…');
    try {
      const supabase = createClient();
      const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
      const path = `${userId}/reels-avatar/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('postflow-assets')
        .upload(path, file, { cacheControl: '3600', upsert: true, contentType: file.type || undefined });
      if (error) throw error;
      const { data } = supabase.storage.from('postflow-assets').getPublicUrl(path);
      patch({ avatarUrl: data?.publicUrl });
      toast.success('Avatar atualizado', { id: loadingId });
    } catch (err) {
      console.error('[reels] avatar upload', err);
      toast.error(err instanceof Error ? err.message : 'Falha ao enviar avatar', { id: loadingId });
    }
  };

  // ── Video upload (DIRETO pro Storage via signed URL) ──────────────────────
  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (videoInputRef.current) videoInputRef.current.value = '';
    if (!file) return;
    if (!userId) {
      toast.error('Sessão ainda carregando. Tente de novo em instantes.');
      return;
    }

    // 1) Validação client-side: MIME + tamanho (síncrono).
    const preCheck = validateVideoMeta({ mime: file.type, sizeBytes: file.size });
    if (!preCheck.ok) {
      toast.error(preCheck.error || 'Vídeo inválido.');
      return;
    }
    if (!isAllowedVideoMime(file.type)) {
      toast.error('Formato inválido. Aceita apenas MP4 ou WebM.');
      return;
    }
    const mime = file.type as AllowedVideoMime;

    setUploading(true);
    const loadingId = toast.loading('Validando vídeo…');
    try {
      // 2) Duração + dimensões (precisa do DOM).
      const probe = await probeVideo(file);
      const metaCheck = validateVideoMeta({
        mime,
        sizeBytes: file.size,
        durationSec: probe.durationSec,
        width: probe.width,
        height: probe.height,
      });
      if (!metaCheck.ok) {
        toast.error(metaCheck.error || 'Vídeo fora dos limites.', { id: loadingId });
        setUploading(false);
        return;
      }

      // 3) Pede a signed upload URL (rota valida e deriva o path do user.id).
      toast.loading('Preparando upload…', { id: loadingId });
      const res = await fetch('/api/reels/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mime, sizeBytes: file.size }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Não foi possível preparar o upload.');
      }
      const { path, token } = (await res.json()) as { path: string; token: string };

      // 4) Upload direto pro Storage (não passa por rota serverless).
      toast.loading('Enviando vídeo…', { id: loadingId });
      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from(REELS_BUCKET)
        .uploadToSignedUrl(path, token, file);
      if (upErr) throw upErr;

      // 5) URL assinada de leitura para tocar no editor.
      const { data: signed } = await supabase.storage.from(REELS_BUCKET).createSignedUrl(path, SIGNED_URL_TTL);

      // Trocar o vídeo NÃO pode perder texto/branding — só mexemos nos campos de vídeo.
      patch({
        videoUrl: signed?.signedUrl,
        videoPath: path,
        videoMime: mime,
        videoWidth: probe.width,
        videoHeight: probe.height,
        videoDurationSec: probe.durationSec,
        videoSizeBytes: file.size,
      });
      toast.success('Vídeo pronto!', { id: loadingId });
    } catch (err) {
      console.error('[reels] video upload', err);
      toast.error(err instanceof Error ? err.message : 'Falha ao enviar vídeo', { id: loadingId });
    } finally {
      setUploading(false);
    }
  };

  // ── Persist (metadados por usuário, via RLS) ──────────────────────────────
  const saveReel = useCallback(async (): Promise<string | null> => {
    if (!userId) return null;
    const supabase = createClient();
    const row = {
      name: reel.name,
      handle: reel.handle,
      caption: reel.caption,
      avatar_url: reel.avatarUrl ?? '',
      verified: reel.verified,
      format: reel.format,
      muted: reel.muted,
      content_offset_y: Math.round(reel.contentOffsetY ?? 0),
      video_path: reel.videoPath ?? '',
      video_mime: reel.videoMime ?? '',
      video_width: reel.videoWidth ?? null,
      video_height: reel.videoHeight ?? null,
      video_duration_sec: reel.videoDurationSec ?? null,
      video_size_bytes: reel.videoSizeBytes ?? null,
      status: 'draft',
    };
    if (reel.dbId) {
      const { error } = await supabase.from('reels').update(row).eq('id', reel.dbId);
      if (error) {
        console.error('[reels] update', error);
        toast.error('Erro ao salvar o reel.');
        return null;
      }
      return reel.dbId;
    }
    const { data, error } = await supabase.from('reels').insert(row).select('id').single();
    if (error || !data) {
      console.error('[reels] insert', error);
      toast.error('Erro ao salvar o reel.');
      return null;
    }
    patch({ dbId: data.id });
    return data.id;
  }, [reel, userId, patch]);

  const handleSave = async () => {
    const id = await saveReel();
    if (id) {
      toast.success('Reel salvo!');
      loadReels();
    }
  };

  // ── Preview controls ──────────────────────────────────────────────────────
  const togglePlay = () => {
    const v = previewVideoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().then(() => setIsPlaying(true)).catch(() => undefined);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  useEffect(() => {
    const v = previewVideoRef.current;
    if (v) v.muted = reel.muted;
  }, [reel.muted, reel.videoUrl]);

  // ── Export: header PNG (html2canvas) + overlay via ffmpeg.wasm ─────────────
  // Passo 1: abre o modal de download (pede o nome). Não começa a codificar.
  const openExportModal = () => {
    if (!reel.videoUrl) {
      toast.error('Envie um vídeo antes de exportar.');
      return;
    }
    if (!exportHeaderRef.current) {
      toast.error('Preview ainda carregando. Tente de novo em instantes.');
      return;
    }
    // Rafael quer o campo VAZIO: o usuário digita o nome. No submit, se ficar
    // vazio, `sanitizeReelFilename('')` cai no fallback 'reel.mp4'.
    setExportName('');
    setExportPct(0);
    setShowExportModal(true);
  };

  // Passo 2: confirma o nome e roda o encode. Modal fica travado em loading com
  // a barra de progresso FIEL (ffmpeg.on('progress')) até o download disparar.
  const runExport = async () => {
    if (exporting) return;
    const headerNode = exportHeaderRef.current;
    if (!reel.videoUrl || !headerNode) return;

    const filename = sanitizeReelFilename(exportName);
    setExporting(true);
    setExportPct(0);
    try {
      // 1) Rasteriza o cabeçalho em tamanho real (1080 de largura).
      const { default: html2canvas } = await import('html2canvas');
      const headerCanvas = await html2canvas(headerNode, {
        width: REEL_WIDTH,
        backgroundColor: '#000000',
        scale: 1,
        useCORS: true,
      });
      const headerPng: Blob = await new Promise((resolve, reject) =>
        headerCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar o card'))), 'image/png'),
      );

      // 2) Baixa o vídeo enviado como Blob (signed URL ou blob local).
      const videoBlob = await fetch(reel.videoUrl).then((r) => {
        if (!r.ok) throw new Error('Não foi possível carregar o vídeo enviado.');
        return r.blob();
      });

      // 3) Overlay via ffmpeg.wasm -> MP4 (barra fiel via onProgress). O layout
      //    (bloco centrado, letterbox simétrico) sai da MESMA computeReelLayout
      //    do preview: passamos a altura do header rasterizado + dims nativas.
      const mp4 = await composeReelVideo({
        videoBlob,
        videoExt: reel.videoMime ? extForMime(reel.videoMime as AllowedVideoMime) : 'mp4',
        headerPng,
        headerHeight: headerCanvas.height,
        videoWidth: reel.videoWidth,
        videoHeight: reel.videoHeight,
        offsetY: reel.contentOffsetY,
        muted: reel.muted,
        onProgress: (r) => setExportPct(Math.round(r * 100)),
      });

      if (!mp4 || mp4.size === 0) throw new Error('O encode não produziu vídeo.');

      // 4) Dispara o download com o nome escolhido e fecha o modal.
      const { saveAs } = await import('file-saver');
      saveAs(mp4, filename);
      toast.success('Reel baixado!');
      setShowExportModal(false);
    } catch (err) {
      console.error('[reels] export', err);
      toast.error(err instanceof Error ? err.message : 'Erro ao exportar o reel');
    } finally {
      setExporting(false);
      setExportPct(0);
    }
  };

  // ── List actions ──────────────────────────────────────────────────────────
  const openNew = () => {
    setReel((prev) => ({
      ...DEFAULT_REEL,
      // preserva branding já preenchido pelo perfil
      name: prev.name,
      handle: prev.handle,
      avatarUrl: prev.avatarUrl,
    }));
    setView('editor');
  };

  const openReel = async (row: SavedReelRow) => {
    let videoUrl: string | undefined;
    if (row.video_path) {
      const supabase = createClient();
      const { data } = await supabase.storage.from(REELS_BUCKET).createSignedUrl(row.video_path, SIGNED_URL_TTL);
      videoUrl = data?.signedUrl;
    }
    setReel({
      dbId: row.id,
      name: row.name,
      handle: row.handle,
      caption: row.caption,
      avatarUrl: row.avatar_url || undefined,
      verified: row.verified,
      format: REEL_FORMAT,
      muted: row.muted,
      contentOffsetY: row.content_offset_y ?? 0,
      videoUrl,
      videoPath: row.video_path || undefined,
      videoMime: row.video_mime || undefined,
      videoWidth: row.video_width ?? undefined,
      videoHeight: row.video_height ?? undefined,
      videoDurationSec: row.video_duration_sec ?? undefined,
      videoSizeBytes: row.video_size_bytes ?? undefined,
    });
    setView('editor');
  };

  const deleteReel = async (row: SavedReelRow) => {
    const supabase = createClient();
    const { error } = await supabase.from('reels').delete().eq('id', row.id);
    if (error) {
      toast.error('Erro ao remover o reel.');
      return;
    }
    setSavedReels((prev) => prev.filter((r) => r.id !== row.id));
    toast.success('Reel removido');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto" style={{ background: 'var(--paper)' }}>
        <div className="max-w-5xl mx-auto px-8 py-14 animate-pulse">
          <div className="h-3 w-32 rounded bg-black/10 dark:bg-white/10 mb-5" />
          <div className="h-12 w-72 rounded bg-black/10 dark:bg-white/10 mb-10" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-[14px] bg-black/[0.05] dark:bg-white/[0.05]"
                style={{ aspectRatio: '9 / 16' }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (view === 'list') {
    const count = savedReels.length;
    return (
      <div className="flex-1 overflow-y-auto" style={{ background: 'var(--paper)' }}>
        <div className="max-w-5xl mx-auto px-8 py-14">
          {/* Hero */}
          <div className="mb-10">
            <span className="section-kicker flex items-center gap-2 mb-3">
              <span className="dot-live" aria-hidden />
              Studio · Reels
            </span>
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <h1 className="section-title" style={{ fontSize: 'clamp(40px, 5vw, 64px)' }}>
                Seus <span style={{ fontStyle: 'italic', color: 'var(--accent)' }}>reels</span>
              </h1>
              {count > 0 && (
                <span
                  className="text-[13px] font-medium px-3 py-1.5 rounded-full"
                  style={{ background: 'var(--surface)', color: 'var(--ink-dim)', border: '1px solid var(--line)' }}
                >
                  {count} {count === 1 ? 'reel' : 'reels'}
                </span>
              )}
            </div>
            <p className="text-[14px] mt-3" style={{ color: 'var(--ink-dim)' }}>
              Monte um card com vídeo e baixe um MP4 pronto para postar.
            </p>
          </div>

          {count === 0 ? (
            /* ── Estado vazio ── */
            <div
              className="brand-card flex flex-col items-center justify-center text-center gap-4 px-8 py-16"
            >
              <span
                className="w-16 h-16 rounded-2xl grid place-items-center"
                style={{ background: 'var(--surface)', color: 'var(--ink-dim)', border: '1px solid var(--line)' }}
              >
                <Clapperboard className="w-8 h-8" />
              </span>
              <div>
                <h2 className="text-[18px] font-bold" style={{ color: 'var(--ink)' }}>
                  Nenhum reel ainda
                </h2>
                <p className="text-[14px] mt-1 max-w-sm" style={{ color: 'var(--ink-dim)' }}>
                  Crie seu primeiro reel: escolha um vídeo, ajuste o card e baixe um MP4 pronto para postar.
                </p>
              </div>
              <button onClick={openNew} className="brand-btn primary" style={{ padding: '10px 18px' }}>
                <Plus className="w-4 h-4" />
                <span>Novo reel</span>
              </button>
            </div>
          ) : (
            /* ── Grid ── */
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {/* Tile "Novo reel" na mesma proporção 9:16 */}
              <button
                onClick={openNew}
                className="group rounded-[14px] flex flex-col items-center justify-center gap-2.5 text-center transition-colors"
                style={{ aspectRatio: '9 / 16', border: '1.5px dashed var(--line-strong)', background: 'transparent', color: 'var(--ink-dim)' }}
              >
                <span
                  className="w-11 h-11 rounded-full grid place-items-center transition-transform group-hover:scale-110"
                  style={{ background: 'var(--surface)' }}
                >
                  <Plus className="w-5 h-5" />
                </span>
                <span className="text-[13px] font-medium">Novo reel</span>
              </button>

              {savedReels.map((row) => {
                const poster = posterUrls[row.id];
                const dur = formatReelDuration(row.video_duration_sec);
                return (
                  <div
                    key={row.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openReel(row)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openReel(row);
                      }
                    }}
                    className="group relative brand-card interactive"
                    style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }}
                  >
                    <div className="relative w-full" style={{ aspectRatio: '9 / 16', background: '#000' }}>
                      {/* Poster: 1º frame do vídeo (sem autoplay/som) */}
                      {poster ? (
                        <video
                          src={poster}
                          muted
                          playsInline
                          preload="metadata"
                          tabIndex={-1}
                          className="absolute inset-0 w-full h-full object-cover"
                          style={{ pointerEvents: 'none' }}
                        />
                      ) : (
                        <div className="absolute inset-0 grid place-items-center">
                          {row.avatar_url ? (
                            <img src={row.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover opacity-80" />
                          ) : (
                            <Clapperboard className="w-9 h-9" style={{ color: 'rgba(255,255,255,0.35)' }} />
                          )}
                        </div>
                      )}

                      {/* Gradientes topo/base para legibilidade dos overlays */}
                      <div
                        className="absolute inset-x-0 top-0 h-20"
                        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)', pointerEvents: 'none' }}
                      />
                      <div
                        className="absolute inset-x-0 bottom-0 h-24"
                        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)', pointerEvents: 'none' }}
                      />

                      {/* Mini-header sobreposto: avatar + nome */}
                      <div className="absolute top-2.5 left-2.5 right-10 flex items-center gap-2">
                        {row.avatar_url && (
                          <img
                            src={row.avatar_url}
                            alt=""
                            className="w-6 h-6 rounded-full object-cover shrink-0"
                            style={{ border: '1px solid rgba(255,255,255,0.4)' }}
                          />
                        )}
                        <span
                          className="text-[12px] font-semibold truncate"
                          style={{ color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
                        >
                          {row.name || row.caption || 'Reel'}
                        </span>
                      </div>

                      {/* Lixeira — só no hover/foco (menos poluída) */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteReel(row);
                        }}
                        className="absolute top-2 right-2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                        style={{ background: 'rgba(0,0,0,0.5)', color: '#fff' }}
                        aria-label="Remover reel"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      {/* Selo duração + MP4 */}
                      <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5">
                        {dur && (
                          <span
                            className="text-[11px] font-semibold px-1.5 py-0.5 rounded"
                            style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}
                          >
                            {dur}
                          </span>
                        )}
                        <span
                          className="text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(255,255,255,0.92)', color: '#000' }}
                        >
                          MP4
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Editor ──────────────────────────────────────────────────────────────
  const fmt = getFormat(reel.format);

  return (
    <div className="flex-1 overflow-hidden flex" style={{ background: 'var(--paper)' }}>
      {/* Preview */}
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-8 gap-5">
        <div
          style={{
            width: REEL_WIDTH * PREVIEW_SCALE,
            height: fmt.height * PREVIEW_SCALE,
            overflow: 'hidden',
            borderRadius: 12,
            boxShadow: 'var(--sh-1)',
          }}
        >
          <ReelCard reel={reel} scale={PREVIEW_SCALE} videoRef={previewVideoRef} />
        </div>

        {/* Controles de preview (play/pause, loop implícito, mute) */}
        <div className="flex items-center gap-2">
          <button
            onClick={togglePlay}
            disabled={!reel.videoUrl}
            className="brand-btn outline"
            style={{ padding: '8px 14px' }}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>{isPlaying ? 'Pausar' : 'Reproduzir'}</span>
          </button>
          <button
            onClick={() => patch({ muted: !reel.muted })}
            className="brand-btn outline"
            style={{ padding: '8px 14px' }}
            aria-pressed={reel.muted}
          >
            {reel.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            <span>{reel.muted ? 'Mudo' : 'Com som'}</span>
          </button>
        </div>
      </div>

      {/* Sidebar de edição — SOMENTE os campos travados no escopo.
          Layout em 3 faixas: topbar (X) fixo, MEIO rolável, RODAPÉ fixo com as
          ações — Salvar/Baixar ficam sempre visíveis (sem scroll) em notebook. */}
      <aside
        className="w-[340px] shrink-0 h-full border-l flex flex-col"
        style={{ borderColor: 'var(--line)', background: 'var(--paper-2)' }}
      >
        {/* Topbar compacta — só o ícone X (fecha o editor). */}
        <div className="flex items-center justify-end px-3 pt-2.5 pb-1.5 shrink-0">
          {/* Template de Reels é FIXO em 9:16 — sem seletor nem badge de formato. */}
          <button
            onClick={() => setView('list')}
            className="brand-btn ghost"
            style={{ padding: 6 }}
            aria-label="Fechar editor"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* MEIO rolável — campos densificados. */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-4 flex flex-col gap-4">
          {/* Avatar */}
          <section>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--ink-dim)' }}>
              Avatar
            </p>
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-full overflow-hidden shrink-0"
                style={{
                  background: reel.avatarUrl ? `center/cover url(${reel.avatarUrl})` : 'var(--surface)',
                  border: '1.5px solid var(--line)',
                }}
              />
              <button
                onClick={() => avatarInputRef.current?.click()}
                className="brand-btn outline flex-1"
                style={{ padding: '7px 12px' }}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{reel.avatarUrl ? 'Trocar' : 'Enviar'} avatar</span>
              </button>
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </div>
          </section>

          {/* Nome + handle */}
          <section className="flex flex-col gap-2.5">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-dim)' }}>
                Nome
              </label>
              <input
                value={reel.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="NOT JOURNAL"
                className="brand-input w-full mt-1"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-dim)' }}>
                @handle
              </label>
              <input
                value={reel.handle}
                onChange={(e) => patch({ handle: stripHandle(e.target.value) })}
                placeholder="notjournal.ai"
                className="brand-input w-full mt-1"
              />
            </div>
          </section>

          {/* Legenda */}
          <section>
            <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-dim)' }}>
              Legenda
            </label>
            <textarea
              value={reel.caption}
              onChange={(e) => patch({ caption: e.target.value })}
              rows={3}
              placeholder="Escreva a legenda do card…"
              className="brand-input w-full mt-1 resize-none"
            />
          </section>

          {/* Posição vertical do bloco [header+vídeo] dentro do card 9:16 */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-dim)' }}>
                Posição vertical
              </p>
              <button
                onClick={() => patch({ contentOffsetY: 0 })}
                disabled={!reel.contentOffsetY}
                className="text-[11px] disabled:opacity-40"
                style={{ color: 'var(--ink-dim)', cursor: reel.contentOffsetY ? 'pointer' : 'default' }}
              >
                Centralizar
              </button>
            </div>
            <input
              type="range"
              min={-CONTENT_OFFSET_RANGE}
              max={CONTENT_OFFSET_RANGE}
              step={4}
              value={reel.contentOffsetY}
              onChange={(e) => patch({ contentOffsetY: Number(e.target.value) })}
              className="w-full"
              aria-label="Posição vertical do conteúdo"
            />
            <p className="text-[11px] mt-1" style={{ color: 'var(--ink-dim)' }}>
              Sobe/desce o conteúdo no card.{' '}
              {reel.contentOffsetY
                ? `${reel.contentOffsetY > 0 ? '+' : ''}${reel.contentOffsetY}px`
                : 'Centrado'}
            </p>
          </section>

          {/* Vídeo */}
          <section>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--ink-dim)' }}>
              Vídeo
            </p>

            {reel.videoUrl ? (
              /* Estado "vídeo adicionado": mini-thumb + meta + trocar/remover. */
              <div className="brand-card p-2.5 flex items-center gap-3">
                <div
                  className="w-12 rounded-lg overflow-hidden shrink-0"
                  style={{ aspectRatio: '9 / 16', background: '#000' }}
                >
                  <video
                    src={`${reel.videoUrl}#t=0.1`}
                    muted
                    playsInline
                    preload="metadata"
                    tabIndex={-1}
                    className="w-full h-full object-cover"
                    style={{ pointerEvents: 'none' }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--ink)' }}>
                    Vídeo adicionado
                  </p>
                  <p className="text-[11px] truncate" style={{ color: 'var(--ink-dim)' }}>
                    {[
                      formatReelDuration(reel.videoDurationSec),
                      reel.videoWidth && reel.videoHeight ? `${reel.videoWidth}×${reel.videoHeight}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'MP4/WebM'}
                  </p>
                  <button
                    onClick={() => videoInputRef.current?.click()}
                    disabled={uploading}
                    className="text-[12px] font-medium mt-1 inline-flex items-center gap-1 disabled:opacity-50"
                    style={{ color: 'var(--accent)' }}
                  >
                    <Upload className="w-3 h-3" />
                    {uploading ? 'Enviando…' : 'Trocar vídeo'}
                  </button>
                </div>
                <button
                  onClick={() => {
                    setIsPlaying(false);
                    patch({
                      videoUrl: undefined,
                      videoPath: undefined,
                      videoMime: undefined,
                      videoWidth: undefined,
                      videoHeight: undefined,
                      videoDurationSec: undefined,
                      videoSizeBytes: undefined,
                    });
                  }}
                  disabled={uploading}
                  aria-label="Remover vídeo"
                  className="p-1.5 rounded-md shrink-0 self-start hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50"
                  style={{ color: 'var(--ink-dim)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              /* Estado vazio: enviar vídeo. */
              <>
                <button
                  onClick={() => videoInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed transition-colors disabled:opacity-50"
                  style={{ borderColor: 'var(--line-strong)', color: 'var(--ink-dim)' }}
                >
                  <Video className="w-4 h-4" />
                  {uploading ? 'Enviando…' : 'Enviar vídeo (MP4/WebM)'}
                </button>
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--ink-dim)' }}>
                  MP4 ou WebM · até {MAX_VIDEO_DURATION_SEC}s
                </p>
              </>
            )}

            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/webm"
              className="hidden"
              onChange={handleVideoUpload}
            />
          </section>
        </div>

        {/* RODAPÉ fixo — ações sempre visíveis (não rola com o meio). */}
        <div
          className="shrink-0 border-t px-5 py-3 flex flex-col gap-2"
          style={{ borderColor: 'var(--line)', background: 'var(--paper-2)' }}
        >
          <button onClick={handleSave} className="brand-btn outline w-full" style={{ padding: '9px 14px' }}>
            Salvar
          </button>
          <button
            onClick={openExportModal}
            disabled={exporting || !reel.videoUrl}
            className="brand-btn primary w-full"
            style={{ padding: '9px 14px' }}
          >
            <Download className="w-4 h-4" />
            <span>Baixar Reels (MP4)</span>
          </button>
        </div>
      </aside>

      {/* Modal de download: nome do arquivo + barra de progresso fiel. */}
      {showExportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          // Enquanto processa, NÃO deixa fechar clicando fora.
          onClick={() => {
            if (!exporting) setShowExportModal(false);
          }}
        >
          <div
            className="w-full max-w-[420px] rounded-2xl p-6"
            style={{ background: 'var(--paper)', border: '1.5px solid var(--line-strong)', boxShadow: 'var(--sh-1)' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Baixar Reels"
          >
            {!exporting ? (
              <>
                <h2 className="text-[18px] font-bold mb-1" style={{ color: 'var(--ink)' }}>
                  Baixar Reels
                </h2>
                <p className="text-[13px] mb-4" style={{ color: 'var(--ink-dim)' }}>
                  Escolha o nome do arquivo. Ele será salvo em .mp4.
                </p>
                <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-dim)' }}>
                  Nome do arquivo
                </label>
                <div className="flex items-center gap-2 mt-1.5">
                  <input
                    value={exportName}
                    onChange={(e) => setExportName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') runExport();
                    }}
                    placeholder="nome-do-seu-reel"
                    autoFocus
                    className="brand-input flex-1"
                  />
                  <span className="text-[13px] font-mono" style={{ color: 'var(--ink-dim)' }}>
                    .mp4
                  </span>
                </div>
                <div className="flex items-center justify-end gap-2 mt-6">
                  <button
                    onClick={() => setShowExportModal(false)}
                    className="brand-btn ghost"
                    style={{ padding: '8px 14px' }}
                  >
                    Cancelar
                  </button>
                  <button onClick={runExport} className="brand-btn primary" style={{ padding: '8px 16px' }}>
                    <Download className="w-4 h-4" />
                    <span>Baixar</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-[18px] font-bold mb-1" style={{ color: 'var(--ink)' }}>
                  Gerando seu Reels…
                </h2>
                <p className="text-[13px] mb-5" style={{ color: 'var(--ink-dim)' }}>
                  Pode levar alguns segundos. <strong>Não feche esta janela</strong> — o download começa sozinho ao terminar.
                </p>
                <div
                  className="w-full h-3 rounded-full overflow-hidden"
                  style={{ background: 'var(--surface)' }}
                  role="progressbar"
                  aria-valuenow={exportPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-150 ease-out"
                    style={{ width: `${exportPct}%`, background: 'var(--ink)' }}
                  />
                </div>
                <p className="text-[13px] font-mono mt-2 text-right" style={{ color: 'var(--ink-dim)' }}>
                  {exportPct}%
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Cabeçalho em tamanho real, fora da tela — fonte do PNG do export.
          Off-screen (não opacity:0) para o html2canvas rasterizar de verdade. */}
      <div aria-hidden style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none', zIndex: -1 }}>
        <ReelCard reel={reel} scale={1} headerRef={exportHeaderRef} hideVideo />
      </div>
    </div>
  );
}
