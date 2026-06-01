<script lang="ts">
  import { conflictState, clearConflict } from '../../stores/conflict.svelte';
  import Tooltip from './Tooltip.svelte';

  interface Props {
    onReload: () => void;
    onKeep: () => void;
  }
  let { onReload, onKeep }: Props = $props();

  function handleReload() {
    onReload();
    clearConflict();
  }

  function handleKeep() {
    onKeep();
    clearConflict();
  }
</script>

{#if conflictState()}
  <div class="conflict-banner" role="alert">
    <span class="conflict-icon codicon codicon-warning"></span>
    <span class="conflict-text">This request was modified externally (e.g., git pull).</span>
    <div class="conflict-actions">
      <button class="conflict-btn reload" onclick={handleReload}>Reload from Disk</button>
      <button class="conflict-btn keep" onclick={handleKeep}>Keep Your Changes</button>
    </div>
    <Tooltip text="Dismiss" position="bottom">
      <button class="conflict-dismiss" onclick={handleKeep} aria-label="Dismiss">
        <span class="codicon codicon-close"></span>
      </button>
    </Tooltip>
  </div>
{/if}

<style>
  .conflict-banner {
    display: flex;
    align-items: center;
    gap: 0.615rem;
    padding: 0.615rem 0.923rem;
    background: var(--hf-editorWidget-background);
    border-left: 3px solid var(--hf-editorWarning-foreground, #cca700);
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .conflict-icon {
    color: var(--hf-editorWarning-foreground, #cca700);
    font-size: 1.077rem;
    flex-shrink: 0;
  }

  .conflict-text {
    font-size: 0.923rem;
    color: var(--hf-foreground);
    flex: 1;
  }

  .conflict-actions {
    display: flex;
    gap: 0.462rem;
    flex-shrink: 0;
  }

  .conflict-btn {
    padding: 0.231rem 0.769rem;
    font-size: 0.846rem;
    border: 1px solid var(--hf-button-border, transparent);
    border-radius: 0.154rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .conflict-btn.reload {
    background: var(--hf-button-background, #0e639c);
    color: var(--hf-button-foreground, #fff);
  }

  .conflict-btn.reload:hover {
    background: var(--hf-button-hoverBackground, #1177bb);
  }

  .conflict-btn.keep {
    background: transparent;
    color: var(--hf-foreground);
    border-color: var(--hf-checkbox-border, rgba(255,255,255,0.2));
  }

  .conflict-btn.keep:hover {
    background: var(--hf-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
  }

  .conflict-dismiss {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.538rem;
    height: 1.538rem;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 0.308rem;
    color: var(--hf-foreground);
    cursor: pointer;
    opacity: 0.6;
    flex-shrink: 0;
  }

  .conflict-dismiss:hover {
    opacity: 1;
    background: var(--hf-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
  }

  .conflict-dismiss .codicon {
    font-size: 0.923rem;
  }
</style>
