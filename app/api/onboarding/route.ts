import { after, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { recordProductEventBestEffort } from '@/lib/product-events';
import { createWorkspace, isWorkspaceFeatureUnavailableError } from '@/lib/workspaces';
import { legacyChannelSelection, parseReferralSource, parseSelectedChannels, serializeProfessionalProfiles } from '@/lib/onboarding-options';

const PROFILE_FIELDS = 'brand_name, workspace_name, first_name, last_name, professional_profile, referral_source, photo_url, instagram_handle, news_instagram_handle, twitter_handle, brand_palette, niche, audience, brand_story, audience_pains, default_tone, goals, onboarding_completed';
const LEGACY_PROFILE_FIELDS = 'brand_name, workspace_name, photo_url, instagram_handle, news_instagram_handle, twitter_handle, brand_palette, niche, audience, brand_story, audience_pains, default_tone, goals, onboarding_completed';

function isTask1ProfileColumnUnavailable(error: unknown) {
  const value = error as { code?: unknown; message?: unknown } | null;
  const code = typeof value?.code === 'string' ? value.code : '';
  const message = typeof value?.message === 'string' ? value.message : String(error ?? '');
  return ['42703', 'PGRST204'].includes(code)
    && /first_name|last_name|professional_profile|referral_source/i.test(message);
}

function text(value: unknown, limit = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function palette(value: unknown) {
  if (!Array.isArray(value)) return ['#0A0A0A', '#FAFAF7', '#E4572E'];
  const colors = value.filter((color): color is string => typeof color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(color)).slice(0, 6);
  return colors.length ? colors : ['#0A0A0A', '#FAFAF7', '#E4572E'];
}

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  let { data, error } = await supabase.from('profiles').select(PROFILE_FIELDS).eq('id', user.id).maybeSingle();
  if (error && isTask1ProfileColumnUnavailable(error)) {
    ({ data, error } = await supabase.from('profiles').select(LEGACY_PROFILE_FIELDS).eq('id', user.id).maybeSingle());
  }
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
  const rawHandles = {
    instagram_carousel: text(body.instagramHandle, 80).replace(/^@/, ''),
    instagram_news: text(body.newsInstagramHandle, 80).replace(/^@/, ''),
    twitter: text(body.twitterHandle, 80).replace(/^@/, ''),
  };
  const explicitChannels = hasOwn(body, 'selectedChannels');
  const selectedChannels = explicitChannels
    ? parseSelectedChannels(body.selectedChannels)
    : legacyChannelSelection(undefined, rawHandles);
  const instagramHandle = selectedChannels.includes('instagram_carousel') ? rawHandles.instagram_carousel : '';
  const newsInstagramHandle = selectedChannels.includes('instagram_news') ? rawHandles.instagram_news : '';
  const twitterHandle = selectedChannels.includes('twitter') ? rawHandles.twitter : '';
  const complete = body.complete === true;
  if (complete && (!brandName || !selectedChannels.length)) {
    return NextResponse.json({ error: 'Nome da marca e pelo menos um canal são obrigatórios.' }, { status: 422 });
  }
  if (complete) {
    const missingChannel = selectedChannels.find((channel) => !({
      instagram_carousel: instagramHandle,
      instagram_news: newsInstagramHandle,
      twitter: twitterHandle,
    }[channel]));
    if (missingChannel) {
      return NextResponse.json({ error: 'Informe o @ de cada canal selecionado.' }, { status: 422 });
    }
  }

  const submittedPhotoUrl = text(body.photoUrl, 2048);
  if (submittedPhotoUrl && !/^https:\/\//.test(submittedPhotoUrl)) {
    return NextResponse.json({ error: 'URL da foto inválida.' }, { status: 422 });
  }

  const workspaceName = text(body.workspaceName, 120) || brandName || 'Meu workspace';
  const parsedProfessionalProfile = serializeProfessionalProfiles(body.professionalProfile);
  const referralWasProvided = hasOwn(body, 'referralSource');
  const rawReferralSource = text(body.referralSource, 80);
  const referralSource = parseReferralSource(rawReferralSource);
  if (rawReferralSource && !referralSource) {
    return NextResponse.json({ error: 'Origem do cadastro inválida.' }, { status: 422 });
  }
  // Um autosave da página de edição não pode reabrir o gate de uma conta já concluída.
  let { data: currentProfile, error: currentProfileError } = await supabase
    .from('profiles')
    .select('onboarding_completed, first_name, last_name, professional_profile, referral_source, photo_url')
    .eq('id', user.id)
    .maybeSingle();
  if (currentProfileError && isTask1ProfileColumnUnavailable(currentProfileError)) {
    ({ data: currentProfile, error: currentProfileError } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', user.id)
      .maybeSingle());
  }
  if (currentProfileError) return NextResponse.json({ error: 'Não foi possível validar o perfil.' }, { status: 500 });
  const onboardingCompleted = complete || Boolean(currentProfile?.onboarding_completed);
  const workspaceFeatureEnabled = typeof (supabase as { rpc?: unknown }).rpc === 'function';
  const globalFieldsProvided = ['firstName', 'lastName', 'professionalProfile', 'referralSource', 'photoUrl']
    .some((key) => hasOwn(body, key));
  const firstName = hasOwn(body, 'firstName') ? text(body.firstName, 80) : text(currentProfile?.first_name, 80);
  const lastName = hasOwn(body, 'lastName') ? text(body.lastName, 80) : text(currentProfile?.last_name, 80);
  const professionalProfile = hasOwn(body, 'professionalProfile')
    ? (parsedProfessionalProfile || text(body.professionalProfile, 120))
    : text(currentProfile?.professional_profile, 120);
  const photoUrl = hasOwn(body, 'photoUrl') ? submittedPhotoUrl : text(currentProfile?.photo_url, 2048);
  const logoUrl = text(body.logoUrl, 2048);
  const profile = {
    id: user.id,
    workspace_name: workspaceName,
    first_name: firstName,
    last_name: lastName,
    // A coluna continua text para não exigir migração; os novos valores são
    // canônicos e separados por vírgula, enquanto valores legados desconhecidos
    // continuam intactos para não apagar dados existentes.
    professional_profile: professionalProfile,
    referral_source: referralWasProvided ? referralSource : (currentProfile?.referral_source ?? null),
    brand_name: brandName,
    photo_url: photoUrl,
    handle: instagramHandle,
    instagram_handle: instagramHandle,
    news_instagram_handle: newsInstagramHandle,
    twitter_handle: twitterHandle,
    brand_palette: palette(body.palette),
    niche: text(body.niche),
    audience: text(body.audience),
    brand_story: text(body.brandStory),
    audience_pains: text(body.audiencePains),
    default_tone: text(body.defaultTone, 200),
    onboarding_completed: onboardingCompleted,
  };
  // Com a migration de workspaces ativa, os campos abaixo continuam no objeto
  // de resposta para compatibilidade do cliente, mas não voltam para `profiles`.
  // O perfil é do usuário; marca, canais, nicho e paleta são do workspace.
  const profileToPersist = workspaceFeatureEnabled
    ? {
      id: user.id,
      onboarding_completed: profile.onboarding_completed,
      ...(globalFieldsProvided ? {
        first_name: profile.first_name,
        last_name: profile.last_name,
        professional_profile: profile.professional_profile,
        referral_source: profile.referral_source,
        photo_url: profile.photo_url,
      } : {}),
    }
    : profile;

  let { error: profileError } = await supabase.from('profiles').upsert(profileToPersist);
  if (profileError && isTask1ProfileColumnUnavailable(profileError)) {
    const { first_name: _firstName, last_name: _lastName, professional_profile: _professionalProfile, referral_source: _referralSource, ...legacyProfile } = profileToPersist;
    ({ error: profileError } = await supabase.from('profiles').upsert(legacyProfile));
  }
  if (profileError) return NextResponse.json({ error: 'Não foi possível salvar o perfil.' }, { status: 500 });

  // O projeto só é criado ao concluir. Assim rascunhos não criam dados extras.
  let workspaceId: string | null = null;
  if (workspaceFeatureEnabled) {
    const brandContext = {
      brandName,
      logoUrl,
      instagramHandle,
      newsInstagramHandle,
      twitterHandle: profile.twitter_handle,
      palette: profile.brand_palette,
      brandStory: profile.brand_story,
      audiencePains: profile.audience_pains,
      niche: profile.niche,
      audience: profile.audience,
      defaultTone: profile.default_tone,
    };
    let workspaceFeatureUnavailable = false;
    let existingWorkspace: { id?: string } | null = null;
    if (complete && !workspaceFeatureUnavailable) {
      const lookup = await supabase
        .from('workspaces')
        .select('id')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      const { data: foundWorkspace, error: workspaceLookupError } = lookup;
      existingWorkspace = foundWorkspace;
      if (workspaceLookupError) {
        if (isWorkspaceFeatureUnavailableError(workspaceLookupError)) workspaceFeatureUnavailable = true;
        else return NextResponse.json({ error: 'Perfil salvo, mas o workspace não pôde ser validado.' }, { status: 500 });
      }
    }
    // Uma troca explícita salva a preferência antes de abrir o onboarding. O
    // contexto ativo é a autoridade para um Workspace já criado. A consulta
    // ordenada acima também reconhece instalações sem a migration antes de
    // chamar a RPC, mantendo o fallback legado seguro.
    if (!workspaceFeatureUnavailable && (!complete || existingWorkspace?.id)) {
      const { data: activeWorkspaceId, error: activeWorkspaceError } = await supabase.rpc('active_workspace_id', { p_user_id: user.id });
      if (!activeWorkspaceError && typeof activeWorkspaceId === 'string') {
        existingWorkspace = { id: activeWorkspaceId };
      } else if (activeWorkspaceError && isWorkspaceFeatureUnavailableError(activeWorkspaceError)) {
        workspaceFeatureUnavailable = true;
      } else if (activeWorkspaceError) {
        return NextResponse.json({ error: 'Perfil salvo, mas o workspace ativo não pôde ser validado.' }, { status: 500 });
      }
    }
    if (!workspaceFeatureUnavailable && existingWorkspace?.id) {
      workspaceId = existingWorkspace.id;
      const { error: brandError } = await supabase.from('workspace_brand_context').upsert({
          workspace_id: workspaceId,
          brand_name: brandName,
          logo_url: logoUrl,
          instagram_handle: instagramHandle,
          news_instagram_handle: newsInstagramHandle,
          twitter_handle: profile.twitter_handle,
          brand_palette: profile.brand_palette,
          brand_story: profile.brand_story,
          audience_pains: profile.audience_pains,
          niche: profile.niche,
          audience: profile.audience,
          default_tone: profile.default_tone,
      }, { onConflict: 'workspace_id' });
      if (brandError) {
        if (isWorkspaceFeatureUnavailableError(brandError)) {
          workspaceFeatureUnavailable = true;
          workspaceId = null;
        }
        else return NextResponse.json({ error: 'Perfil salvo, mas o contexto da marca não pôde ser atualizado.' }, { status: 500 });
      }
    }
    if (complete && !workspaceFeatureUnavailable && !workspaceId) {
      try {
        const workspace = await createWorkspace(supabase, workspaceName, brandContext);
        workspaceId = workspace.id;
      } catch (error) {
        if (isWorkspaceFeatureUnavailableError(error)) workspaceFeatureUnavailable = true;
        else return NextResponse.json({ error: 'Perfil salvo, mas o workspace não pôde ser criado.' }, { status: 500 });
      }
    }
  }

  if (complete) {
    const existingProjectQuery = supabase.from('projects').select('id, workspace_id').eq('user_id', user.id).eq('name', brandName);
    const { data: existing } = await existingProjectQuery.maybeSingle();
    const project = {
      user_id: user.id,
      ...(workspaceId ? { workspace_id: workspaceId } : {}),
      name: brandName,
      description: profile.brand_story,
      niche: profile.niche,
      audience: profile.audience,
      default_tone: profile.default_tone,
      brand_voice: { instagramHandle, newsInstagramHandle, twitterHandle: profile.twitter_handle, palette: profile.brand_palette, audiencePains: profile.audience_pains, story: profile.brand_story },
    };
    const canUpdateExistingProject = existing?.id && (!workspaceId || existing.workspace_id === workspaceId);
    const { error: projectError } = canUpdateExistingProject
      ? await supabase.from('projects').update(project).eq('id', existing.id)
      : await supabase.from('projects').insert(project);
    if (projectError) return NextResponse.json({ error: 'Perfil salvo, mas o projeto não pôde ser atualizado.' }, { status: 500 });
    try { after(() => recordProductEventBestEffort(user.id, 'onboarding_completed')); }
    catch { void recordProductEventBestEffort(user.id, 'onboarding_completed'); }
  }

  return NextResponse.json({ profile, workspaceId });
}
