<script lang="ts">
  import Tooltip from '../shared/Tooltip.svelte';

  export type ActionPanel = 'environments' | 'cookieJar' | 'mockServer' | 'settings';

  interface Props {
    activePanel: ActionPanel | null;
    activeEnvironmentName?: string;
    hasNoEnv: boolean;
    cookieCount: number;
    onselect: (panel: ActionPanel) => void;
  }

  let { activePanel, activeEnvironmentName, hasNoEnv, cookieCount, onselect }: Props = $props();

  const envTooltip = $derived(activeEnvironmentName ? `Environment: ${activeEnvironmentName}` : 'Environments');
  const cookieTooltip = $derived(cookieCount > 0 ? `Cookie Jars (${cookieCount} cookies)` : 'Cookie Jars');
</script>

<div class="sidebar-toolbar" role="toolbar" aria-label="Nouto tools">
  <Tooltip text={envTooltip}>
    <button class="toolbar-btn" class:active={activePanel === 'environments'} aria-pressed={activePanel === 'environments'} onclick={() => onselect('environments')} aria-label="Environments">
      <span class="codicon codicon-symbol-variable"></span>
      {#if hasNoEnv}
        <span class="action-badge action-badge-warning"></span>
      {/if}
    </button>
  </Tooltip>
  <Tooltip text={cookieTooltip}>
    <button class="toolbar-btn" class:active={activePanel === 'cookieJar'} aria-pressed={activePanel === 'cookieJar'} onclick={() => onselect('cookieJar')} aria-label="Cookie Jars">
      <span class="codicon codicon-globe"></span>
      {#if cookieCount > 0}
        <span class="action-badge action-badge-info">{cookieCount > 9 ? '9+' : cookieCount}</span>
      {/if}
    </button>
  </Tooltip>
  <Tooltip text="Mock Server">
    <button class="toolbar-btn" class:active={activePanel === 'mockServer'} aria-pressed={activePanel === 'mockServer'} onclick={() => onselect('mockServer')} aria-label="Mock Server">
      <span class="codicon codicon-server"></span>
    </button>
  </Tooltip>
  <span class="toolbar-spacer"></span>
  <Tooltip text="Settings">
    <button class="toolbar-btn" class:active={activePanel === 'settings'} aria-pressed={activePanel === 'settings'} onclick={() => onselect('settings')} aria-label="Settings">
      <span class="codicon codicon-gear"></span>
    </button>
  </Tooltip>
</div>

<style>
  .sidebar-toolbar {
    display: flex;
    align-items: center;
    gap: 0.154rem;
    padding: 0.462rem 0.769rem 0;
    flex-shrink: 0;
  }

  .toolbar-spacer {
    flex: 1;
  }

  .toolbar-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.154rem;
    height: 2.154rem;
    background: transparent;
    border: none;
    border-radius: 0.308rem;
    color: var(--hf-foreground);
    cursor: pointer;
    opacity: var(--hf-icon-opacity);
    transition: opacity 0.15s, background 0.15s;
  }

  .toolbar-btn:hover {
    opacity: var(--hf-icon-opacity-hover);
    background: var(--hf-list-hoverBackground);
  }

  .toolbar-btn.active {
    opacity: var(--hf-icon-opacity-active);
    background: var(--hf-inputOption-activeBackground);
  }

  .toolbar-btn .codicon {
    font-size: 1.231rem;
  }

  .action-badge {
    position: absolute;
    border: 1px solid var(--hf-sideBar-background, var(--hf-editor-background));
    pointer-events: none;
  }

  .action-badge-warning {
    top: 0.154rem;
    right: 0.154rem;
    width: 7px;
    height: 0.538rem;
    border-radius: 50%;
    background: var(--hf-notificationsWarningIcon-foreground, #cca700);
  }

  .action-badge-info {
    top: 0;
    right: 0;
    min-width: 1.077rem;
    height: 1.077rem;
    border-radius: 0.538rem;
    padding: 0 0.231rem;
    background: var(--hf-badge-background, #4d7bd4);
    color: var(--hf-badge-foreground, #fff);
    font-size: 0.615rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
</style>
