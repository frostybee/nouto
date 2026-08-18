<script lang="ts">
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { toggleSidebar, ui } from '@nouto/ui/stores/ui.svelte';
  import EnvironmentSelector from '@nouto/ui/components/shared/EnvironmentSelector.svelte';
  import Tooltip from '@nouto/ui/components/shared/Tooltip.svelte';
  import WorkspaceMenu from './WorkspaceMenu.svelte';
  import WindowControls from './WindowControls.svelte';
  import { isMacOS } from '../lib/platform';
  import { resolvedShortcuts } from '@nouto/ui/stores/settings.svelte';
  import { bindingToDisplayString } from '@nouto/ui/lib/shortcuts';

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
  }: Props = $props();

  const shortcuts = $derived(resolvedShortcuts());
  const searchShortcutLabel = $derived.by(() => {
    const binding = shortcuts.get('openCommandPalette');
    return binding ? bindingToDisplayString(binding) : 'Ctrl+K';
  });
  const sidebarTooltip = $derived.by(() => {
    const binding = shortcuts.get('toggleSidebar');
    const label = ui.sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar';
    return binding ? `${label} (${bindingToDisplayString(binding)})` : label;
  });

  function handleDblClick(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('button, .dropdown, .search-field, [data-no-drag]'))
      return;
    getCurrentWindow().toggleMaximize();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<header
  class="top-toolbar"
  class:macos={isMacOS()}
  data-tauri-drag-region
  ondblclick={handleDblClick}
>
  <div class="left" data-tauri-drag-region>
    <Tooltip text={sidebarTooltip}>
      <button class="icon-btn" onclick={toggleSidebar} aria-label="Toggle sidebar">
        <span class="codicon codicon-layout-sidebar-left"></span>
      </button>
    </Tooltip>

    <div class="brand" data-tauri-drag-region>
      <img src={iconUrl} alt="" class="brand-icon" data-tauri-drag-region />
      <span class="brand-name" data-tauri-drag-region>Nouto</span>
    </div>

    <span class="sep" data-tauri-drag-region>›</span>

    <WorkspaceMenu
      {onOpenFolder}
      {onNewProject}
      {onOpenRecent}
      {onRemoveRecent}
      {onCloseProject}
      onOpenSettings={onOpenWorkspaceSettings}
    />

    <span class="sep" data-tauri-drag-region>›</span>

    <EnvironmentSelector />
  </div>

  <div class="center" data-tauri-drag-region>
    <button
      class="search-field"
      onclick={onSearch}
      title="Search ({searchShortcutLabel})"
      aria-label="Search"
    >
      <span class="codicon codicon-search"></span>
      <span class="search-placeholder">Search</span>
      <span class="search-shortcut">{searchShortcutLabel}</span>
    </button>
  </div>

  <div class="right" data-tauri-drag-region>
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
    padding: 0.462rem 0 0.462rem 0.615rem;
    gap: 0.923rem;
    background: var(--hf-titleBar-activeBackground, var(--hf-editor-background));
    color: var(--hf-titleBar-activeForeground, var(--hf-editor-foreground));
    border-bottom: 1px solid var(--hf-panel-border);
    font-size: 0.923rem;
    flex-shrink: 0;
    user-select: none;
    overflow: visible;
  }

  .top-toolbar.macos {
    padding-left: 6rem;
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
    gap: 0.462rem;
    min-width: 0;
  }

  .right {
    display: flex;
    align-items: stretch;
    align-self: stretch;
    gap: 0.615rem;
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
    width: 2rem;
    height: 2rem;
    border: none;
    background: transparent;
    color: inherit;
    border-radius: 0.308rem;
    cursor: pointer;
    padding: 0;
  }
  .icon-btn:hover {
    background: var(--hf-toolbar-hoverBackground, rgba(127, 127, 127, 0.18));
  }
  .icon-btn .codicon {
    font-size: 1.231rem;
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 0.462rem;
    padding: 0 0.308rem;
  }
  .brand-icon {
    width: 1.231rem;
    height: 1.231rem;
    display: block;
  }
  .brand-name {
    font-weight: 600;
  }

  .sep {
    opacity: 0.5;
    padding: 0 0.154rem;
  }

  .search-field {
    display: inline-flex;
    align-items: center;
    gap: 0.615rem;
    width: 100%;
    max-width: 40rem;
    height: 2.154rem;
    padding: 0 0.769rem;
    background: var(--hf-input-background);
    color: var(--hf-descriptionForeground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 0.308rem;
    cursor: pointer;
    font-size: 0.923rem;
    font-family: inherit;
    text-align: left;
    transition:
      border-color 0.15s,
      color 0.15s;
  }
  .search-field:hover,
  .search-field:focus-visible {
    border-color: var(--hf-focusBorder);
    color: var(--hf-foreground);
    outline: none;
  }
  .search-field .codicon {
    font-size: 1.077rem;
  }

  .search-placeholder {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .search-shortcut {
    padding: 0.077rem 0.462rem;
    border: 1px solid var(--hf-panel-border);
    border-radius: 0.231rem;
    font-size: 0.769rem;
    color: var(--hf-descriptionForeground);
    background: var(--hf-editor-background, transparent);
    flex-shrink: 0;
  }
</style>
