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

  // Table element ref for measuring content
  let tableEl = $state<HTMLTableElement>(undefined!);

  // Column resize
  let resizing = $state<{ col: string; startX: number; startWidth: number } | null>(null);

  function startResize(e: MouseEvent, col: string) {
    e.preventDefault();
    e.stopPropagation();
    resizing = { col, startX: e.clientX, startWidth: getColumnWidth(col) };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

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
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function autoFitColumn(col: string) {
    if (!tableEl) return;
    const colIndex = columns.indexOf(col);
    if (colIndex === -1) return;
    // +2 because first column is the row number (#)
    const cellIndex = colIndex + 1;

    // Measure using an off-screen element to get natural text width
    const measurer = document.createElement('span');
    measurer.style.visibility = 'hidden';
    measurer.style.position = 'absolute';
    measurer.style.whiteSpace = 'nowrap';
    measurer.style.font = getComputedStyle(tableEl).font;
    measurer.style.fontSize = '12px';
    document.body.appendChild(measurer);

    // Measure header text
    measurer.style.fontWeight = '600';
    measurer.style.fontSize = '11px';
    measurer.textContent = col;
    let maxWidth = measurer.offsetWidth + 40; // padding + sort icon space

    // Measure visible cell contents
    measurer.style.fontWeight = '';
    measurer.style.fontSize = '12px';
    const rows = tableEl.querySelectorAll('tbody tr');
    for (const row of rows) {
      const cell = row.children[cellIndex] as HTMLTableCellElement | undefined;
      if (!cell) continue;
      measurer.textContent = cell.textContent || '';
      maxWidth = Math.max(maxWidth, measurer.offsetWidth + 20); // + cell padding
    }

    document.body.removeChild(measurer);

    const fitWidth = Math.max(60, Math.min(maxWidth, 600));
    const next = new Map(columnWidths);
    next.set(col, fitWidth);
    columnWidths = next;
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
    <table bind:this={tableEl}>
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
                class:resizing={resizing?.col === col}
                onmousedown={(e) => startResize(e, col)}
                ondblclick={(e) => { e.preventDefault(); e.stopPropagation(); autoFitColumn(col); }}
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
    right: -8px;
    top: 0;
    bottom: 0;
    width: 17px;
    cursor: col-resize;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Grip dots: 2x3 grid of circles */
  .resize-handle::before {
    content: '';
    width: 9px;
    height: 18px;
    opacity: 0.8;
    background-image: radial-gradient(circle at center, var(--hf-focusBorder) 2px, transparent 2px);
    background-size: 5px 6px;
    background-position: center;
    background-repeat: repeat;
    transition: opacity 0.15s;
  }

  /* Full-height bar on hover */
  .resize-handle::after {
    content: '';
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    top: 0;
    bottom: 0;
    width: 5px;
    border-radius: 2px;
    background: var(--hf-focusBorder);
    opacity: 0;
    transition: opacity 0.15s;
  }

  .resize-handle:hover::before {
    opacity: 0;
  }

  .resize-handle:hover::after {
    opacity: 1;
  }

  .resize-handle.resizing::before {
    opacity: 0;
  }

  .resize-handle.resizing::after {
    opacity: 1;
  }

  .row-num-header {
    width: 40px;
    min-width: 40px;
    text-align: center;
    position: sticky;
    left: 0;
    z-index: 2;
  }

  /* First data column is sticky after the row number column */
  th:nth-child(2) {
    position: sticky;
    left: 40px;
    z-index: 2;
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
    position: sticky;
    left: 0;
    z-index: 1;
    background: var(--hf-editor-background);
  }

  /* First data cell is sticky */
  td:nth-child(2) {
    position: sticky;
    left: 40px;
    z-index: 1;
    background: var(--hf-editor-background);
  }

  tr:hover .row-num,
  tr:hover td:nth-child(2) {
    background: var(--hf-list-hoverBackground);
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
