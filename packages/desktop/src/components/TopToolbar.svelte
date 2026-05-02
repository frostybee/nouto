<script lang="ts">
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { toggleSidebar, ui } from '@nouto/ui/stores/ui.svelte';
  import EnvironmentSelector from '@nouto/ui/components/shared/EnvironmentSelector.svelte';
  import WorkspaceMenu from './WorkspaceMenu.svelte';
  import WindowControls from './WindowControls.svelte';
  import { isMacOS } from '../lib/platform';

  interface Props {
    iconUrl: string;
    onSearch: () => void;
    onSettings: () => void;
    onOpenFolder: () => void;
    onNewProject: () => void;
    onOpenRecent: (path: string) => void;
    onRemoveRecent: (path: string) => void;
    onCloseProject: () => void;
    onOpenWorkspaceSettings: () => void;
    onClearHistory: () => void;
  }

  let {
    iconUrl,
    onSearch,
    onSettings,
    onOpenFolder,
    onNewProject,
    onOpenRecent,
    onRemoveRecent,
    onCloseProject,
    onOpenWorkspaceSettings,
    onClearHistory,
  }: Props = $props();

  function handleDblClick(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('button, .dropdown, .search-field, [data-no-drag]')) return;
    getCurrentWindow().toggleMaximize();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<header class="top-toolbar" class:macos={isMacOS()} data-tauri-drag-region ondblclick={handleDblClick}>
  <div class="left">
    <button
      class="icon-btn"
      onclick={toggleSidebar}
      title={ui.sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
      aria-label="Toggle sidebar"
    >
      <span class="codicon codicon-layout-sidebar-left"></span>
    </button>

    <div class="brand">
      <img src={iconUrl} alt="" class="brand-icon" />
      <span class="brand-name">Nouto</span>
    </div>

    <span class="sep">›</span>

    <WorkspaceMenu
      {onOpenFolder}
      {onNewProject}
      {onOpenRecent}
      {onRemoveRecent}
      {onCloseProject}
      onOpenSettings={onOpenWorkspaceSettings}
      {onClearHistory}
    />

    <span class="sep">›</span>

    <EnvironmentSelector />
  </div>

  <div class="center">
    <button class="search-field" onclick={onSearch} title="Search (Ctrl+K)" aria-label="Search">
      <span class="codicon codicon-search"></span>
      <span class="search-placeholder">Search</span>
      <span class="search-shortcut">Ctrl+K</span>
    </button>
  </div>

  <div class="right">
    <button class="icon-btn" onclick={onSettings} title="Settings" aria-label="Settings">
      <span class="codicon codicon-settings-gear"></span>
    </button>
    <WindowControls />
  </div>
</header>

<style>
  .top-toolbar {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    height: 36px;
    padding: 0 0 0 8px;
    gap: 12px;
    background: var(--hf-titleBar-activeBackground, var(--hf-editor-background));
    color: var(--hf-titleBar-activeForeground, var(--hf-editor-foreground));
    border-bottom: 1px solid var(--hf-panel-border);
    font-size: 12px;
    flex-shrink: 0;
    user-select: none;
    overflow: visible;
  }

  .top-toolbar.macos {
    padding-left: 78px;
  }

  .top-toolbar :global(button),
  .top-toolbar :global(.search-field),
  .top-toolbar :global(.dropdown),
  .top-toolbar :global(select) {
    -webkit-app-region: no-drag;
  }

  .left {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .right {
    display: flex;
    align-items: stretch;
    align-self: stretch;
    gap: 8px;
    min-width: 0;
    justify-content: flex-end;
    overflow: visible;
  }

  .center {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    align-self: center;
    width: 26px;
    height: 26px;
    border: none;
    background: transparent;
    color: inherit;
    border-radius: 4px;
    cursor: pointer;
    padding: 0;
  }
  .icon-btn:hover { background: var(--hf-toolbar-hoverBackground, rgba(127, 127, 127, 0.18)); }
  .icon-btn .codicon { font-size: 16px; }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 4px;
  }
  .brand-icon { width: 16px; height: 16px; display: block; }
  .brand-name { font-weight: 600; }

  .sep {
    opacity: 0.5;
    padding: 0 2px;
  }

  .search-field {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    max-width: 520px;
    height: 28px;
    padding: 0 10px;
    background: var(--hf-input-background);
    color: var(--hf-descriptionForeground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-family: inherit;
    text-align: left;
    transition: border-color 0.15s, color 0.15s;
  }
  .search-field:hover,
  .search-field:focus-visible {
    border-color: var(--hf-focusBorder);
    color: var(--hf-foreground);
    outline: none;
  }
  .search-field .codicon { font-size: 14px; }

  .search-placeholder {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .search-shortcut {
    padding: 1px 6px;
    border: 1px solid var(--hf-panel-border);
    border-radius: 3px;
    font-size: 10px;
    color: var(--hf-descriptionForeground);
    background: var(--hf-editor-background, transparent);
    flex-shrink: 0;
  }
</style>
