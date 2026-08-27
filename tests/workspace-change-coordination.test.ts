import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  notifyWorkspaceChanged,
  prepareWorkspaceChange,
  registerWorkspaceChangeGuard,
  registerWorkspaceChangeListener,
} from '@/lib/workspace-events';

afterEach(() => vi.restoreAllMocks());

describe('coordenação da troca de workspace', () => {
  it('aguarda o save antes de permitir a troca', async () => {
    const events: string[] = [];
    registerWorkspaceChangeGuard(async (workspaceId) => {
      events.push(`guard:start:${workspaceId}`);
      await Promise.resolve();
      events.push(`guard:end:${workspaceId}`);
      return true;
    });

    await expect(prepareWorkspaceChange('workspace-b')).resolves.toBe(true);
    expect(events).toEqual(['guard:start:workspace-b', 'guard:end:workspace-b']);
  });

  it('notifica todos os consumidores depois da troca confirmada', async () => {
    const first = vi.fn();
    const second = vi.fn();
    registerWorkspaceChangeListener(first);
    registerWorkspaceChangeListener(second);

    await notifyWorkspaceChanged('workspace-b');

    expect(first).toHaveBeenCalledWith('workspace-b');
    expect(second).toHaveBeenCalledWith('workspace-b');
  });

  it('cancela a troca quando um consumidor não consegue salvar', async () => {
    registerWorkspaceChangeGuard(() => false);

    await expect(prepareWorkspaceChange('workspace-b')).resolves.toBe(false);
  });
});
