import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

const BUCKET = 'postflow-assets';

/** Extrai o caminho dentro do bucket a partir de uma URL pública do Storage. */
function storagePathFromUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}

/** Coleta URLs de imagem dentro de um JSON (profile_badge, global_settings). */
function collectImageUrls(value: unknown, out: Set<string>) {
  if (typeof value === 'string') {
    if (storagePathFromUrl(value)) out.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v) => collectImageUrls(v, out));
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((v) => collectImageUrls(v, out));
  }
}

export async function POST(req: NextRequest) {
  let id: string | undefined;
  try {
    ({ id } = await req.json());
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  // Busca com o client do usuário — o RLS garante que só o dono encontra.
  const { data: carousel } = await supabase
    .from('carousels')
    .select('id, profile_badge, global_settings, slides(background_image_url, grid_image_url, content_image_url)')
    .eq('id', id)
    .maybeSingle();
  if (!carousel) return NextResponse.json({ error: 'Carrossel não encontrado' }, { status: 404 });

  // Candidatas à limpeza: todas as imagens do Storage citadas pelo carrossel.
  const candidates = new Set<string>();
  type SlideUrls = { background_image_url: string; grid_image_url: string; content_image_url: string };
  for (const s of (carousel.slides as SlideUrls[] | null) ?? []) {
    [s.background_image_url, s.grid_image_url, s.content_image_url].forEach((u) => {
      if (storagePathFromUrl(u)) candidates.add(u);
    });
  }
  collectImageUrls(carousel.profile_badge, candidates);
  collectImageUrls(carousel.global_settings, candidates);

  // Deleta o carrossel (slides caem em cascata). Ownership de novo via RLS.
  const { error: deleteError } = await supabase.from('carousels').delete().eq('id', id);
  if (deleteError) {
    return NextResponse.json({ error: `Falha ao deletar: ${deleteError.message}` }, { status: 500 });
  }

  // Limpeza best-effort: só remove do Storage arquivos que NENHUM outro
  // registro referencia (carrosséis duplicados e fotos migradas compartilham
  // arquivos, então a checagem é obrigatória). Falha aqui não desfaz o delete;
  // no pior caso o arquivo vira órfão, como era antes.
  let removedFiles = 0;
  try {
    const admin = createAdminSupabaseClient();

    // A foto de perfil e o logo do usuário nunca são apagados por aqui.
    const { data: profile } = await admin
      .from('profiles')
      .select('photo_url, brand_logo_url')
      .eq('id', user.id)
      .maybeSingle();
    const protectedUrls = new Set([profile?.photo_url, profile?.brand_logo_url].filter(Boolean));

    const toRemove: string[] = [];
    for (const url of candidates) {
      if (protectedUrls.has(url)) continue;

      const quoted = `"${url}"`;
      const [slideRef, carouselRef, profileRef] = await Promise.all([
        admin.from('slides')
          .select('id')
          .or(`background_image_url.eq.${quoted},grid_image_url.eq.${quoted},content_image_url.eq.${quoted}`)
          .limit(1),
        admin.from('carousels')
          .select('id')
          .or(`profile_badge->>photo.eq.${quoted},global_settings->profileBadge->>photo.eq.${quoted}`)
          .limit(1),
        admin.from('profiles')
          .select('id')
          .or(`photo_url.eq.${quoted},brand_logo_url.eq.${quoted}`)
          .limit(1),
      ]);
      // Erro em qualquer checagem conta como "ainda referenciado": na dúvida,
      // deixar um órfão no Storage é inofensivo; apagar um arquivo em uso não.
      const stillReferenced =
        Boolean(slideRef.error || carouselRef.error || profileRef.error) ||
        (slideRef.data?.length ?? 0) > 0 ||
        (carouselRef.data?.length ?? 0) > 0 ||
        (profileRef.data?.length ?? 0) > 0;

      if (!stillReferenced) {
        const path = storagePathFromUrl(url);
        if (path) toRemove.push(path);
      }
    }

    if (toRemove.length > 0) {
      const { error: removeError } = await admin.storage.from(BUCKET).remove(toRemove);
      if (removeError) {
        console.error('[delete-carousel] storage cleanup', removeError);
      } else {
        removedFiles = toRemove.length;
      }
    }
  } catch (err) {
    console.error('[delete-carousel] cleanup skipped', err);
  }

  return NextResponse.json({ ok: true, removedFiles });
}
