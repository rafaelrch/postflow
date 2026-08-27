import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  parseReferralSource,
  serializeProfessionalProfiles,
} from '@/lib/onboarding-options';

function text(value: unknown, limit: number) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  }

  const firstName = text(body.firstName, 80);
  const lastName = text(body.lastName, 80);
  const rawProfessionalProfile = text(body.professionalProfile, 120);
  const professionalProfile = serializeProfessionalProfiles(rawProfessionalProfile);
  if (rawProfessionalProfile && !professionalProfile) {
    return NextResponse.json({ error: 'Perfil profissional inválido.' }, { status: 422 });
  }
  const rawReferralSource = text(body.referralSource, 80);
  const referralSource = parseReferralSource(rawReferralSource);
  if (rawReferralSource && !referralSource) {
    return NextResponse.json({ error: 'Origem do cadastro inválida.' }, { status: 422 });
  }
  const photoUrl = text(body.photoUrl, 2048);
  if (photoUrl && !/^https:\/\//.test(photoUrl)) {
    return NextResponse.json({ error: 'URL da foto inválida.' }, { status: 422 });
  }

  const { data, error } = await supabase.from('profiles').upsert({
    id: user.id,
    first_name: firstName,
    last_name: lastName,
    professional_profile: professionalProfile,
    referral_source: referralSource || null,
    photo_url: photoUrl,
  }).select('id, first_name, last_name, professional_profile, referral_source, photo_url').single();
  if (error) {
    console.error(`[profile] update_failed user=${user.id} code=${error.code ?? '?'}`);
    return NextResponse.json({ error: 'Não foi possível salvar os dados pessoais.' }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}
