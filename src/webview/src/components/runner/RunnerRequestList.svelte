<script lang="ts">
  import {
    runnerState,
    toggleRequestEnabled,
    toggleAllRequests,
    reorderRequest,
  } from '../../stores/collectionRunner';

  const requests = $derived($runnerState.requests);
  const enabledCount = $derived(requests.filter(r => r.enabled).length);
  const allEnabled = $derived(enabledCount === requests.length);

  let dragIndex: number | null = $state(null);
  let dragOverIndex: number | null = $state(null);

  function handleDragStart(e: DragEvent, idx: number) {
    dragIndex = idx;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(idx));
    }
  }

  function handleDragOver(e: DragEvent, idx: number) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    dragOverIndex = idx;
  }

  function handleDrop(e: DragEvent, idx: number) {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== idx) {
      reorderRequest(dragIndex, idx);
    }
    dragIndex = null;
    dragOverIndex = null;
  }

  function handleDragEnd() {
    dragIndex = null;
    dragOverIndex = null;
  }

  function getMethodColor(method: string): string {
    const colors: Record<string, string> = {
      GET: '#61affe',
      POST: '#49cc90',
      PUT: '#fca130',
      PATCH: '#50e3c2',
      DELETE: '#f93e3e',
      HEAD: '#9012fe',
      OPTIONS: '#0d5aa7',
    };
    return colors[method] || '#61affe';
  }
</script>

<div class="request-list">
  <div class="list-header">
    <label class="select-all">
      <input
        type="checkbox"
        checked={allEnabled}
        onchange={() => toggleAllRequests(!allEnabled)}
      />
      {allEnabled ? 'Deselect All' : 'Select All'}
    </label>
    <span class="enabled-count">{enabledCount}/{requests.length} enabled</span>
  </div>
  <div class="list-items">
    {#each requests as req, idx (req.id)}
      <div
        class="request-item"
        class:disabled={!req.enabled}
        class:drag-over={dragOverIndex === idx}
        draggable="true"
        ondragstart={(e) => handleDragStart(e, idx)}
        ondragover={(e) => handleDragOver(e, idx)}
        ondrop={(e) => handleDrop(e, idx)}
        ondragend={handleDragEnd}
        role="listitem"
      >
        <span class="drag-handle" title="Drag to reorder">&#x2630;</span>
        <input
          type="checkbox"
          checked={req.enabled}
          onchange={() => toggleRequestEnabled(req.id)}
        />
        <span class="method-badge" style="color: {getMethodColor(req.method)}">{req.method}</span>
        <span class="request-name" title={req.url}>{req.name || req.url}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .request-list {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    overflow: hidden;
  }

  .list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: var(--vscode-editor-background);
    border-bottom: 1px solid var(--vscode-panel-border);
    font-size: 12px;
  }

  .select-all {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    color: var(--vscode-foreground);
  }

  .enabled-count {
    color: var(--vscode-descriptionForeground);
    font-size: 11px;
  }

  .list-items {
    max-height: 300px;
    overflow-y: auto;
  }

  .request-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--vscode-panel-border);
    font-size: 12px;
    cursor: default;
    transition: background 0.1s;
  }

  .request-item:last-child {
    border-bottom: none;
  }

  .request-item.disabled {
    opacity: 0.5;
  }

  .request-item.drag-over {
    background: var(--vscode-list-hoverBackground);
    border-top: 2px solid var(--vscode-focusBorder);
  }

  .drag-handle {
    cursor: grab;
    color: var(--vscode-descriptionForeground);
    font-size: 14px;
    user-select: none;
    flex-shrink: 0;
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  .method-badge {
    font-weight: 600;
    font-size: 10px;
    min-width: 45px;
    text-align: center;
    flex-shrink: 0;
  }

  .request-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
