// Workspace store: tracks the currently open project directory and its metadata.

export interface WorkspaceMeta {
  name?: string;
  description?: string;
}

export interface RecentWorkspace {
  path: string;
  name: string;
}

interface WorkspaceState {
  currentPath: string | null;
  meta: WorkspaceMeta | null;
  recents: RecentWorkspace[];
}

const state = $state<WorkspaceState>({
  currentPath: null,
  meta: null,
  recents: [],
});

function basename(p: string): string {
  if (!p) return '';
  const parts = p.replace(/[\\/]+$/, '').split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

export function workspace() {
  return state;
}

export function currentWorkspaceName(): string | null {
  if (state.meta?.name && state.meta.name.trim()) return state.meta.name.trim();
  if (state.currentPath) return basename(state.currentPath);
  return null;
}

export function setCurrentWorkspacePath(path: string | null) {
  state.currentPath = path;
  if (!path) state.meta = null;
}

export function setCurrentWorkspaceMeta(meta: WorkspaceMeta | null) {
  state.meta = meta;
}

export function setRecentWorkspaces(list: RecentWorkspace[]) {
  state.recents = list;
}
