<script lang="ts">
  import { openApiSession, setContent, sessionList, reanalyzeAllSessions } from '../../lib/openapi/session.svelte';
  import { openFile, openRecentFile, newDocument, openExampleDocument, saveDocument, saveDocumentAs } from '../../lib/openapi/documentAdapter';
  import { recentOpenApiFiles } from '../../lib/openapi/recentFiles.svelte';
  import { openReferencedFileAndReveal } from '../../lib/openapi/crossFileNav';
  import { pathToFileUri } from '../../lib/openapi/pathUtils';
  import { formatDocument } from '../../lib/openapi/format';
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
  import OpenApiDocTabStrip from './OpenApiDocTabStrip.svelte';

  // $derived doubles as the cache: rebuilt only when content/format change,
  // shared by the marker converter (via prop) and the outline sync below.
  const pointerMap = $derived(
    openApiSession.format ? buildPointerMap(openApiSession.content, openApiSession.format) : undefined
  );

  let surfaceRef = $state<{
    revealOffset(offset: number): void;
    applyEdits(edits: SpecTextEdit[], reveal?: { pointer: string; selectValue: boolean }): void;
    disposeSession(id: string): void;
  }>();
  let activePointer = $state<string>();

  // 150ms mirrors the VS Code outline's SELECTION_SYNC_DEBOUNCE_MS.
  const CURSOR_SYNC_DEBOUNCE_MS = 150;
  const syncCursor = debounce((offset: number) => {
    activePointer = pointerMap ? offsetToPointer(pointerMap, offset) : undefined;
  }, CURSOR_SYNC_DEBOUNCE_MS);
  /** Undebounced cursor offset — the Format action's cursor-preservation input. */
  let lastCursorOffset = 0;

  /**
   * Formats the whole document via lazily-loaded Prettier as ONE undo step
   * (applyEdits brackets the batch in undo stops). The pointer under the
   * pre-format cursor threads through the reveal parameter so the cursor
   * lands on the same node afterwards. Never runs on save.
   */
  async function handleFormat(): Promise<void> {
    if (!openApiSession.format) return;
    const sessionId = openApiSession.id;
    const content = openApiSession.content;
    try {
      const formatted = await formatDocument(content, openApiSession.format);
      // Discard if the tab switched or the user typed while Prettier loaded.
      if (openApiSession.id !== sessionId || openApiSession.content !== content) return;
      if (formatted === content) return;
      const pointer = pointerMap ? offsetToPointer(pointerMap, lastCursorOffset) : '';
      surfaceRef?.applyEdits(
        [{ offset: 0, length: content.length, text: formatted }],
        pointer ? { pointer, selectValue: false } : undefined
      );
    } catch (error) {
      showNotification('error', `Formatting failed: ${error}`);
    }
  }

  // Outline nodes carry documentUri in file:// form (same space the external
  // pass resolves into), so cross-file nodes are detected by URI mismatch.
  const documentFileUri = $derived(
    openApiSession.documentUri ? pathToFileUri(openApiSession.documentUri) : 'untitled'
  );

  function handleOutlineReveal(pointer: string, documentUri?: string): void {
    if (documentUri && documentUri !== documentFileUri) {
      void openReferencedFileAndReveal(documentUri, pointer);
      return;
    }
    if (!pointerMap) return;
    const range = pointerToOffsetRange(pointerMap, pointer);
    if (range) surfaceRef?.revealOffset(range.from);
  }

  // Cross-file navigation arms pendingReveal on the (possibly just-opened)
  // target session; consume it once that session's pointer map exists.
  $effect(() => {
    const pending = openApiSession.pendingReveal;
    if (pending === null || !openApiSession.id) return;
    if (!pointerMap) return; // analysis not ready yet — re-runs when it is
    if (pending === '') {
      surfaceRef?.revealOffset(0);
    } else {
      const range = pointerToOffsetRange(pointerMap, pending);
      if (range) surfaceRef?.revealOffset(range.from);
    }
    openApiSession.pendingReveal = null;
  });

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

  // Settings changes alter the diagnostic set without a content change —
  // re-derive ALL sessions so toggles apply live everywhere (a background
  // tab's diagnostics must not go stale under a changed rule set).
  $effect(() => {
    void settings.openApiLintEnabled;
    void settings.openApiLintRules;
    void settings.openApiExternalRefsEnabled;
    reanalyzeAllSessions();
  });
</script>

{#if sessionList().length === 0}
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
      <button class="btn-secondary" onclick={openExampleDocument}>
        <span class="codicon codicon-beaker"></span>
        Open Example
      </button>
    </div>
    {#if recentOpenApiFiles().length > 0}
      <div class="recent-files">
        <h3>Recent</h3>
        <ul>
          {#each recentOpenApiFiles() as recent (recent.path)}
            <li>
              <button class="recent-file" title={recent.path} onclick={() => openRecentFile(recent.path)}>
                <span class="codicon codicon-file"></span>
                <span class="recent-name">{recent.name}</span>
                <span class="recent-path">{recent.path}</span>
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
{:else}
  <div class="openapi-editor-view">
    <OpenApiDocTabStrip ondisposesession={(id) => surfaceRef?.disposeSession(id)} />
    <div class="openapi-toolbar">
      <span class="codicon codicon-symbol-interface toolbar-icon"></span>
      <div class="toolbar-spacer"></div>
      <button
        class="toolbar-btn"
        onclick={() => void generateCollectionFromOpenApi(openApiSession.id)}
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
      <button class="toolbar-btn" onclick={() => void handleFormat()} title="Format Document">
        <span class="codicon codicon-wand"></span>
      </button>
      <button class="toolbar-btn" onclick={newDocument} title="New Spec">
        <span class="codicon codicon-new-file"></span>
      </button>
      <button class="toolbar-btn" onclick={openFile} title="Open File">
        <span class="codicon codicon-folder-opened"></span>
      </button>
      <button class="toolbar-btn" onclick={openExampleDocument} title="Open Example">
        <span class="codicon codicon-beaker"></span>
      </button>
      <button class="toolbar-btn" onclick={saveDocument} title="Save (Ctrl+S)">
        <span class="codicon codicon-save"></span>
      </button>
      <button class="toolbar-btn" onclick={saveDocumentAs} title="Save As…">
        <span class="codicon codicon-save-as"></span>
      </button>
    </div>
    <div class="openapi-editor-body" role="tabpanel" id="openapi-doc-panel">
      <div class="outline-pane-host" style="flex: {1 - openApiSession.splitRatio}">
        <OpenApiOutlineTree
          analysis={openApiSession.analysis}
          documentUri={documentFileUri}
          sessionId={openApiSession.id}
          content={openApiSession.content}
          format={openApiSession.format ?? undefined}
          sortAlphabetically={settings.openApiOutlineSortAlphabetically}
          external={settings.openApiExternalRefsEnabled ? openApiSession.externalAnalysis : null}
          {activePointer}
          onreveal={handleOutlineReveal}
          ontryit={(operation) => void tryOperation(operation.path, operation.method)}
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
            sessionId={openApiSession.id}
            content={openApiSession.content}
            format={openApiSession.format}
            schemaVersion={openApiSession.version}
            diagnostics={openApiSession.diagnostics}
            {pointerMap}
            onchange={setContent}
            onsave={() => void saveDocument()}
            oncursorchange={(info) => {
              lastCursorOffset = info.offset;
              syncCursor(info.offset);
            }}
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

  .recent-files {
    margin-top: 1.231rem;
    width: min(80%, 32.308rem);
  }

  .recent-files h3 {
    margin: 0 0 0.462rem;
    font-size: 0.923rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--hf-descriptionForeground);
  }

  .recent-files ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.154rem;
  }

  .recent-file {
    display: flex;
    align-items: center;
    gap: 0.462rem;
    width: 100%;
    padding: 0.308rem 0.615rem;
    background: transparent;
    border: none;
    border-radius: 0.308rem;
    color: var(--hf-foreground);
    font-size: 0.923rem;
    cursor: pointer;
    text-align: left;
    min-width: 0;
  }

  .recent-file:hover {
    background: var(--hf-list-hoverBackground, rgba(90, 93, 94, 0.31));
  }

  .recent-file .codicon {
    color: var(--hf-descriptionForeground);
    flex-shrink: 0;
  }

  .recent-name {
    flex-shrink: 0;
  }

  .recent-path {
    color: var(--hf-descriptionForeground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.846rem;
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
