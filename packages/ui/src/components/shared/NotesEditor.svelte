<script lang="ts">
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import CopyButton from './CopyButton.svelte';

  interface Props {
    value: string;
    onchange: (value: string) => void;
  }
  let { value, onchange }: Props = $props();

  let mode = $state<'edit' | 'preview' | 'split'>('edit');
  let confirmingClear = $state(false);

  function handleInput(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    onchange(target.value);
  }

  function requestClear() {
    confirmingClear = true;
  }

  function confirmClear() {
    onchange('');
    confirmingClear = false;
  }

  function cancelClear() {
    confirmingClear = false;
  }

  let previewEl = $state<HTMLDivElement | null>(null);

  function syncScroll(e: Event) {
    if (!previewEl) return;
    const ta = e.target as HTMLTextAreaElement;
    const ratio = ta.scrollTop / (ta.scrollHeight - ta.clientHeight);
    previewEl.scrollTop = ratio * (previewEl.scrollHeight - previewEl.clientHeight);
  }

  const renderedHtml = $derived(
    value.trim() ? DOMPurify.sanitize(marked.parse(value, { async: false }) as string) : ''
  );
</script>

<div class="notes-editor">
  <div class="notes-toolbar">
    <button
      class="toolbar-btn"
      class:active={mode === 'edit'}
      onclick={() => (mode = 'edit')}
    >
      <span class="codicon codicon-edit"></span>
      Edit
    </button>
    <button
      class="toolbar-btn"
      class:active={mode === 'split'}
      onclick={() => (mode = 'split')}
    >
      <span class="codicon codicon-split-horizontal"></span>
      Split
    </button>
    <button
      class="toolbar-btn"
      class:active={mode === 'preview'}
      onclick={() => (mode = 'preview')}
    >
      <span class="codicon codicon-open-preview"></span>
      Preview
    </button>
    {#if value.trim()}
      <div class="toolbar-spacer"></div>
      <CopyButton text={value} />
      {#if confirmingClear}
        <span class="clear-confirm-label">Clear all notes?</span>
        <button class="toolbar-btn danger" onclick={confirmClear}>Yes, clear</button>
        <button class="toolbar-btn" onclick={cancelClear}>Cancel</button>
      {:else}
        <button class="toolbar-btn" onclick={requestClear}>
          <span class="codicon codicon-trash"></span>
          Clear
        </button>
      {/if}
    {/if}
  </div>

  {#if mode === 'split'}
    <div class="notes-split">
      <textarea
        class="notes-textarea split"
        placeholder="Add notes or description (Markdown supported)..."
        value={value}
        oninput={handleInput}
        onscroll={syncScroll}
      ></textarea>
      <div class="split-divider"></div>
      <div class="notes-preview split" bind:this={previewEl}>
        {#if renderedHtml}
          {@html renderedHtml}
        {:else}
          <p class="empty-preview">Nothing to preview</p>
        {/if}
      </div>
    </div>
  {:else if mode === 'edit'}
    <textarea
      class="notes-textarea"
      placeholder="Add notes or description (Markdown supported)..."
      value={value}
      oninput={handleInput}
    ></textarea>
  {:else}
    <div class="notes-preview">
      {#if renderedHtml}
        {@html renderedHtml}
      {:else}
        <p class="empty-preview">Nothing to preview</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .notes-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .notes-toolbar {
    display: flex;
    gap: 2px;
    padding: 0 0 8px 0;
    border-bottom: 1px solid var(--hf-panel-border);
    margin-bottom: 8px;
  }

  .toolbar-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--hf-foreground);
    font-size: 12px;
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.15s, border-color 0.15s;
  }

  .toolbar-btn:hover {
    opacity: 1;
  }

  .toolbar-btn.active {
    opacity: 1;
    border-bottom-color: var(--hf-focusBorder);
  }

  .toolbar-spacer {
    flex: 1;
  }

  .toolbar-btn.danger {
    color: var(--hf-errorForeground);
    opacity: 1;
  }

  .toolbar-btn.danger:hover {
    opacity: 0.8;
  }

  .clear-confirm-label {
    font-size: 12px;
    color: var(--hf-descriptionForeground);
    align-self: center;
    margin-right: 2px;
  }

  .notes-textarea {
    flex: 1;
    width: 100%;
    min-height: 120px;
    padding: 10px 12px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, transparent);
    border-radius: 4px;
    font-family: var(--hf-font-family, sans-serif);
    font-size: 13px;
    line-height: 1.5;
    resize: vertical;
  }

  .notes-textarea:focus {
    outline: none;
    border-color: var(--hf-focusBorder);
  }

  .notes-textarea::placeholder {
    color: var(--hf-input-placeholderForeground);
  }

  .notes-preview {
    flex: 1;
    min-height: 120px;
    padding: 10px 12px;
    background: var(--hf-input-background);
    border: 1px solid var(--hf-input-border, transparent);
    border-radius: 4px;
    font-size: 13px;
    line-height: 1.6;
    overflow: auto;
    overflow-wrap: break-word;
    word-break: break-word;
    color: var(--hf-foreground);
  }

  .empty-preview {
    color: var(--hf-descriptionForeground);
    font-style: italic;
    margin: 0;
  }

  /* Markdown element styles */
  .notes-preview :global(h1),
  .notes-preview :global(h2),
  .notes-preview :global(h3),
  .notes-preview :global(h4),
  .notes-preview :global(h5),
  .notes-preview :global(h6) {
    margin: 0.8em 0 0.4em 0;
    font-weight: 600;
    color: var(--hf-foreground);
  }

  .notes-preview :global(h1) { font-size: 1.4em; }
  .notes-preview :global(h2) { font-size: 1.2em; }
  .notes-preview :global(h3) { font-size: 1.1em; }

  .notes-preview :global(p) {
    margin: 0.5em 0;
  }

  .notes-preview :global(code) {
    background: var(--hf-textCodeBlock-background, rgba(127, 127, 127, 0.15));
    padding: 1px 4px;
    border-radius: 3px;
    font-family: var(--hf-editor-font-family, monospace);
    font-size: 0.9em;
  }

  .notes-preview :global(pre) {
    background: var(--hf-textCodeBlock-background, rgba(127, 127, 127, 0.15));
    padding: 10px 12px;
    border-radius: 4px;
    overflow-x: auto;
    margin: 0.5em 0;
  }

  .notes-preview :global(pre code) {
    background: transparent;
    padding: 0;
  }

  .notes-preview :global(blockquote) {
    margin: 0.5em 0;
    padding: 4px 12px;
    border-left: 3px solid var(--hf-focusBorder);
    color: var(--hf-descriptionForeground);
  }

  .notes-preview :global(ul),
  .notes-preview :global(ol) {
    margin: 0.5em 0;
    padding-left: 24px;
  }

  .notes-preview :global(li) {
    margin: 0.2em 0;
  }

  .notes-preview :global(a) {
    color: var(--hf-textLink-foreground);
  }

  .notes-preview :global(hr) {
    border: none;
    border-top: 1px solid var(--hf-panel-border);
    margin: 1em 0;
  }

  .notes-preview :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 0.5em 0;
  }

  .notes-preview :global(th),
  .notes-preview :global(td) {
    border: 1px solid var(--hf-panel-border);
    padding: 6px 10px;
    text-align: left;
  }

  .notes-preview :global(th) {
    background: var(--hf-textCodeBlock-background, rgba(127, 127, 127, 0.1));
    font-weight: 600;
  }

  /* Split mode */
  .notes-split {
    display: flex;
    flex: 1;
    min-height: 120px;
  }

  .notes-textarea.split {
    flex: 1;
    resize: none;
    border-radius: 4px 0 0 4px;
    border-right: none;
  }

  .split-divider {
    width: 1px;
    background: var(--hf-panel-border);
    flex-shrink: 0;
  }

  .notes-preview.split {
    flex: 1;
    border-radius: 0 4px 4px 0;
  }
</style>
