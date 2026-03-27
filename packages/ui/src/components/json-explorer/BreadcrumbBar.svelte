<script lang="ts">
  import { breadcrumbSegments, navigateToBreadcrumb, selectedPath } from '../../stores/jsonExplorer.svelte';
  import { copyToClipboard } from '../../lib/clipboard';
  import Tooltip from '../shared/Tooltip.svelte';

  let copied = $state(false);

  async function handleCopyPath() {
    const path = selectedPath() || '$';
    const ok = await copyToClipboard(path);
    if (ok) {
      copied = true;
      setTimeout(() => { copied = false; }, 1500);
    }
  }
</script>

<div class="breadcrumb-bar">
  <div class="breadcrumb-segments">
    {#each breadcrumbSegments() as segment, i}
      {#if i > 0}
        <span class="separator">
          <i class="codicon codicon-chevron-right"></i>
        </span>
      {/if}
      <button
        class="breadcrumb-segment"
        class:active={segment.path === selectedPath()}
        onclick={() => navigateToBreadcrumb(segment.path)}
      >
        {segment.label}
      </button>
    {/each}
  </div>
  <Tooltip text={copied ? 'Copied' : 'Copy path'}>
    <button class="copy-path-btn" onclick={handleCopyPath} aria-label="Copy path">
      <i class="codicon {copied ? 'codicon-check' : 'codicon-copy'}"></i>
    </button>
  </Tooltip>
</div>

<style>
  .breadcrumb-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-bottom: 1px solid var(--vscode-panel-border, #2b2b2b);
    flex-shrink: 0;
    min-height: 24px;
    overflow: hidden;
  }

  .breadcrumb-segments {
    display: flex;
    align-items: center;
    gap: 2px;
    overflow: hidden;
    flex: 1;
  }

  .separator {
    color: var(--vscode-breadcrumb-foreground, #8b8b8b);
    font-size: 10px;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
  }

  .breadcrumb-segment {
    padding: 1px 4px;
    background: none;
    border: none;
    color: var(--vscode-breadcrumb-foreground, #8b8b8b);
    font-family: var(--vscode-editor-font-family, Consolas, Monaco, monospace);
    font-size: 11px;
    cursor: pointer;
    border-radius: 3px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .breadcrumb-segment:hover {
    background: var(--vscode-breadcrumb-background, rgba(128, 128, 128, 0.1));
    color: var(--vscode-breadcrumb-focusForeground, #e0e0e0);
  }

  .breadcrumb-segment.active {
    color: var(--vscode-breadcrumb-activeSelectionForeground, #e0e0e0);
    font-weight: 600;
  }

  .copy-path-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 2px 4px;
    background: none;
    border: none;
    color: var(--vscode-icon-foreground, #c5c5c5);
    cursor: pointer;
    border-radius: 3px;
    font-size: 12px;
    flex-shrink: 0;
  }

  .copy-path-btn:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
  }
</style>
