import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createWorkspace, getWorkspaceContext, isWorkspaceFeatureUnavailableError } from '@/lib/workspaces';

function text(value: unknown, limit: number) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

export async function GET() {
  try {
    const context = await getWorkspaceContext(await createServerSupabaseClient());
    if (context.state === 'unauthorized') return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    return NextResponse.json({
      state: context.state,
      activeWorkspace: context.workspace,
      workspaces: context.memberships,
    });
  } catch (error) {
    console.error('[workspaces] list failed', error);
    return NextResponse.json({ error: 'Não foi possível carregar os workspaces.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const context = await getWorkspaceContext(supabase);
  if (context.state === 'unauthorized') return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  if (context.state === 'legacy') return NextResponse.json({ error: 'workspace_unavailable' }, { status: 409 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 }); }
  const name = text(body.name, 120);
  if (!name) return NextResponse.json({ error: 'Nome do workspace é obrigatório.' }, { status: 422 });

  try {
    const workspace = await createWorkspace(supabase, name, {
      brandName: text(body.brandName, 120),
      logoUrl: text(body.logoUrl, 2048),
      instagramHandle: text(body.instagramHandle, 80).replace(/^@/, ''),
      newsInstagramHandle: text(body.newsInstagramHandle, 80).replace(/^@/, ''),
      twitterHandle: text(body.twitterHandle, 80).replace(/^@/, ''),
      palette: Array.isArray(body.palette) ? body.palette.slice(0, 6) : [],
      brandStory: text(body.brandStory, 2000),
      audiencePains: text(body.audiencePains, 2000),
      niche: text(body.niche, 2000),
      audience: text(body.audience, 2000),
      defaultTone: text(body.defaultTone, 200),
    });
    return NextResponse.json({ workspace }, { status: 201 });
  } catch (error) {
    if (isWorkspaceFeatureUnavailableError(error)) return NextResponse.json({ error: 'workspace_unavailable' }, { status: 409 });
    console.error('[workspaces] create failed', error);
    return NextResponse.json({ error: 'Não foi possível criar o workspace.' }, { status: 500 });
  }
}
