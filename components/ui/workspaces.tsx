'use client';

import * as React from 'react';
import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

// Generic workspace interface - can be extended
export interface Workspace {
  id: string;
  name: string;
  [key: string]: any; // Allow additional properties
}

const WORKSPACE_FALLBACK_GRADIENTS = [
  'linear-gradient(135deg, #7c3aed 0%, #ef4444 100%)',
  'linear-gradient(135deg, #a3ff12 0%, #2dd4bf 100%)',
  'linear-gradient(135deg, #14b8a6 0%, #7c3aed 100%)',
  'linear-gradient(135deg, #22c55e 0%, #2563eb 100%)',
  'linear-gradient(135deg, #3b82f6 0%, #d946ef 100%)',
] as const;

function workspaceFallbackGradient(workspace: Workspace): string {
  let hash = 0;
  for (let index = 0; index < workspace.id.length; index += 1) {
    hash = (hash * 31 + workspace.id.charCodeAt(index)) | 0;
  }
  const gradientIndex = ((hash % WORKSPACE_FALLBACK_GRADIENTS.length) + WORKSPACE_FALLBACK_GRADIENTS.length)
    % WORKSPACE_FALLBACK_GRADIENTS.length;
  return WORKSPACE_FALLBACK_GRADIENTS[gradientIndex];
}

export function workspaceAvatarUrl(workspace: Workspace): string | undefined {
  const avatarUrl = (workspace as any).avatar_url ?? (workspace as any).logo;
  return typeof avatarUrl === 'string' && avatarUrl.trim() ? avatarUrl : undefined;
}

function WorkspaceAvatar({
  workspace,
  name,
  className,
}: {
  workspace: Workspace;
  name: string;
  className: string;
}) {
  return (
    <Avatar className={className}>
      <AvatarImage src={workspaceAvatarUrl(workspace)} alt={name} />
      <AvatarFallback
        aria-hidden="true"
        data-testid={`workspace-avatar-fallback-${workspace.id}`}
        style={{ background: workspaceFallbackGradient(workspace) }}
      />
    </Avatar>
  );
}

// Context for workspace state management
interface WorkspaceContextValue<T extends Workspace> {
  open: boolean;
  setOpen: (open: boolean) => void;
  selectedWorkspace: T | undefined;
  workspaces: T[];
  onWorkspaceSelect: (workspace: T) => void;
  getWorkspaceId: (workspace: T) => string;
  getWorkspaceName: (workspace: T) => string;
}

const WorkspaceContext = React.createContext<WorkspaceContextValue<any> | null>(
  null,
);

function useWorkspaceContext<T extends Workspace>() {
  const context = React.useContext(
    WorkspaceContext,
  ) as WorkspaceContextValue<T> | null;
  if (!context) {
    throw new Error(
      'Workspace components must be used within WorkspaceProvider',
    );
  }
  return context;
}

// Main provider component
interface WorkspaceProviderProps<T extends Workspace> {
  children: React.ReactNode;
  workspaces: T[];
  selectedWorkspaceId?: string;
  onWorkspaceChange?: (workspace: T) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  getWorkspaceId?: (workspace: T) => string;
  getWorkspaceName?: (workspace: T) => string;
}

function WorkspaceProvider<T extends Workspace>({
  children,
  workspaces,
  selectedWorkspaceId,
  onWorkspaceChange,
  open: controlledOpen,
  onOpenChange,
  getWorkspaceId = (workspace) => workspace.id,
  getWorkspaceName = (workspace) => workspace.name,
}: WorkspaceProviderProps<T>) {
  const [internalOpen, setInternalOpen] = React.useState(false);

  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const selectedWorkspace = React.useMemo(() => {
    if (!selectedWorkspaceId) return workspaces[0];
    return (
      workspaces.find((ws) => getWorkspaceId(ws) === selectedWorkspaceId) ||
      workspaces[0]
    );
  }, [workspaces, selectedWorkspaceId, getWorkspaceId]);

  const handleWorkspaceSelect = React.useCallback(
    (workspace: T) => {
      onWorkspaceChange?.(workspace);
      setOpen(false);
    },
    [onWorkspaceChange, setOpen],
  );

  const value: WorkspaceContextValue<T> = {
    open,
    setOpen,
    selectedWorkspace,
    workspaces,
    onWorkspaceSelect: handleWorkspaceSelect,
    getWorkspaceId,
    getWorkspaceName,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      <Popover open={open} onOpenChange={setOpen}>
        {children}
      </Popover>
    </WorkspaceContext.Provider>
  );
}

// Trigger component
interface WorkspaceTriggerProps extends React.ComponentProps<'button'> {
  renderTrigger?: (workspace: Workspace, isOpen: boolean) => React.ReactNode;
}

function WorkspaceTrigger({
	className,
	renderTrigger,
	style,
	...props
}: WorkspaceTriggerProps) {
  const { open, selectedWorkspace, getWorkspaceName } = useWorkspaceContext();

  if (!selectedWorkspace) return null;

  if (renderTrigger) {
    return (
      <PopoverTrigger asChild>
        <button className={className} {...props}>
          {renderTrigger(selectedWorkspace, open)}
        </button>
      </PopoverTrigger>
    );
  }

  return (
    <PopoverTrigger asChild>
      <button
        data-state={open ? 'open' : 'closed'}
				className={cn(
					'border-input bg-background ring-offset-background flex h-12 w-full max-w-72 items-center justify-between rounded-md border px-3 py-2 text-sm',
          'placeholder:text-muted-foreground focus:ring-ring focus:ring-2 focus:ring-offset-2 focus:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'hover:bg-accent hover:text-accent-foreground',
          className,
				)}
				style={{ background: 'var(--paper)', borderColor: 'var(--line-strong)', color: 'var(--ink)', ...style }}
				{...props}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <WorkspaceAvatar
            workspace={selectedWorkspace}
            name={getWorkspaceName(selectedWorkspace)}
            className="h-6 w-6"
          />
          <span className="truncate">
            {getWorkspaceName(selectedWorkspace)}
          </span>
        </div>
        <ChevronsUpDownIcon className="h-4 w-4 shrink-0 opacity-50" />
      </button>
    </PopoverTrigger>
  );
}

// Content component
interface WorkspaceContentProps
  extends React.ComponentProps<typeof PopoverContent> {
  renderWorkspace?: (
    workspace: Workspace,
    isSelected: boolean,
  ) => React.ReactNode;
  title?: string;
  searchable?: boolean;
  onSearch?: (query: string) => void;
}

function WorkspaceContent({
  className,
  children,
  renderWorkspace,
  title = 'Workspaces',
  searchable = false,
  onSearch,
  ...props
}: WorkspaceContentProps) {
  const {
    workspaces,
    selectedWorkspace,
    onWorkspaceSelect,
    getWorkspaceId,
    getWorkspaceName,
  } = useWorkspaceContext();

  const [searchQuery, setSearchQuery] = React.useState('');

  const filteredWorkspaces = React.useMemo(() => {
    if (!searchQuery) return workspaces;
    return workspaces.filter((ws) =>
      getWorkspaceName(ws).toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [workspaces, searchQuery, getWorkspaceName]);

  React.useEffect(() => {
    onSearch?.(searchQuery);
  }, [searchQuery, onSearch]);

  const defaultRenderWorkspace = (
    workspace: Workspace,
    isSelected: boolean,
  ) => (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <WorkspaceAvatar
        workspace={workspace}
        name={getWorkspaceName(workspace)}
        className="h-6 w-6"
      />
      <div className="flex min-w-0 flex-1 flex-col items-start">
        <span className="truncate text-sm">{getWorkspaceName(workspace)}</span>
        {(workspace as any).plan && (
          <span className="text-muted-foreground text-xs">
            {(workspace as any).plan}
          </span>
        )}
      </div>
      {isSelected && <CheckIcon className="ml-auto h-4 w-4" />}
    </div>
  );

  return (
    <PopoverContent
      className={cn('p-0', className)}
      align={props.align || 'start'}
      {...props}
    >
      <div className="border-b px-3 py-2">
        <p className="text-muted-foreground text-sm font-medium">{title}</p>
      </div>

      {searchable && (
        <div className="border-b px-3 py-2">
          <input
            type="text"
            placeholder="Buscar workspaces..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="placeholder:text-muted-foreground w-full border-none bg-transparent text-sm outline-none"
          />
        </div>
      )}

      <div className="max-h-[300px] overflow-y-auto">
        {filteredWorkspaces.length === 0 ? (
          <div className="text-muted-foreground px-3 py-2 text-center text-sm">
            Nenhum workspace encontrado
          </div>
        ) : (
          <div className="p-1">
            {filteredWorkspaces.map((workspace) => {
              const isSelected =
                selectedWorkspace &&
                getWorkspaceId(selectedWorkspace) === getWorkspaceId(workspace);

              return (
                <button
                  key={getWorkspaceId(workspace)}
                  type="button"
                  data-testid={`workspace-option-${getWorkspaceId(workspace)}`}
                  aria-selected={!!isSelected}
                  onClick={() => onWorkspaceSelect(workspace)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm',
                    'hover:bg-accent hover:text-accent-foreground',
										'focus:outline-none',
										isSelected && 'bg-accent text-accent-foreground bg-[var(--paper-2)] text-[var(--ink)]',
                  )}
                >
                  {renderWorkspace
                    ? renderWorkspace(workspace, !!isSelected)
                    : defaultRenderWorkspace(workspace, !!isSelected)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {children && (
        <>
          <div className="border-t" />
          <div className="p-1">{children}</div>
        </>
      )}
    </PopoverContent>
  );
}

export { WorkspaceProvider as Workspaces, WorkspaceTrigger, WorkspaceContent };
