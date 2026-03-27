<script lang="ts">
  import { explorerState, selectedPath } from '../../stores/jsonExplorer.svelte';
  import { getValueAtPath } from '../../lib/json-explorer/path-utils';
  import { copyToClipboard } from '../../lib/clipboard';
  import {
    toFormattedJson, toMinifiedJson, toYaml, toCsv,
    toTypeScriptType, toPythonDict, toPhpArray, toMarkdownTable,
  } from '../../lib/json-explorer/copy-formats';
  import Tooltip from '../shared/Tooltip.svelte';

  let menuOpen = $state(false);
  let menuRef = $state<HTMLDivElement>(undefined!);
  let copied = $state<string | null>(null);

  $effect(() => {
    if (menuOpen) {
      const handler = (e: MouseEvent) => {
        if (menuRef && !menuRef.contains(e.target as Node)) {
          menuOpen = false;
        }
      };
      document.addEventListener('click', handler, true);
      return () => document.removeEventListener('click', handler, true);
    }
  });

  function getTargetValue(): any {
    if (explorerState().rawJson === undefined) return undefined;
    if (selectedPath()) {
      return getValueAtPath(explorerState().rawJson, selectedPath());
    }
    return explorerState().rawJson;
  }

  async function copyAs(format: string) {
    const value = getTargetValue();
    if (value === undefined) return;

    let text = '';
    switch (format) {
      case 'json': text = toFormattedJson(value); break;
      case 'minified': text = toMinifiedJson(value); break;
      case 'yaml': text = toYaml(value); break;
      case 'csv': text = toCsv(value); break;
      case 'typescript': text = toTypeScriptType(value); break;
      case 'python': text = toPythonDict(value); break;
      case 'php': text = toPhpArray(value); break;
      case 'markdown': text = toMarkdownTable(value); break;
    }

    if (text) {
      await copyToClipboard(text);
      copied = format;
      setTimeout(() => { copied = null; }, 1500);
    }
    menuOpen = false;
  }

  const isArray = $derived.by(() => {
    const val = getTargetValue();
    return Array.isArray(val);
  });

  interface FormatItem {
    id: string;
    label: string;
    icon: string;
    arrayOnly?: boolean;
  }

  const formats: FormatItem[] = [
    { id: 'json', label: 'JSON (formatted)', icon: 'codicon-json' },
    { id: 'minified', label: 'JSON (minified)', icon: 'codicon-code' },
    { id: 'yaml', label: 'YAML', icon: 'codicon-file-code' },
    { id: 'typescript', label: 'TypeScript', icon: 'codicon-symbol-interface' },
    { id: 'python', label: 'Python', icon: 'codicon-symbol-method' },
    { id: 'php', label: 'PHP array', icon: 'codicon-code' },
    { id: 'csv', label: 'CSV', icon: 'codicon-table', arrayOnly: true },
    { id: 'markdown', label: 'Markdown table', icon: 'codicon-markdown', arrayOnly: true },
  ];
</script>

<div class="copy-as-container" bind:this={menuRef}>
  <Tooltip text="Copy as...">
    <button
      class="toolbar-btn"
      onclick={() => { menuOpen = !menuOpen; }}
      aria-label="Copy as format"
    >
      <i class="codicon codicon-clippy"></i>
      <i class="codicon codicon-chevron-down copy-chevron"></i>
    </button>
  </Tooltip>
  {#if menuOpen}
    <div class="copy-menu">
      {#each formats as fmt}
        {#if !fmt.arrayOnly || isArray}
          <button class="copy-menu-item" onclick={() => copyAs(fmt.id)}>
            <i class="codicon {fmt.icon}"></i>
            <span>{fmt.label}</span>
            {#if copied === fmt.id}
              <i class="codicon codicon-check copied-icon"></i>
            {/if}
          </button>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .copy-as-container {
    position: relative;
  }

  .toolbar-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 3px 6px;
    background: transparent;
    color: var(--vscode-icon-foreground, #c5c5c5);
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 14px;
  }

  .toolbar-btn:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
  }

  .copy-chevron {
    font-size: 10px;
  }

  .copy-menu {
    position: absolute;
    top: 100%;
    right: 0;
    z-index: 100;
    min-width: 180px;
    background: var(--vscode-menu-background, #252526);
    border: 1px solid var(--vscode-menu-border, #454545);
    border-radius: 4px;
    padding: 4px 0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .copy-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 4px 12px;
    background: none;
    color: var(--vscode-menu-foreground, #ccc);
    border: none;
    cursor: pointer;
    font-size: 12px;
    text-align: left;
    white-space: nowrap;
  }

  .copy-menu-item:hover {
    background: var(--vscode-menu-selectionBackground, #094771);
    color: var(--vscode-menu-selectionForeground, #fff);
  }

  .copy-menu-item .codicon {
    font-size: 14px;
    width: 14px;
    text-align: center;
  }

  .copied-icon {
    margin-left: auto;
    color: var(--vscode-charts-green, #89d185);
  }
</style>
