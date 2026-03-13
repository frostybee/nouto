<script lang="ts">
  import type { ResponseExample } from '../../types';
  import { getStatusClass } from '../../lib/http-helpers';
  import Tooltip from './Tooltip.svelte';

  interface Props {
    examples: ResponseExample[];
    onpreview: (example: ResponseExample) => void;
    ondelete: (id: string) => void;
  }
  let { examples, onpreview, ondelete }: Props = $props();

  let confirmingDelete = $state<string | null>(null);

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  function requestDelete(id: string, event: MouseEvent) {
    event.stopPropagation();
    confirmingDelete = id;
  }

  function confirmDelete(id: string, event: MouseEvent) {
    event.stopPropagation();
    confirmingDelete = null;
    ondelete(id);
  }

  function cancelDelete(event: MouseEvent) {
    event.stopPropagation();
    confirmingDelete = null;
  }
</script>

<div class="examples-tab">
  {#if examples.length === 0}
    <div class="empty-state">
      <i class="codicon codicon-beaker"></i>
      <p>No saved examples yet.</p>
      <p class="hint">Send a request and click <strong>Save as Example</strong> in the response panel to capture a response.</p>
    </div>
  {:else}
    <ul class="examples-list">
      {#each examples as example (example.id)}
        <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
        <li
          class="example-row"
          onclick={() => onpreview(example)}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && onpreview(example)}
        >
          <span class="status-badge {getStatusClass(example.status)}">{example.status}</span>
          <span class="example-name">{example.name}</span>
          <span class="example-date">{formatDate(example.createdAt)}</span>
          <div class="example-actions">
            {#if confirmingDelete === example.id}
              <span class="confirm-label">Delete?</span>
              <button class="action-btn danger" onclick={(e) => confirmDelete(example.id, e)} aria-label="Confirm delete">Yes</button>
              <button class="action-btn" onclick={cancelDelete} aria-label="Cancel delete">No</button>
            {:else}
              <Tooltip text="Delete example" position="top">
                <button
                  class="action-btn"
                  onclick={(e) => requestDelete(example.id, e)}
                  aria-label="Delete example"
                >
                  <i class="codicon codicon-trash"></i>
                </button>
              </Tooltip>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .examples-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 8px 0;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 100%;
    padding: 24px;
    text-align: center;
    color: var(--hf-descriptionForeground);
  }

  .empty-state .codicon {
    font-size: 28px;
    opacity: 0.4;
  }

  .empty-state p {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
  }

  .empty-state .hint {
    font-size: 12px;
    opacity: 0.8;
    max-width: 280px;
  }

  .examples-list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
  }

  .example-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    cursor: pointer;
    border-bottom: 1px solid var(--hf-panel-border);
    transition: background 0.1s;
  }

  .example-row:hover {
    background: var(--hf-list-hoverBackground);
  }

  .status-badge {
    font-size: 11px;
    font-weight: 600;
    font-family: var(--hf-editor-font-family, monospace);
    min-width: 36px;
    text-align: center;
    padding: 1px 5px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .status-badge.success {
    color: #4caf50;
    background: rgba(76, 175, 80, 0.12);
  }

  .status-badge.redirect {
    color: #ff9800;
    background: rgba(255, 152, 0, 0.12);
  }

  .status-badge.client-error {
    color: #f44336;
    background: rgba(244, 67, 54, 0.12);
  }

  .status-badge.server-error {
    color: #e91e63;
    background: rgba(233, 30, 99, 0.12);
  }

  .example-name {
    flex: 1;
    font-size: 13px;
    color: var(--hf-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .example-date {
    font-size: 11px;
    color: var(--hf-descriptionForeground);
    flex-shrink: 0;
    white-space: nowrap;
  }

  .example-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3px 6px;
    background: transparent;
    border: none;
    border-radius: 3px;
    color: var(--hf-foreground);
    cursor: pointer;
    font-size: 12px;
    opacity: 0.5;
    transition: opacity 0.1s, background 0.1s;
  }

  .action-btn:hover {
    opacity: 1;
    background: var(--hf-toolbar-hoverBackground, rgba(127, 127, 127, 0.1));
  }

  .action-btn.danger {
    color: var(--vscode-errorForeground, #f48771);
    opacity: 1;
  }

  .confirm-label {
    font-size: 12px;
    color: var(--hf-descriptionForeground);
    white-space: nowrap;
  }
</style>
