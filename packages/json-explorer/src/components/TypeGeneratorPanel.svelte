<script lang="ts">
  import { generateTypes, type TargetLanguage } from '../lib/type-generators';
  import { explorerState, selectedPath } from '../stores/jsonExplorer.svelte';
  import { getValueAtPath } from '../lib/path-utils';
  import { copyToClipboard } from '@nouto/ui/lib/clipboard';
  import Tooltip from '@nouto/ui/components/shared/Tooltip.svelte';

  interface Props {
    onClose?: () => void;
  }
  let { onClose }: Props = $props();

  let language = $state<TargetLanguage>('typescript');
  let copied = $state(false);

  const targetValue = $derived.by(() => {
    if (explorerState().rawJson === undefined) return undefined;
    if (selectedPath() && selectedPath() !== '$') {
      return getValueAtPath(explorerState().rawJson, selectedPath());
    }
    return explorerState().rawJson;
  });

  const generated = $derived.by(() => {
    if (targetValue === undefined) return '';
    try {
      return generateTypes(targetValue, language);
    } catch {
      return '// Could not generate types for this value';
    }
  });

  const languages: { id: TargetLanguage; label: string }[] = [
    { id: 'typescript', label: 'TypeScript' },
    { id: 'zod', label: 'Zod' },
    { id: 'rust', label: 'Rust' },
    { id: 'go', label: 'Go' },
    { id: 'python', label: 'Python' },
    { id: 'json-schema', label: 'JSON Schema' },
  ];

  async function handleCopy() {
    if (generated) {
      await copyToClipboard(generated);
      copied = true;
      setTimeout(() => { copied = false; }, 1500);
    }
  }
</script>

<div class="type-gen-panel">
  <div class="type-gen-header">
    <span class="type-gen-title">
      <i class="codicon codicon-symbol-interface"></i>
      Type Generator
    </span>
    <div class="language-selector">
      {#each languages as lang}
        <button
          class="lang-btn"
          class:active={language === lang.id}
          onclick={() => { language = lang.id; }}
        >{lang.label}</button>
      {/each}
    </div>
    <div class="type-gen-actions">
      <Tooltip text={copied ? 'Copied' : 'Copy to clipboard'}>
        <button class="action-btn" onclick={handleCopy} aria-label="Copy generated types">
          <i class="codicon {copied ? 'codicon-check' : 'codicon-copy'}"></i>
        </button>
      </Tooltip>
      {#if onClose}
        <button class="action-btn" onclick={onClose} aria-label="Close">
          <i class="codicon codicon-close"></i>
        </button>
      {/if}
    </div>
  </div>
  {#if selectedPath() && selectedPath() !== '$'}
    <div class="type-gen-scope">Generating from: <code>{selectedPath()}</code></div>
  {/if}
  <div class="type-gen-content">
    <pre class="generated-code">{generated}</pre>
  </div>
</div>

<style>
  .type-gen-panel {
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid var(--hf-panel-border);
    max-height: 300px;
    flex-shrink: 0;
  }

  .type-gen-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .type-gen-title {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    color: var(--hf-editor-foreground);
    white-space: nowrap;
  }

  .language-selector {
    display: flex;
    gap: 2px;
    flex: 1;
    overflow-x: auto;
  }

  .lang-btn {
    padding: 2px 8px;
    background: transparent;
    color: var(--hf-descriptionForeground);
    border: 1px solid transparent;
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
    white-space: nowrap;
  }

  .lang-btn:hover {
    background: var(--hf-toolbar-hoverBackground);
  }

  .lang-btn.active {
    background: var(--hf-inputOption-activeBackground);
    border-color: var(--hf-inputOption-activeBorder);
    color: var(--hf-inputOption-activeForeground);
  }

  .type-gen-actions {
    display: flex;
    gap: 2px;
    margin-left: auto;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    padding: 3px;
    background: none;
    border: none;
    color: var(--hf-icon-foreground);
    cursor: pointer;
    border-radius: 3px;
  }

  .action-btn:hover {
    background: var(--hf-toolbar-hoverBackground);
  }

  .type-gen-scope {
    padding: 3px 12px;
    font-size: 10px;
    color: var(--hf-descriptionForeground);
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .type-gen-scope code {
    font-family: var(--hf-editor-font-family);
    color: var(--hf-textLink-foreground);
  }

  .type-gen-content {
    flex: 1;
    overflow: auto;
    padding: 8px 12px;
  }

  .generated-code {
    margin: 0;
    font-family: var(--hf-editor-font-family);
    font-size: 12px;
    line-height: 1.5;
    color: var(--hf-editor-foreground);
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
