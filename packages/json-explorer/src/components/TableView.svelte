<script lang="ts">
  import Tooltip from '@nouto/ui/components/shared/Tooltip.svelte';

  interface Props {
    data: any[];
    searchQuery?: string;
    searchMatchPaths?: Set<string>;
    currentSearchPath?: string | null;
    filterMode?: 'highlight' | 'filter';
  }
  let { data, searchQuery = '', searchMatchPaths, currentSearchPath = null, filterMode = 'highlight' }: Props = $props();

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

  // Indexed rows: pair each row with its original index in `data`
  type IndexedRow = { row: any; origIdx: number };

  const sortedRows = $derived.by(() => {
    const indexed: IndexedRow[] = [];
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        indexed.push({ row: item, origIdx: i });
      }
    }
    if (!sortColumn) return indexed;

    const col = sortColumn;
    const dir = sortDirection === 'asc' ? 1 : -1;

    return [...indexed].sort((a, b) => {
      const aVal = a.row[col];
      const bVal = b.row[col];
      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') return (aVal - bVal) * dir;
      return String(aVal).localeCompare(String(bVal)) * dir;
    });
  });

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

  // --- Search support ---

  /** Parse "$[5].name" -> { row: 5, col: "name" } */
  function parseTablePath(path: string): { row: number; col: string } | null {
    const m = path.match(/^\$\[(\d+)\]\.(.+)$/);
    if (!m) return null;
    return { row: parseInt(m[1], 10), col: m[2] };
  }

  // Build set of "rowIdx:col" keys for matched cells
  const matchedCells = $derived.by(() => {
    if (!searchMatchPaths || searchMatchPaths.size === 0) return new Set<string>();
    const cells = new Set<string>();
    for (const path of searchMatchPaths) {
      const parsed = parseTablePath(path);
      if (parsed) cells.add(`${parsed.row}:${parsed.col}`);
    }
    return cells;
  });

  // Set of row indices that have at least one match (for filter mode)
  const matchedRowIndices = $derived.by(() => {
    if (!searchMatchPaths || searchMatchPaths.size === 0) return new Set<number>();
    const rows = new Set<number>();
    for (const path of searchMatchPaths) {
      const parsed = parseTablePath(path);
      if (parsed) rows.add(parsed.row);
    }
    return rows;
  });

  // Filter mode: only show rows with search matches
  const displayRows = $derived.by(() => {
    if (filterMode === 'filter' && searchQuery && matchedRowIndices.size > 0) {
      return sortedRows.filter(ir => matchedRowIndices.has(ir.origIdx));
    }
    return sortedRows;
  });

  // Pagination
  const PAGE_SIZE = 50;
  let visibleCount = $state(PAGE_SIZE);
  const visibleRows = $derived(displayRows.slice(0, visibleCount));
  const hasMore = $derived(displayRows.length > visibleCount);

  // Current search match cell key
  const currentCellKey = $derived.by(() => {
    if (!currentSearchPath) return null;
    const parsed = parseTablePath(currentSearchPath);
    if (!parsed) return null;
    return `${parsed.row}:${parsed.col}`;
  });

  // Highlight matching text in a cell string
  function highlightCellMatch(text: string): { before: string; match: string; after: string } | null {
    if (!searchQuery) return null;
    const lowerText = text.toLowerCase();
    const lowerQuery = searchQuery.toLowerCase();
    const idx = lowerText.indexOf(lowerQuery);
    if (idx === -1) return null;
    return {
      before: text.slice(0, idx),
      match: text.slice(idx, idx + searchQuery.length),
      after: text.slice(idx + searchQuery.length),
    };
  }

  // Scroll to current match row
  let scrollContainer = $state<HTMLDivElement>(undefined!);

  $effect(() => {
    if (!currentSearchPath || !scrollContainer) return;
    const parsed = parseTablePath(currentSearchPath);
    if (!parsed) return;

    const displayIdx = displayRows.findIndex(ir => ir.origIdx === parsed.row);
    if (displayIdx === -1) return;

    // Bump pagination if needed
    if (displayIdx >= visibleCount) {
      visibleCount = displayIdx + PAGE_SIZE;
    }

    // Scroll to the row after DOM updates
    requestAnimationFrame(() => {
      const row = scrollContainer?.querySelector(`tbody tr:nth-child(${displayIdx + 1})`);
      row?.scrollIntoView({ block: 'nearest' });
    });
  });

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
    <span class="table-info">{displayRows.length}{displayRows.length !== sortedRows.length ? ` / ${sortedRows.length}` : ''} rows, {columns.length} columns</span>
  </div>
  <div class="table-scroll" bind:this={scrollContainer}>
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
        {#each visibleRows as ir}
          <tr>
            <td class="row-num">{ir.origIdx + 1}</td>
            {#each columns as col}
              {@const cellKey = `${ir.origIdx}:${col}`}
              {@const isCellMatch = matchedCells.has(cellKey)}
              {@const isCurrentCell = currentCellKey === cellKey}
              {@const cellText = formatCell(ir.row[col])}
              {@const highlight = isCellMatch ? highlightCellMatch(cellText) : null}
              <td
                class="{getCellClass(ir.row[col])}{isCellMatch ? ' search-match' : ''}{isCurrentCell ? ' current-match' : ''}"
                style="max-width: {getColumnWidth(col)}px;"
              >
                <span class="cell-content">
                  {#if highlight}
                    {highlight.before}<mark class="search-highlight">{highlight.match}</mark>{highlight.after}
                  {:else}
                    {cellText}
                  {/if}
                </span>
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
    {#if hasMore}
      <div class="load-more">
        <button class="load-more-btn" onclick={() => { visibleCount += PAGE_SIZE; }}>
          Show more ({displayRows.length - visibleCount} remaining)
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
    background: var(--hf-sideBarSectionHeader-background);
    color: var(--hf-foreground);
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

  /* Search highlights */
  td.search-match {
    background: var(--hf-editor-findMatchHighlightBackground);
  }

  td.current-match {
    background: var(--hf-editor-findMatchBackground);
    outline: 1px solid var(--hf-editor-findMatchBorder);
    outline-offset: -1px;
  }

  .search-highlight {
    background: var(--hf-focusBorder);
    color: #fff;
    border-radius: 2px;
    padding: 0 1px;
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
