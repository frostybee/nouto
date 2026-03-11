<script lang="ts">
  import type { Collection } from '../../types';
  import CollectionSaveButton from './CollectionSaveButton.svelte';
  import Tooltip from './Tooltip.svelte';

  interface Props {
    collectionId: string | null;
    collectionName: string | null;
    collections: Collection[];
    onSaveToCollection: () => void;
    onDismiss: () => void;
  }
  let { collectionId, collectionName, collections, onSaveToCollection, onDismiss }: Props = $props();
</script>

<div class="nudge-banner">
  <span class="nudge-icon codicon codicon-info"></span>
  <span class="nudge-text">This request isn't saved to any collection.</span>
  <CollectionSaveButton {collectionId} {collectionName} {collections} {onSaveToCollection} />
  <Tooltip text="Dismiss" position="top">
    <button class="nudge-dismiss" onclick={onDismiss} aria-label="Dismiss">
      <span class="codicon codicon-close"></span>
    </button>
  </Tooltip>
</div>

<style>
  .nudge-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--hf-editorWidget-background);
    border-left: 3px solid var(--hf-editorInfo-foreground, #3794ff);
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .nudge-icon {
    color: var(--hf-editorInfo-foreground, #3794ff);
    font-size: 14px;
    flex-shrink: 0;
  }

  .nudge-text {
    font-size: 12px;
    color: var(--hf-foreground);
    flex: 1;
  }

  .nudge-dismiss {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--hf-foreground);
    cursor: pointer;
    opacity: 0.6;
    flex-shrink: 0;
  }

  .nudge-dismiss:hover {
    opacity: 1;
    background: var(--hf-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
  }

  .nudge-dismiss .codicon {
    font-size: 12px;
  }
</style>
