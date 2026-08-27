// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  Workspaces,
  WorkspaceContent,
  WorkspaceTrigger,
  workspaceAvatarUrl,
  type Workspace,
} from '@/components/ui/workspaces';

afterEach(() => cleanup());

const workspaces: Array<Workspace & { avatar_url?: string }> = [
  { id: 'workspace-gradient', name: 'Gradiente' },
  { id: 'workspace-real-avatar', name: 'Avatar real', avatar_url: 'https://cdn.example/avatar.png' },
];

describe('componente de workspaces', () => {
  it('usa um avatar circular em gradiente, sem inicial, e mantém o fallback estável', () => {
    const { rerender } = render(
      <Workspaces workspaces={[workspaces[0]]} selectedWorkspaceId="workspace-gradient">
        <WorkspaceTrigger />
        <WorkspaceContent />
      </Workspaces>,
    );

    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    const fallbacksBefore = screen.getAllByTestId('workspace-avatar-fallback-workspace-gradient');
    expect(fallbacksBefore).toHaveLength(2);
    expect(fallbacksBefore[0].textContent).toBe('');
    expect(fallbacksBefore[0].className).toContain('rounded-full');
    expect(fallbacksBefore[0].style.background).toContain('linear-gradient');
    const gradient = fallbacksBefore[0].style.background;

    rerender(
      <Workspaces workspaces={[workspaces[0]]} selectedWorkspaceId="workspace-gradient">
        <WorkspaceTrigger />
        <WorkspaceContent />
      </Workspaces>,
    );

    expect(screen.getAllByTestId('workspace-avatar-fallback-workspace-gradient')[0].style.background)
      .toBe(gradient);
  });

  it('preserva avatar_url real antes do fallback no trigger e na opção da lista', () => {
    expect(workspaceAvatarUrl(workspaces[1])).toBe('https://cdn.example/avatar.png');

    render(
      <Workspaces workspaces={[workspaces[1]]} selectedWorkspaceId="workspace-real-avatar">
        <WorkspaceTrigger />
        <WorkspaceContent />
      </Workspaces>,
    );

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getAllByTestId('workspace-avatar-fallback-workspace-real-avatar')).toHaveLength(2);
  });

});
