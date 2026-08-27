import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getWorkspaceContext, isWorkspaceFeatureUnavailableError } from '@/lib/workspaces';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const context = await getWorkspaceContext(supabase);
  if (context.state === 'unauthorized') return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  if (context.state === 'legacy') return NextResponse.json({ error: 'workspace_unavailable' }, { status: 409 });
  const { id } = await params;
  if (!context.memberships.some((item) => item.workspaceId === id)) {
    return NextResponse.json({ error: 'workspace_forbidden' }, { status: 403 });
  }
  const { data, error } = await supabase
    .from('workspace_brand_context')
    .select('*')
    .eq('workspace_id', id)
    .maybeSingle();
  if (error && isWorkspaceFeatureUnavailableError(error)) return NextResponse.json({ error: 'workspace_unavailable' }, { status: 409 });
  if (error) return NextResponse.json({ error: 'Não foi possível carregar a marca.' }, { status: 500 });
  return NextResponse.json({ brand: data });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const context = await getWorkspaceContext(supabase);
  if (context.state === 'unauthorized') return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  if (context.state === 'legacy') return NextResponse.json({ error: 'workspace_unavailable' }, { status: 409 });
  const { id } = await params;
  const membership = context.memberships.find((item) => item.workspaceId === id);
  if (!membership || !['owner', 'admin', 'editor'].includes(membership.role)) {
    return NextResponse.json({ error: 'workspace_forbidden' }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 }); }
  const value = (key: string, limit: number) => typeof body[key] === 'string' ? String(body[key]).trim().slice(0, limit) : '';
  const payload = {
    workspace_id: id,
    brand_name: value('brandName', 120),
    logo_url: value('logoUrl', 2048),
    instagram_handle: value('instagramHandle', 80).replace(/^@/, ''),
    news_instagram_handle: value('newsInstagramHandle', 80).replace(/^@/, ''),
    twitter_handle: value('twitterHandle', 80).replace(/^@/, ''),
    brand_palette: Array.isArray(body.palette) ? body.palette.slice(0, 6) : [],
    brand_story: value('brandStory', 2000),
    audience_pains: value('audiencePains', 2000),
    niche: value('niche', 2000),
    audience: value('audience', 2000),
    default_tone: value('defaultTone', 200),
  };
  const { data, error } = await supabase.from('workspace_brand_context').upsert(payload).select().single();
  if (error && isWorkspaceFeatureUnavailableError(error)) return NextResponse.json({ error: 'workspace_unavailable' }, { status: 409 });
  if (error || !data) return NextResponse.json({ error: 'Não foi possível atualizar a marca.' }, { status: 500 });
  return NextResponse.json({ brand: data });
}
