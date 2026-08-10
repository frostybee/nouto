<script lang="ts">
  import SlidePanel from '@nouto/ui/components/shared/SlidePanel.svelte';
  import { setComparisonJson } from '../stores/jsonExplorer.svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
  }
  let { open, onclose }: Props = $props();

  let pasteText = $state('');
  let parseError = $state<string | null>(null);

  // Reset when the dialog is reopened
  $effect(() => {
    if (open) {
      parseError = null;
    }
  });

  async function pasteFromClipboard() {
    // Best-effort: clipboard read may be blocked in restricted webview contexts.
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        pasteText = text;
        parseError = null;
      }
    } catch {
      parseError = 'Clipboard access is not available — paste into the text area instead.';
    }
  }

  function handleCompare() {
    const text = pasteText.trim();
    if (!text) {
      parseError = 'Paste a JSON document to compare against.';
      return;
    }
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (e: any) {
      parseError = `Invalid JSON: ${e?.message ?? 'parse error'}`;
      return;
    }
    parseError = null;
    setComparisonJson(parsed);
    onclose();
  }
</script>

<SlidePanel {open} title="Compare JSON" width={340} {onclose}>
  <div class="compare-body">
    <p class="compare-hint">
      Paste a second JSON document to compare it against the current one.
    </p>
    <textarea
      class="compare-input"
      bind:value={pasteText}
      placeholder={'{ "paste": "JSON here" }'}
      spellcheck="false"
      rows="12"
    ></textarea>
    {#if parseError}
      <div class="compare-error">
        <i class="codicon codicon-error"></i>
        <span>{parseError}</span>
      </div>
    {/if}
    <div class="compare-actions">
      <button class="compare-btn secondary" onclick={pasteFromClipboard}>
        <i class="codicon codicon-clippy"></i>
        Paste from clipboard
      </button>
      <button class="compare-btn primary" onclick={handleCompare} disabled={!pasteText.trim()}>
        <i class="codicon codicon-diff"></i>
        Compare
      </button>
    </div>
  </div>
</SlidePanel>

<style>
  .compare-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
  }

  .compare-hint {
    margin: 0;
    font-size: 0.923rem;
    color: var(--hf-descriptionForeground);
  }

  .compare-input {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    min-height: 120px;
    padding: 6px 8px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border);
    border-radius: 3px;
    font-family: var(--hf-editor-font-family);
    font-size: 0.923rem;
  }

  .compare-input:focus {
    outline: 1px solid var(--hf-focusBorder);
    outline-offset: -1px;
  }

  .compare-error {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: 0.846rem;
    color: var(--hf-errorForeground);
    word-break: break-word;
  }

  .compare-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
  }

  .compare-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 0.846rem;
  }

  .compare-btn.primary {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
  }

  .compare-btn.primary:hover:not(:disabled) {
    background: var(--hf-button-hoverBackground);
  }

  .compare-btn.primary:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .compare-btn.secondary {
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
  }

  .compare-btn.secondary:hover {
    background: var(--hf-button-secondaryHoverBackground);
  }
</style>
