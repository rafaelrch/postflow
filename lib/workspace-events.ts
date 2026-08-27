export type WorkspaceChangeGuard = (nextWorkspaceId: string) => boolean | Promise<boolean>;
export type WorkspaceChangeListener = (workspaceId: string) => void | Promise<void>;

const guards = new Set<WorkspaceChangeGuard>();
const listeners = new Set<WorkspaceChangeListener>();

export function registerWorkspaceChangeGuard(guard: WorkspaceChangeGuard) {
  guards.add(guard);
  return () => { guards.delete(guard); };
}

export function registerWorkspaceChangeListener(listener: WorkspaceChangeListener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function prepareWorkspaceChange(nextWorkspaceId: string): Promise<boolean> {
  for (const guard of guards) {
    if (!(await guard(nextWorkspaceId))) return false;
  }
  return true;
}

export async function notifyWorkspaceChanged(workspaceId: string): Promise<void> {
  await Promise.all([...listeners].map((listener) => listener(workspaceId)));
}
