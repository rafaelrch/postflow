import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getWorkspaceContext, isWorkspaceFeatureUnavailableError } from '@/lib/workspaces';

function text(value: unknown, limit: number) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : undefined;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const context = await getWorkspaceContext(supabase);
  if (context.state === 'unauthorized') return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  if (context.state === 'legacy') return NextResponse.json({ error: 'workspace_unavailable' }, { status: 409 });
  const { id } = await params;
  const membership = context.memberships.find((item) => item.workspaceId === id);
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'workspace_forbidden' }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 }); }
  const status = body.status === 'archived' || body.status === 'active' ? body.status : undefined;
  const name = text(body.name, 120);
  const avatarUrl = text(body.avatarUrl, 2048);
  if (body.status !== undefined && !status) return NextResponse.json({ error: 'Status inválido.' }, { status: 422 });
  const { data, error } = await supabase.rpc('update_workspace', {
    p_workspace_id: id,
    p_name: name ?? null,
    p_avatar_url: avatarUrl ?? null,
    p_status: status ?? null,
  }).single();
  if (error && isWorkspaceFeatureUnavailableError(error)) return NextResponse.json({ error: 'workspace_unavailable' }, { status: 409 });
  if (error || !data) return NextResponse.json({ error: 'Não foi possível atualizar o workspace.' }, { status: 500 });
  return NextResponse.json({ workspace: data });
}
