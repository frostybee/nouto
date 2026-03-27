<script lang="ts">
  import { copyToClipboard } from '@nouto/ui/lib/clipboard';
  import { toCsv } from '../lib/copy-formats';
  import Tooltip from '@nouto/ui/components/shared/Tooltip.svelte';

  interface Props {
    data: any[];
  }
  let { data }: Props = $props();

  // Extract all unique column headers from array items
  const columns = $derived.by(() => {
    const keySet = new Set<string>();
    for (const item of data) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        for (const key of Object.keys(item)) keySet.add(key);
      }
    }
    return [...keySet];
  });

  // Sort state
  let sortColumn = $state<string | null>(null);
  let sortDirection = $state<'asc' | 'desc'>('asc');

  // Column widths (resizable)
  let columnWidths = $state<Map<string, number>>(new Map());

  function getColumnWidth(col: string): number {
    return columnWidths.get(col) ?? 150;
  }

  // Sorted rows
  const sortedRows = $derived.by(() => {
    const rows = data.filter(item => item && typeof item === 'object' && !Array.isArray(item));
    if (!sortColumn) return rows;

    const col = sortColumn;
    const dir = sortDirection === 'asc' ? 1 : -1;

    return [...rows].sort((a, b) => {
      const aVal = a[col];
      const bVal = b[col];
      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') return (aVal - bVal) * dir;
      return String(aVal).localeCompare(String(bVal)) * dir;
    });
  });

  // Pagination
  const PAGE_SIZE = 50;
  let visibleCount = $state(PAGE_SIZE);
  const visibleRows = $derived(sortedRows.slice(0, visibleCount));
  const hasMore = $derived(sortedRows.length > visibleCount);

  function handleSort(col: string) {
    if (sortColumn === col) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = col;
      sortDirection = 'asc';
    }
  }

  function formatCell(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  function getCellClass(value: any): string {
    if (value === null) return 'cell-null';
    if (typeof value === 'number') return 'cell-number';
    if (typeof value === 'boolean') return 'cell-boolean';
    if (typeof value === 'string') return 'cell-string';
    return '';
  }

  async function handleExportCsv() {
    const csv = toCsv(data);
    await copyToClipboard(csv);
  }

  // Column resize
  let resizing = $state<{ col: string; startX: number; startWidth: number } | null>(null);

  function startResize(e: MouseEvent, col: string) {
    e.preventDefault();
    e.stopPropagation();
    resizing = { col, startX: e.clientX, startWidth: getColumnWidth(col) };

    const onMove = (ev: MouseEvent) => {
      if (!resizing) return;
      const diff = ev.clientX - resizing.startX;
      const newWidth = Math.max(60, resizing.startWidth + diff);
      const next = new Map(columnWidths);
      next.set(resizing.col, newWidth);
      columnWidths = next;
    };

    const onUp = () => {
      resizing = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
</script>

<div class="table-view">
  <div class="table-toolbar">
    <span class="table-info">{sortedRows.length} rows, {columns.length} columns</span>
    <Tooltip text="Copy as CSV">
      <button class="table-btn" onclick={handleExportCsv} aria-label="Copy as CSV">
        <i class="codicon codicon-export"></i> CSV
      </button>
    </Tooltip>
  </div>
  <div class="table-scroll">
    <table>
      <thead>
        <tr>
          <th class="row-num-header">#</th>
          {#each columns as col}
            <th style="width: {getColumnWidth(col)}px; min-width: {getColumnWidth(col)}px;">
              <button class="header-btn" onclick={() => handleSort(col)}>
                <span class="header-text">{col}</span>
                {#if sortColumn === col}
                  <i class="codicon {sortDirection === 'asc' ? 'codicon-arrow-up' : 'codicon-arrow-down'} sort-icon"></i>
                {/if}
              </button>
              <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
              <div
                class="resize-handle"
                onmousedown={(e) => startResize(e, col)}
                role="separator"
              ></div>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each visibleRows as row, i}
          <tr>
            <td class="row-num">{i + 1}</td>
            {#each columns as col}
              <td class={getCellClass(row[col])} style="max-width: {getColumnWidth(col)}px;">
                <span class="cell-content">{formatCell(row[col])}</span>
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
    {#if hasMore}
      <div class="load-more">
        <button class="load-more-btn" onclick={() => { visibleCount += PAGE_SIZE; }}>
          Show more ({sortedRows.length - visibleCount} remaining)
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .table-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .table-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px;
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
  }

  .table-info {
    font-size: 11px;
    color: var(--hf-descriptionForeground);
  }

  .table-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
  }

  .table-btn:hover {
    background: var(--hf-button-secondaryHoverBackground);
  }

  .table-scroll {
    flex: 1;
    overflow: auto;
  }

  table {
    border-collapse: collapse;
    width: max-content;
    min-width: 100%;
    font-family: var(--hf-editor-font-family);
    font-size: 12px;
  }

  thead {
    position: sticky;
    top: 0;
    z-index: 1;
  }

  th {
    position: relative;
    background: var(--hf-editorGroupHeader-tabsBackground);
    color: var(--hf-editor-foreground);
    border-bottom: 1px solid var(--hf-panel-border);
    border-right: 1px solid var(--hf-panel-border);
    padding: 0;
    text-align: left;
    user-select: none;
  }

  .header-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 4px 8px;
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    text-align: left;
  }

  .header-btn:hover {
    background: var(--hf-list-hoverBackground);
  }

  .header-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sort-icon {
    font-size: 10px;
    flex-shrink: 0;
  }

  .resize-handle {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    cursor: col-resize;
  }

  .resize-handle:hover {
    background: var(--hf-focusBorder);
  }

  .row-num-header {
    width: 40px;
    min-width: 40px;
    text-align: center;
  }

  td {
    padding: 2px 8px;
    border-bottom: 1px solid var(--hf-panel-border);
    border-right: 1px solid var(--hf-panel-border);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row-num {
    text-align: center;
    color: var(--hf-editorLineNumber-foreground);
    font-size: 10px;
    width: 40px;
    min-width: 40px;
  }

  tr:hover td {
    background: var(--hf-list-hoverBackground);
  }

  .cell-content {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cell-null {
    color: var(--hf-debugTokenExpression-boolean);
    font-style: italic;
  }

  .cell-number {
    color: var(--hf-debugTokenExpression-number);
  }

  .cell-boolean {
    color: var(--hf-debugTokenExpression-boolean);
  }

  .cell-string {
    color: var(--hf-debugTokenExpression-string);
  }

  .load-more {
    padding: 8px;
    text-align: center;
  }

  .load-more-btn {
    padding: 4px 12px;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
  }

  .load-more-btn:hover {
    background: var(--hf-button-secondaryHoverBackground);
  }
</style>
