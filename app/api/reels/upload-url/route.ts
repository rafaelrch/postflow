import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
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
 */
export const REELS_BUCKET = 'postflow-reels';

interface UploadUrlBody {
  mime?: string;
  sizeBytes?: number;
}

export async function POST(request: Request) {
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
