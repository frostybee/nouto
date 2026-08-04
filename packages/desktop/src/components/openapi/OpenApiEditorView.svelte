<script lang="ts">
  import { openApiSession, setContent, reanalyzeCurrent } from '../../lib/openapi/session.svelte';
  import { openFile, newDocument, saveDocument, saveDocumentAs } from '../../lib/openapi/documentAdapter';
  import { tryOperation } from '../../lib/openapi/tryIt';
  import { planOutlineEditAction } from '../../lib/openapi/outlineEdit';
  import type { OutlineActionId } from '../../lib/openapi/outlineMenu';
  import { generateCollectionFromOpenApi } from '../../lib/import-export.svelte';
  import type { OutlineNode } from '@nouto/core/services/openapi/outline';
  import { buildPointerMap, offsetToPointer, pointerToOffsetRange } from '@nouto/core/services/openapi/pointerMap';
  import type { SpecTextEdit } from '@nouto/core/services/openapi/specEdit';
  import { debounce } from '@nouto/ui/lib/debounce';
  import { settings } from '@nouto/ui/stores/settings.svelte';
  import { showNotification } from '@nouto/ui/stores/notifications.svelte';
  import PanelSplitter from '@nouto/ui/components/shared/PanelSplitter.svelte';
  import OpenApiEditorSurface from './OpenApiEditorSurface.svelte';
  import OpenApiOutlineTree from './OpenApiOutlineTree.svelte';
  import OpenApiPreviewPane from './OpenApiPreviewPane.svelte';

  const fileName = $derived(
    openApiSession.documentUri ? openApiSession.documentUri.split(/[/\\]/).pop() : 'Untitled'
  );

  // $derived doubles as the cache: rebuilt only when content/format change,
  // shared by the marker converter (via prop) and the outline sync below.
  const pointerMap = $derived(
    openApiSession.format ? buildPointerMap(openApiSession.content, openApiSession.format) : undefined
  );

  let surfaceRef = $state<{
    revealOffset(offset: number): void;
    applyEdits(edits: SpecTextEdit[], reveal?: { pointer: string; selectValue: boolean }): void;
  }>();
  let activePointer = $state<string>();

  // 150ms mirrors the VS Code outline's SELECTION_SYNC_DEBOUNCE_MS.
  const CURSOR_SYNC_DEBOUNCE_MS = 150;
  const syncCursor = debounce((offset: number) => {
    activePointer = pointerMap ? offsetToPointer(pointerMap, offset) : undefined;
  }, CURSOR_SYNC_DEBOUNCE_MS);

  function handleOutlineReveal(pointer: string): void {
    if (!pointerMap) return;
    const range = pointerToOffsetRange(pointerMap, pointer);
    if (range) surfaceRef?.revealOffset(range.from);
  }

  // Session diagnostics (not analysis.diagnostics alone) so async Rust schema
  // errors also block outline editing, mirroring vscode's hasErrors guard.
  const outlineHasErrors = $derived(
    !openApiSession.analysis?.parsedSpec ||
      openApiSession.diagnostics.some((diagnostic) => diagnostic.severity === 'error')
  );

  function handleOutlineAction(
    node: OutlineNode,
    id: OutlineActionId,
    payload?: Record<string, unknown>
  ): void {
    if (!openApiSession.format || !openApiSession.analysis) return;
    const result = planOutlineEditAction(
      node,
      id,
      payload,
      openApiSession.content,
      openApiSession.format,
      openApiSession.analysis
    );
    if (!result) return;
    if ('error' in result) {
      showNotification('error', result.error);
      return;
    }
    surfaceRef?.applyEdits(result.edits, result.reveal);
  }

  // Lint settings changes alter the diagnostic set without a content change —
  // re-derive so toggles apply live (VS Code re-validates on settings change).
  $effect(() => {
    void settings.openApiLintEnabled;
    void settings.openApiLintRules;
    reanalyzeCurrent();
  });
</script>

{#if !openApiSession.format}
  <div class="openapi-empty-state">
    <span class="codicon codicon-symbol-interface empty-icon"></span>
    <h2>OpenAPI Editor</h2>
    <p>Create a new specification or open an existing .yaml / .json document.</p>
    <div class="empty-actions">
      <button class="btn-primary" onclick={newDocument}>
        <span class="codicon codicon-new-file"></span>
        New Spec
      </button>
      <button class="btn-secondary" onclick={openFile}>
        <span class="codicon codicon-folder-opened"></span>
        Open File…
      </button>
    </div>
  </div>
{:else}
  <div class="openapi-editor-view">
    <div class="openapi-toolbar">
      <span class="codicon codicon-symbol-interface toolbar-icon"></span>
      <span class="openapi-filename" title={openApiSession.documentUri ?? 'Unsaved document'}>{fileName}</span>
      {#if openApiSession.dirty}
        <span class="openapi-dirty-dot" role="status" aria-label="Unsaved changes"></span>
      {/if}
      <div class="toolbar-spacer"></div>
      <button
        class="toolbar-btn"
        onclick={() => generateCollectionFromOpenApi(openApiSession.content, openApiSession.format!)}
        title="Generate Collection"
      >
        <span class="codicon codicon-repo"></span>
      </button>
      <button
        class="toolbar-btn"
        class:active={openApiSession.previewVisible}
        aria-pressed={openApiSession.previewVisible}
        onclick={() => (openApiSession.previewVisible = !openApiSession.previewVisible)}
        title="Toggle Preview"
      >
        <span class="codicon codicon-open-preview"></span>
      </button>
      <button class="toolbar-btn" onclick={newDocument} title="New Spec">
        <span class="codicon codicon-new-file"></span>
      </button>
      <button class="toolbar-btn" onclick={openFile} title="Open File">
        <span class="codicon codicon-folder-opened"></span>
      </button>
      <button class="toolbar-btn" onclick={saveDocument} title="Save (Ctrl+S)">
        <span class="codicon codicon-save"></span>
      </button>
      <button class="toolbar-btn" onclick={saveDocumentAs} title="Save As…">
        <span class="codicon codicon-save-as"></span>
      </button>
    </div>
    <div class="openapi-editor-body">
      <div class="outline-pane-host" style="flex: {1 - openApiSession.splitRatio}">
        <OpenApiOutlineTree
          analysis={openApiSession.analysis}
          documentUri={openApiSession.documentUri ?? 'untitled'}
          sortAlphabetically={settings.openApiOutlineSortAlphabetically}
          {activePointer}
          onreveal={handleOutlineReveal}
          ontryit={(operation) => tryOperation(operation.path, operation.method)}
          hasErrors={outlineHasErrors}
          oncontextaction={handleOutlineAction}
        />
      </div>
      <PanelSplitter
        orientation="horizontal"
        target="controlled"
        minRatio={0.15}
        maxRatio={0.6}
        defaultRatio={0.3}
        onRatioChange={(ratio) => (openApiSession.splitRatio = 1 - ratio)}
      />
      <div class="editor-preview-host" style="flex: {openApiSession.splitRatio}">
        <div
          class="editor-pane-host"
          style="flex: {openApiSession.previewVisible ? 1 - openApiSession.previewSplitRatio : 1}"
        >
          <OpenApiEditorSurface
            bind:this={surfaceRef}
            content={openApiSession.content}
            format={openApiSession.format}
            schemaVersion={openApiSession.version}
            diagnostics={openApiSession.diagnostics}
            {pointerMap}
            onchange={setContent}
            onsave={() => void saveDocument()}
            oncursorchange={(info) => syncCursor(info.offset)}
          />
        </div>
        {#if openApiSession.previewVisible}
          <PanelSplitter
            orientation="horizontal"
            target="controlled"
            minRatio={0.3}
            maxRatio={0.8}
            defaultRatio={0.65}
            onRatioChange={(ratio) => (openApiSession.previewSplitRatio = 1 - ratio)}
          />
          <div class="preview-pane-host" style="flex: {openApiSession.previewSplitRatio}">
            <OpenApiPreviewPane />
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .openapi-empty-state {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.615rem;
    color: var(--hf-foreground);
    background: var(--hf-editor-background);
  }

  .empty-icon {
    font-size: 3.077rem;
    color: var(--hf-descriptionForeground);
  }

  .openapi-empty-state h2 {
    margin: 0;
    font-size: 1.385rem;
    font-weight: 600;
  }

  .openapi-empty-state p {
    margin: 0;
    font-size: 1rem;
    color: var(--hf-descriptionForeground);
  }

  .empty-actions {
    display: flex;
    gap: 0.615rem;
    margin-top: 0.923rem;
  }

  .empty-actions button {
    display: flex;
    align-items: center;
    gap: 0.462rem;
    padding: 0.462rem 1.077rem;
    font-size: 1rem;
    border-radius: 0.308rem;
    border: none;
    cursor: pointer;
  }

  .btn-primary {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
  }

  .btn-primary:hover {
    background: var(--hf-button-hoverBackground);
  }

  .btn-secondary {
    background: transparent;
    color: var(--hf-foreground);
    border: 1px solid var(--hf-button-secondaryBackground, var(--hf-panel-border)) !important;
  }

  .btn-secondary:hover {
    background: var(--hf-button-secondaryHoverBackground, rgba(90, 93, 94, 0.31));
  }

  .openapi-editor-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--hf-editor-background);
  }

  .openapi-toolbar {
    display: flex;
    align-items: center;
    gap: 0.462rem;
    padding: 0.308rem 0.615rem;
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
  }

  .toolbar-icon {
    color: var(--hf-descriptionForeground);
  }

  .openapi-filename {
    font-size: 1rem;
    color: var(--hf-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .openapi-dirty-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--hf-editorWarning-foreground, #cca700);
    flex-shrink: 0;
  }

  .toolbar-spacer {
    flex: 1;
  }

  .toolbar-btn {
    display: flex;
    align-items: center;
    padding: 0.308rem;
    background: transparent;
    border: none;
    border-radius: 0.308rem;
    color: var(--hf-foreground);
    cursor: pointer;
  }

  .toolbar-btn:hover {
    background: var(--hf-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
  }

  .openapi-editor-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: row;
  }

  .outline-pane-host {
    min-width: 0;
    overflow: hidden;
    border-right: 1px solid var(--hf-panel-border);
  }

  .editor-preview-host {
    min-width: 0;
    overflow: hidden;
    display: flex;
    flex-direction: row;
  }

  .editor-pane-host {
    min-width: 0;
    overflow: hidden;
  }

  .preview-pane-host {
    min-width: 0;
    overflow: hidden;
    border-left: 1px solid var(--hf-panel-border);
  }

  .toolbar-btn.active {
    background: var(--hf-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
    color: var(--hf-textLink-foreground, var(--hf-foreground));
  }
</style>
