<script lang="ts">
  import { trashItemsSorted, trashCount, restoreFromTrash, permanentlyDeleteFromTrash, emptyTrash } from '../../stores/trash.svelte';
  import { collections } from '../../stores/collections.svelte';
  import { showNotification } from '../../stores/notifications.svelte';
  import Tooltip from '../shared/Tooltip.svelte';
  import ConfirmDialog from '../shared/ConfirmDialog.svelte';
  import type { TrashItem } from '../../types';

  let showEmptyConfirm = $state(false);
  let showDeleteConfirm = $state(false);
  let pendingDeleteId = $state<string | null>(null);

  function handleRestore(item: TrashItem) {
    const success = restoreFromTrash(item.id);
    if (success) {
      showNotification('info', `Restored "${getItemName(item)}"`);
    } else {
      showNotification('error', 'Failed to restore item');
    }
  }

  function handlePermanentDelete(id: string) {
    pendingDeleteId = id;
    showDeleteConfirm = true;
  }

  function confirmPermanentDelete() {
    if (pendingDeleteId) {
      permanentlyDeleteFromTrash(pendingDeleteId);
      pendingDeleteId = null;
    }
    showDeleteConfirm = false;
  }

  function handleEmptyTrash() {
    showEmptyConfirm = true;
  }

  function confirmEmptyTrash() {
    emptyTrash();
    showEmptyConfirm = false;
    showNotification('info', 'Trash emptied');
  }

  function getItemName(item: TrashItem): string {
    return item.item.name || 'Unknown';
  }

  function getItemIcon(item: TrashItem): string {
    if (item.kind === 'collection') return 'codicon-folder-library';
    if (item.kind === 'folder') return 'codicon-folder';
    return 'codicon-symbol-method';
  }

  function getMethodBadge(item: TrashItem): string | null {
    if (item.kind === 'request' && 'method' in item.item) {
      return (item.item as any).method || null;
    }
    return null;
  }

  function formatRelativeDate(isoDate: string): string {
    const now = Date.now();
    const then = new Date(isoDate).getTime();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 30) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 30)}mo ago`;
  }

  function getOriginLabel(item: TrashItem): string {
    const loc = item.originalLocation;
    if (item.kind === 'collection') return '';
    if (loc.parentFolderName) {
      return `${loc.collectionName} / ${loc.parentFolderName}`;
    }
    return loc.collectionName;
  }
</script>

<div class="trash-tab">
  <div class="trash-toolbar">
    <span class="trash-title">
      <span class="codicon codicon-trash"></span>
      Trash
      {#if trashCount() > 0}
        <span class="trash-count">{trashCount()}</span>
      {/if}
    </span>
    {#if trashCount() > 0}
      <Tooltip text="Empty Trash" position="bottom">
        <button class="toolbar-btn" onclick={handleEmptyTrash} aria-label="Empty Trash">
          <span class="codicon codicon-clear-all"></span>
        </button>
      </Tooltip>
    {/if}
  </div>

  <div class="trash-list">
    {#if trashCount() === 0}
      <div class="empty-state">
        <div class="empty-icon codicon codicon-trash"></div>
        <p class="empty-title">Trash is empty</p>
        <p class="empty-description">Deleted items will appear here</p>
      </div>
    {:else}
      {#each trashItemsSorted() as item (item.id)}
        <div class="trash-item">
          <div class="item-info">
            <div class="item-header">
              {#if getMethodBadge(item)}
                <span class="method-badge method-{getMethodBadge(item)?.toLowerCase()}">{getMethodBadge(item)}</span>
              {:else}
                <span class="item-icon codicon {getItemIcon(item)}"></span>
              {/if}
              <span class="item-name">{getItemName(item)}</span>
            </div>
            <div class="item-meta">
              {#if getOriginLabel(item)}
                <span class="item-origin">{getOriginLabel(item)}</span>
                <span class="meta-sep">-</span>
              {/if}
              <span class="item-date">{formatRelativeDate(item.deletedAt)}</span>
            </div>
          </div>
          <div class="item-actions">
            <Tooltip text="Restore" position="top">
              <button class="action-btn restore" onclick={() => handleRestore(item)} aria-label="Restore">
                <span class="codicon codicon-discard"></span>
              </button>
            </Tooltip>
            <Tooltip text="Delete permanently" position="top">
              <button class="action-btn delete" onclick={() => handlePermanentDelete(item.id)} aria-label="Delete permanently">
                <span class="codicon codicon-close"></span>
              </button>
            </Tooltip>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<ConfirmDialog
  open={showEmptyConfirm}
  title="Empty Trash"
  message="Permanently delete all items in trash? This cannot be undone."
  confirmLabel="Empty Trash"
  variant="danger"
  onconfirm={confirmEmptyTrash}
  oncancel={() => showEmptyConfirm = false}
/>

<ConfirmDialog
  open={showDeleteConfirm}
  title="Delete Permanently"
  message="Permanently delete this item? This cannot be undone."
  confirmLabel="Delete"
  variant="danger"
  onconfirm={confirmPermanentDelete}
  oncancel={() => { showDeleteConfirm = false; pendingDeleteId = null; }}
/>

<style>
  .trash-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .trash-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
  }

  .trash-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--hf-foreground);
    opacity: 0.8;
  }

  .trash-count {
    background: var(--hf-badge-background, #4d4d4d);
    color: var(--hf-badge-foreground, #fff);
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 8px;
    font-weight: 600;
  }

  .toolbar-btn {
    background: none;
    border: none;
    color: var(--hf-foreground);
    opacity: 0.6;
    cursor: pointer;
    padding: 2px;
    border-radius: 3px;
  }

  .toolbar-btn:hover {
    opacity: 1;
    background: var(--hf-toolbar-hoverBackground);
  }

  .trash-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  .trash-item {
    display: flex;
    align-items: center;
    padding: 6px 12px;
    gap: 8px;
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .trash-item:hover {
    background: var(--hf-list-hoverBackground);
  }

  .item-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .item-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .item-icon {
    font-size: 14px;
    opacity: 0.7;
    flex-shrink: 0;
  }

  .item-name {
    font-size: 13px;
    color: var(--hf-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-meta {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--hf-foreground);
    opacity: 0.5;
    padding-left: 20px;
  }

  .meta-sep {
    opacity: 0.5;
  }

  .method-badge {
    font-size: 9px;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 3px;
    flex-shrink: 0;
    text-transform: uppercase;
  }

  .method-badge.method-get { color: #61affe; }
  .method-badge.method-post { color: #49cc90; }
  .method-badge.method-put { color: #fca130; }
  .method-badge.method-patch { color: #50e3c2; }
  .method-badge.method-delete { color: #f93e3e; }
  .method-badge.method-head { color: #9012fe; }
  .method-badge.method-options { color: #888; }

  .item-actions {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
    opacity: 0;
  }

  .trash-item:hover .item-actions {
    opacity: 1;
  }

  .action-btn {
    background: none;
    border: none;
    color: var(--hf-foreground);
    opacity: 0.6;
    cursor: pointer;
    padding: 3px;
    border-radius: 3px;
    font-size: 12px;
  }

  .action-btn:hover {
    opacity: 1;
    background: var(--hf-toolbar-hoverBackground);
  }

  .action-btn.delete:hover {
    color: var(--hf-errorForeground, #f14c4c);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    text-align: center;
  }

  .empty-icon {
    font-size: 32px;
    opacity: 0.3;
    margin-bottom: 12px;
  }

  .empty-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--hf-foreground);
    opacity: 0.7;
    margin: 0 0 4px;
  }

  .empty-description {
    font-size: 12px;
    color: var(--hf-foreground);
    opacity: 0.5;
    margin: 0;
  }
</style>
