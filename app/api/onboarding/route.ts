import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const PROFILE_FIELDS = 'brand_name, workspace_name, photo_url, instagram_handle, news_instagram_handle, twitter_handle, brand_palette, niche, audience, brand_story, audience_pains, default_tone, onboarding_completed';

function text(value: unknown, limit = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function palette(value: unknown) {
  if (!Array.isArray(value)) return ['#0A0A0A', '#FAFAF7', '#E4572E'];
  const colors = value.filter((color): color is string => typeof color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(color)).slice(0, 6);
  return colors.length ? colors : ['#0A0A0A', '#FAFAF7', '#E4572E'];
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  const { data, error } = await supabase.from('profiles').select(PROFILE_FIELDS).eq('id', user.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Não foi possível carregar o onboarding.' }, { status: 500 });
  return NextResponse.json({ profile: data });
}

export async function PUT(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  }

  const brandName = text(body.brandName, 120);
  const instagramHandle = text(body.instagramHandle, 80).replace(/^@/, '');
  const complete = body.complete === true;
  if (complete && (!brandName || !instagramHandle)) {
    return NextResponse.json({ error: 'Nome da marca e Instagram são obrigatórios.' }, { status: 422 });
  }

  const photoUrl = text(body.photoUrl, 2048);
  if (photoUrl && !/^https:\/\//.test(photoUrl)) {
    return NextResponse.json({ error: 'URL da foto inválida.' }, { status: 422 });
  }

  const newsInstagramHandle = text(body.newsInstagramHandle, 80).replace(/^@/, '') || instagramHandle;
  // Um autosave da página de edição não pode reabrir o gate de uma conta já concluída.
  const { data: currentProfile, error: currentProfileError } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .maybeSingle();
  if (currentProfileError) return NextResponse.json({ error: 'Não foi possível validar o perfil.' }, { status: 500 });
  const onboardingCompleted = complete || Boolean(currentProfile?.onboarding_completed);
  const profile = {
    id: user.id,
    workspace_name: brandName,
    brand_name: brandName,
    photo_url: photoUrl,
    handle: instagramHandle,
    instagram_handle: instagramHandle,
    news_instagram_handle: newsInstagramHandle,
    twitter_handle: text(body.twitterHandle, 80).replace(/^@/, ''),
    brand_palette: palette(body.palette),
    niche: text(body.niche),
    audience: text(body.audience),
    brand_story: text(body.brandStory),
    audience_pains: text(body.audiencePains),
    default_tone: text(body.defaultTone, 200),
    onboarding_completed: onboardingCompleted,
  };

  const { error: profileError } = await supabase.from('profiles').upsert(profile);
  if (profileError) return NextResponse.json({ error: 'Não foi possível salvar o perfil.' }, { status: 500 });

  // O projeto só é criado ao concluir. Assim rascunhos não criam dados extras.
  if (complete) {
    const { data: existing } = await supabase.from('projects').select('id').eq('user_id', user.id).eq('name', brandName).maybeSingle();
    const project = {
      user_id: user.id,
      name: brandName,
      description: profile.brand_story,
      niche: profile.niche,
      audience: profile.audience,
      default_tone: profile.default_tone,
      brand_voice: { instagramHandle, newsInstagramHandle, twitterHandle: profile.twitter_handle, palette: profile.brand_palette, audiencePains: profile.audience_pains, story: profile.brand_story },
    };
    const { error: projectError } = existing?.id
      ? await supabase.from('projects').update(project).eq('id', existing.id)
      : await supabase.from('projects').insert(project);
    if (projectError) return NextResponse.json({ error: 'Perfil salvo, mas o projeto não pôde ser atualizado.' }, { status: 500 });
  }

  return NextResponse.json({ profile });
}
