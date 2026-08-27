import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getWorkspaceContext, isWorkspaceFeatureUnavailableError, setActiveWorkspaceCookie } from '@/lib/workspaces';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const context = await getWorkspaceContext(supabase);
  if (context.state === 'unauthorized') return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  if (context.state === 'legacy') return NextResponse.json({ error: 'workspace_unavailable' }, { status: 409 });
  const { id } = await params;
  const target = context.memberships.find((membership) => membership.workspaceId === id);
  if (!target || target.status !== 'active' || target.workspaceStatus !== 'active') {
    return NextResponse.json({ error: 'workspace_forbidden' }, { status: 403 });
  }
  const { error } = await supabase.from('user_workspace_preferences').upsert({
    user_id: context.userId,
    active_workspace_id: id,
  });
  if (error && isWorkspaceFeatureUnavailableError(error)) return NextResponse.json({ error: 'workspace_unavailable' }, { status: 409 });
  if (error) return NextResponse.json({ error: 'Não foi possível trocar o workspace.' }, { status: 500 });
  await setActiveWorkspaceCookie(id);
  return NextResponse.json({ workspaceId: id });
}
