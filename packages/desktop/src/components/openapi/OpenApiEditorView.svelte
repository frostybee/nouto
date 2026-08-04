<script lang="ts">
  import { openApiSession, setContent } from '../../lib/openapi/session.svelte';
  import { openFile, newDocument, saveDocument, saveDocumentAs } from '../../lib/openapi/documentAdapter';
  import OpenApiEditorSurface from './OpenApiEditorSurface.svelte';

  const fileName = $derived(
    openApiSession.documentUri ? openApiSession.documentUri.split(/[/\\]/).pop() : 'Untitled'
  );
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
      <OpenApiEditorSurface
        content={openApiSession.content}
        format={openApiSession.format}
        schemaVersion={openApiSession.version}
        onchange={setContent}
        onsave={() => void saveDocument()}
      />
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
  }
</style>
