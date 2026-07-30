import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getEntitlement } from '@/lib/entitlements';
import { REELS_ENABLED } from '@/lib/feature-flags';
import {
  isAllowedVideoMime,
  validateVideoMeta,
  extForMime,
  MAX_VIDEO_BYTES,
} from '@/lib/reels-media';

/**
 * Gera uma SIGNED UPLOAD URL para o bucket `postflow-reels`, deixando o arquivo
 * ir DIRETO do browser pro Supabase Storage — sem passar o vídeo por esta rota
 * serverless (limite de 4.5MB de body do Vercel). Aqui só validamos e assinamos.
 *
 * Regras:
 *   - 401 sem sessão.
 *   - O caminho é SEMPRE derivado do user.id do lado do servidor
 *     (`${user.id}/reels/<uuid>.<ext>`); o cliente não escolhe a pasta, então a
 *     RLS por usuário do Storage não tem como ser burlada.
 *   - MIME e tamanho validados server-side (mesma fonte: lib/reels-media.ts).
 *     Duração/dimensões são medidas no cliente (precisam de <video>).
 *   - TRAVA DE CUSTO (fatia 4b): o trigger free_reel_limit é BEFORE INSERT na
 *     tabela `reels`, então não cobre upload órfão (assinar URL + subir vídeo
 *     sem inserir linha). Aqui, ANTES de assinar: trocar o vídeo de um reel que
 *     é do próprio usuário é sempre liberado; criar um reel NOVO é barrado para
 *     free que já tem >= 1 reel (403 free_reel_limit). Falha fechada.
 */
export const REELS_BUCKET = 'postflow-reels';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface UploadUrlBody {
  mime?: string;
  sizeBytes?: number;
  /** Reel alvo quando é TROCA de vídeo de um reel já salvo. Ausente = reel novo. */
  reelId?: string;
}

export async function POST(request: Request) {
  // Funcionalidade desligada: a rota some do ponto de vista de quem chama. Isso
  // vem ANTES de qualquer coisa — nem sessão, nem banco, nem URL assinada. Não
  // faz sentido deixar um endpoint de upload aberto pra algo que está fora do ar.
  if (!REELS_ENABLED) {
    return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  let body: UploadUrlBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  }

  const mime = typeof body.mime === 'string' ? body.mime.toLowerCase() : '';
  const sizeBytes = typeof body.sizeBytes === 'number' ? body.sizeBytes : 0;

  const check = validateVideoMeta({ mime, sizeBytes });
  if (!check.ok) {
    return NextResponse.json({ error: check.error, code: check.code }, { status: 422 });
  }
  // Redundante com validateVideoMeta, mas deixa o narrowing de tipo explícito.
  if (!isAllowedVideoMime(mime)) {
    return NextResponse.json({ error: 'Formato inválido.', code: 'mime' }, { status: 422 });
  }

  // ── Trava de custo (anti-upload-órfão), ANTES de assinar qualquer URL ──────
  const reelId = typeof body.reelId === 'string' ? body.reelId.trim() : '';
  if (reelId) {
    // TROCA de vídeo de um reel existente. Posse verificada SERVER-SIDE contra
    // o usuário autenticado — nunca confiando no cliente. Recusa IDÊNTICA se o
    // id for malformado, não existir OU for de outro usuário (anti-IDOR e
    // anti-enumeração): a resposta não revela qual dos casos ocorreu.
    if (!UUID_RE.test(reelId)) {
      return NextResponse.json({ error: 'Não foi possível preparar o upload.' }, { status: 403 });
    }
    const { data: owned, error: ownErr } = await supabase
      .from('reels')
      .select('id')
      .eq('id', reelId)
      .eq('user_id', user.id)
      .maybeSingle();
    // Falha fechada: erro de leitura ou reel não-próprio NÃO libera.
    if (ownErr || !owned) {
      return NextResponse.json({ error: 'Não foi possível preparar o upload.' }, { status: 403 });
    }
    // Dono confirmado → libera a troca de vídeo, independente do plano.
  } else {
    // Reel NOVO: free com >= 1 reel é barrado antes de assinar (fecha o furo).
    // Falha fechada: entitlement não resolvido = free; contagem indefinida = barra.
    const plan = await getEntitlement(supabase, user.id);
    if (plan !== 'pro') {
      const { count, error: countErr } = await supabase
        .from('reels')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);
      if (countErr || count === null || count >= 1) {
        return NextResponse.json(
          {
            error: 'O plano gratuito guarda 1 Reel. Apague o atual ou faça upgrade para criar outro.',
            code: 'free_reel_limit',
          },
          { status: 403 },
        );
      }
    }
  }

  const ext = extForMime(mime);
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  // Caminho derivado do user.id — primeira pasta = uid (a RLS confere isso).
  const path = `${user.id}/reels/${uuid}.${ext}`;

  const { data, error } = await supabase.storage
    .from(REELS_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    console.error('[reels] signed upload url error', error);
    return NextResponse.json(
      { error: 'Não foi possível preparar o upload. Verifique o bucket postflow-reels.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    bucket: REELS_BUCKET,
    path: data.path,
    token: data.token,
    signedUrl: data.signedUrl,
    maxBytes: MAX_VIDEO_BYTES,
  });
}
