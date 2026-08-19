<script lang="ts">
  // Browse the vendored VS Code theme catalog and install entries as custom
  // themes. Only the generated index (names, modes, swatches) is in memory;
  // a theme's JSON is fetched and converted on Install.
  import { listCatalogThemes, loadCatalogTheme } from '../../../lib/theme/vscode-catalog';
  import type { VsCodeCatalogEntry } from '../../../lib/theme/vscode-catalog-index';
  import { addCustomTheme, customThemes, setTheme } from '../../../stores/theme.svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();

  type ModeFilter = 'all' | 'dark' | 'light';
  let query = $state('');
  let mode = $state<ModeFilter>('all');
  let busyId = $state<string | null>(null);
  let status = $state<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const catalog = listCatalogThemes();

  const visible = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter(
      (e) =>
        (mode === 'all' || e.type === mode) && (!q || e.displayName.toLowerCase().includes(q)),
    );
  });

  /** Installed = a custom theme whose id is this entry's id or a suffixed copy. */
  function installedId(entry: VsCodeCatalogEntry): string | null {
    const found = customThemes().find(
      (t) => t.id === entry.id || new RegExp(`^${entry.id}-\\d+$`).test(t.id),
    );
    return found?.id ?? null;
  }

  async function install(entry: VsCodeCatalogEntry, activate: boolean) {
    busyId = entry.id;
    status = null;
    try {
      const result = await loadCatalogTheme(entry.id);
      if (result.error !== undefined) {
        status = { kind: 'error', text: result.error };
        return;
      }
      const added = addCustomTheme(result.preset);
      if (activate) setTheme(added.id);
      const warn = result.warnings.length ? ` (${result.warnings.length} note${result.warnings.length > 1 ? 's' : ''})` : '';
      status = { kind: 'ok', text: `Installed ${added.name}${warn}.` };
    } finally {
      busyId = null;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') onclose();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div class="dialog-backdrop" role="presentation" onclick={handleBackdropClick}>
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="browse-title">
      <div class="dialog-header">
        <h3 id="browse-title">Browse VS Code Themes</h3>
        <button class="icon-btn" onclick={onclose} aria-label="Close" title="Close">
          <i class="codicon codicon-close"></i>
        </button>
      </div>

      <div class="toolbar">
        <input
          class="search"
          type="search"
          placeholder="Search {catalog.length} themes…"
          bind:value={query}
          aria-label="Search themes"
        />
        <div class="segmented" role="group" aria-label="Filter by mode">
          {#each [['all', 'All'], ['dark', 'Dark'], ['light', 'Light']] as [value, label]}
            <button
              class:active={mode === value}
              onclick={() => (mode = value as ModeFilter)}
              aria-pressed={mode === value}
            >
              {label}
            </button>
          {/each}
        </div>
      </div>

      <div class="catalog-list">
        {#each visible as entry (entry.id)}
          {@const installed = installedId(entry)}
          <div class="catalog-row">
            <div class="catalog-swatches" aria-hidden="true">
              <span class="swatch" style:background={entry.swatch.bg}></span>
              <span class="swatch" style:background={entry.swatch.fg}></span>
              <span class="swatch" style:background={entry.swatch.accent}></span>
            </div>
            <div class="catalog-meta">
              <span class="catalog-name">{entry.displayName}</span>
              <span class="catalog-mode">{entry.type}</span>
            </div>
            {#if installed}
              <button class="row-btn" onclick={() => setTheme(installed)}>Use</button>
              <span class="installed">Installed</span>
            {:else}
              <button
                class="row-btn"
                disabled={busyId !== null}
                onclick={() => install(entry, false)}
                title="Install without switching to it"
              >
                Install
              </button>
              <button
                class="row-btn primary"
                disabled={busyId !== null}
                onclick={() => install(entry, true)}
              >
                {busyId === entry.id ? 'Installing…' : 'Install & Use'}
              </button>
            {/if}
          </div>
        {:else}
          <p class="empty">No themes match.</p>
        {/each}
      </div>

      <div class="dialog-footer">
        <span class="status" class:error={status?.kind === 'error'}>{status?.text ?? ''}</span>
        <button class="row-btn" onclick={onclose}>Done</button>
      </div>
    </div>
  </div>
{/if}

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
    display: flex;
    flex-direction: column;
    width: min(44rem, 92vw);
    max-height: 84vh;
    background: var(--hf-editorWidget-background, var(--hf-menu-background));
    border: 1px solid var(--hf-editorWidget-border, var(--hf-panel-border));
    border-radius: 0.462rem;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    overflow: hidden;
  }

  .dialog-header,
  .dialog-footer,
  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.615rem;
    padding: 0.769rem 1.077rem;
  }

  .dialog-header {
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .dialog-header h3 {
    flex: 1;
    margin: 0;
    font-size: 1.077rem;
    font-weight: 600;
    color: var(--hf-foreground);
  }

  .dialog-footer {
    border-top: 1px solid var(--hf-panel-border);
    justify-content: space-between;
  }

  .toolbar {
    padding-bottom: 0.462rem;
  }

  .search {
    flex: 1;
    padding: 0.385rem 0.538rem;
    font-size: 0.923rem;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border);
    border-radius: 0.308rem;
  }

  .search:focus {
    outline: 1px solid var(--hf-focusBorder);
    outline-offset: -1px;
  }

  .segmented {
    display: inline-flex;
    border: 1px solid var(--hf-panel-border);
    border-radius: 0.308rem;
    overflow: hidden;
  }

  .segmented button {
    padding: 0.308rem 0.692rem;
    font-size: 0.846rem;
    background: transparent;
    border: none;
    color: var(--hf-descriptionForeground);
    cursor: pointer;
  }

  .segmented button + button {
    border-left: 1px solid var(--hf-panel-border);
  }

  .segmented button.active {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
  }

  .catalog-list {
    flex: 1;
    overflow-y: auto;
    padding: 0 0.615rem 0.615rem;
  }

  .catalog-row {
    display: flex;
    align-items: center;
    gap: 0.769rem;
    padding: 0.462rem 0.462rem;
    border-radius: 0.308rem;
  }

  .catalog-row:hover {
    background: var(--hf-list-hoverBackground);
  }

  .catalog-swatches {
    display: flex;
    gap: 0.231rem;
    flex: none;
  }

  .swatch {
    width: 1.231rem;
    height: 1.231rem;
    border-radius: 0.231rem;
    border: 1px solid rgba(128, 128, 128, 0.35);
  }

  .catalog-meta {
    flex: 1;
    display: flex;
    align-items: baseline;
    gap: 0.538rem;
    min-width: 0;
  }

  .catalog-name {
    font-size: 0.923rem;
    color: var(--hf-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .catalog-mode {
    font-size: 0.769rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--hf-descriptionForeground);
  }

  .installed {
    font-size: 0.846rem;
    color: var(--hf-descriptionForeground);
    min-width: 4rem;
    text-align: right;
  }

  .row-btn {
    padding: 0.308rem 0.692rem;
    font-size: 0.846rem;
    background: transparent;
    border: 1px solid var(--hf-panel-border);
    border-radius: 0.308rem;
    color: var(--hf-foreground);
    cursor: pointer;
    white-space: nowrap;
  }

  .row-btn:hover:not(:disabled) {
    background: var(--hf-toolbar-hoverBackground);
  }

  .row-btn.primary {
    background: var(--hf-button-background);
    border-color: transparent;
    color: var(--hf-button-foreground);
  }

  .row-btn.primary:hover:not(:disabled) {
    background: var(--hf-button-hoverBackground);
  }

  .row-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.846rem;
    height: 1.846rem;
    background: transparent;
    border: none;
    border-radius: 0.308rem;
    color: var(--hf-foreground);
    cursor: pointer;
  }

  .icon-btn:hover {
    background: var(--hf-toolbar-hoverBackground);
  }

  .empty {
    margin: 1.5rem 0;
    text-align: center;
    font-size: 0.923rem;
    color: var(--hf-descriptionForeground);
  }

  .status {
    font-size: 0.846rem;
    color: var(--hf-descriptionForeground);
  }

  .status.error {
    color: var(--hf-errorForeground);
  }
</style>
