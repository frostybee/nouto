<script lang="ts">
  import type { SettingsInitData } from '../../stores/collectionSettings.svelte';
  import CollectionSettingsPanel from './CollectionSettingsPanel.svelte';

  interface Props {
    initialData: SettingsInitData;
    onsave: (data: any) => void;
    onclose: () => void;
  }

  let { initialData, onsave, onclose }: Props = $props();

  function interceptMessage(msg: any) {
    if (msg.type === 'saveCollectionSettings' || msg.type === 'saveFolderSettings') {
      onsave(msg.data);
    } else if (msg.type === 'closeSettingsPanel') {
      onclose();
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onclose();
    }
  }
</script>

<div class="dialog-backdrop" role="presentation" onclick={handleBackdropClick}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Collection Settings">
    <div class="dialog-body">
      <CollectionSettingsPanel postMessage={interceptMessage} {initialData} />
    </div>
  </div>
</div>

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
  }

  .dialog {
    width: 85vw;
    height: 85vh;
    max-width: 1400px;
    max-height: 900px;
    display: flex;
    flex-direction: column;
    background: var(--hf-editor-background);
    border: 1px solid var(--hf-editorWidget-border, var(--hf-panel-border));
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    overflow: hidden;
    animation: dialogIn 0.15s ease-out;
  }

  @keyframes dialogIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .dialog-body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .dialog-body :global(.settings-panel) {
    height: 100%;
  }
</style>
