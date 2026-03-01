<script lang="ts">
  import CopyButton from './CopyButton.svelte';

  interface Props {
    path: string;
  }
  let { path }: Props = $props();
</script>

{#if path}
  <div class="json-path-bar">
    <span class="path-text">{path}</span>
    <CopyButton text={path} iconOnly title="Copy path" class="path-copy-btn" />
  </div>
{/if}

<style>
  .json-path-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: var(--hf-textCodeBlock-background, rgba(128, 128, 128, 0.08));
    border-top: 1px solid var(--hf-panel-border, rgba(128, 128, 128, 0.2));
    color: var(--hf-descriptionForeground, #888);
    font-family: var(--hf-editor-font-family, Consolas, Monaco, monospace);
    font-size: 11px;
    flex-shrink: 0;
    width: 100%;
  }

  .path-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  :global(.path-copy-btn) {
    flex-shrink: 0;
    opacity: 0.4;
    transition: opacity 0.15s;
  }

  .json-path-bar:hover :global(.path-copy-btn) {
    opacity: 0.7;
  }

  :global(.path-copy-btn:hover) {
    opacity: 1 !important;
  }
</style>
