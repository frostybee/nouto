<script lang="ts">
  import { workspace } from '@nouto/ui/stores/workspace.svelte';
  import { postMessage } from '@nouto/ui/lib/vscode';
  import ConfirmDialog from '@nouto/ui/components/shared/ConfirmDialog.svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();

  const ws = $derived(workspace());

  let name = $state('');
  let description = $state('');
  let confirmDelete = $state(false);

  $effect(() => {
    if (open) {
      name = ws.meta?.name ?? '';
      description = ws.meta?.description ?? '';
    }
  });

  function save() {
    postMessage({
      type: 'updateWorkspaceMeta',
      data: {
        name: name.trim() || undefined,
        description: description.trim() || undefined,
      },
    });
    onclose();
  }

  function requestDelete() { confirmDelete = true; }

  function doDelete() {
    confirmDelete = false;
    postMessage({ type: 'deleteWorkspaceMeta' });
    onclose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape' && !confirmDelete) onclose();
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div class="dialog-backdrop" role="presentation" onclick={handleBackdrop}>
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="ws-settings-title">
      <div class="dialog-header">
        <h3 id="ws-settings-title">Workspace Settings</h3>
        <button class="close-btn" onclick={onclose} aria-label="Close">
          <i class="codicon codicon-close"></i>
        </button>
      </div>

      <div class="dialog-body">
        <div class="tabs">
          <div class="tab active">Workspace</div>
        </div>

        <div class="form">
          <label>
            <span class="label">Name</span>
            <input
              type="text"
              bind:value={name}
              placeholder="My Workspace"
              spellcheck="false"
            />
            <span class="hint">Display name for this workspace. Defaults to folder name.</span>
          </label>

          <label>
            <span class="label">Description</span>
            <textarea
              bind:value={description}
              placeholder="What is this workspace for?"
              rows="4"
            ></textarea>
          </label>

          {#if ws.currentPath}
            <div class="path-row">
              <span class="label">Folder</span>
              <code class="path">{ws.currentPath}</code>
            </div>
          {/if}
        </div>
      </div>

      <div class="dialog-actions">
        <button class="btn btn-danger" onclick={requestDelete} disabled={!ws.currentPath}>
          Delete Workspace
        </button>
        <div class="spacer"></div>
        <button class="btn btn-secondary" onclick={onclose}>Cancel</button>
        <button class="btn btn-primary" onclick={save}>Save</button>
      </div>
    </div>
  </div>
{/if}

<ConfirmDialog
  open={confirmDelete}
  title="Delete workspace?"
  message="This removes the workspace from Nouto and deletes .nouto/workspace.json. Your collections, environments, and the folder itself are NOT deleted."
  confirmLabel="Delete"
  variant="danger"
  onconfirm={doDelete}
  oncancel={() => (confirmDelete = false)}
/>

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
  }

  .dialog {
    width: 540px;
    max-width: 90vw;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    background: var(--hf-editorWidget-background, var(--hf-menu-background));
    border: 1px solid var(--hf-editorWidget-border, var(--hf-panel-border));
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }

  .dialog-header {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--hf-panel-border);
  }
  .dialog-header h3 {
    margin: 0;
    flex: 1;
    font-size: 14px;
    font-weight: 600;
  }

  .close-btn {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--hf-foreground);
    border-radius: 4px;
    cursor: pointer;
  }
  .close-btn:hover { background: var(--hf-toolbar-hoverBackground, rgba(127, 127, 127, 0.18)); }

  .dialog-body {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px 16px;
  }

  .tabs {
    display: flex;
    gap: 2px;
    border-bottom: 1px solid var(--hf-panel-border);
    margin-bottom: 16px;
  }
  .tab {
    padding: 6px 12px;
    font-size: 12px;
    color: var(--hf-descriptionForeground);
    border-bottom: 2px solid transparent;
  }
  .tab.active {
    color: var(--hf-foreground);
    border-bottom-color: var(--hf-focusBorder, #007acc);
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .form label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .label {
    font-size: 11px;
    font-weight: 500;
    color: var(--hf-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .form input,
  .form textarea {
    width: 100%;
    padding: 6px 8px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground, var(--hf-foreground));
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    font-size: 12px;
    font-family: inherit;
    box-sizing: border-box;
  }
  .form textarea { resize: vertical; min-height: 70px; }
  .form input:focus,
  .form textarea:focus {
    outline: none;
    border-color: var(--hf-focusBorder);
  }

  .hint {
    font-size: 11px;
    color: var(--hf-descriptionForeground);
  }

  .path-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .path {
    font-family: var(--hf-editor-font-family, monospace);
    font-size: 11px;
    padding: 6px 8px;
    background: var(--hf-input-background);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    color: var(--hf-descriptionForeground);
    word-break: break-all;
  }

  .dialog-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--hf-panel-border);
  }
  .spacer { flex: 1; }

  .btn {
    padding: 5px 12px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    border: 1px solid transparent;
  }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-primary {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
  }
  .btn-primary:hover:not(:disabled) { background: var(--hf-button-hoverBackground); }

  .btn-secondary {
    background: var(--hf-button-secondaryBackground, transparent);
    color: var(--hf-button-secondaryForeground, var(--hf-foreground));
    border-color: var(--hf-panel-border);
  }
  .btn-secondary:hover:not(:disabled) { background: var(--hf-toolbar-hoverBackground, rgba(127, 127, 127, 0.18)); }

  .btn-danger {
    background: transparent;
    color: var(--hf-errorForeground, #f48771);
    border-color: var(--hf-errorForeground, #f48771);
  }
  .btn-danger:hover:not(:disabled) {
    background: var(--hf-errorForeground, #f48771);
    color: white;
  }
</style>
