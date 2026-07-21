<script lang="ts">
  import { buildFrameDocument, createChannelToken } from '../../lib/openapi-preview/frame';
  import {
    DEFAULT_RENDERER,
    RENDERERS,
    getRenderer,
    type OpenApiPreviewRenderer,
  } from '../../lib/openapi-preview/renderers';
  import {
    observeTheme,
    resolveTheme,
    type OpenApiPreviewTheme,
  } from '../../lib/openapi-preview/theme';

  import {
    listPreviewOperations,
    operationLabel,
    resolveSelection,
    type OpenApiOperationSummary,
  } from '../../lib/openapi-preview/operations';

  interface PersistedState {
    sourceUri: string;
    renderer: OpenApiPreviewRenderer;
    theme: OpenApiPreviewTheme;
    selectedOperationPointer?: string;
  }

  interface Props {
    vscode: { postMessage: (message: unknown) => void; getState: () => unknown; setState: (state: unknown) => void };
    sourceUri: string;
  }

  const { vscode, sourceUri }: Props = $props();

  const persisted = (vscode.getState() ?? {}) as Partial<PersistedState>;

  let renderer = $state<OpenApiPreviewRenderer>(
    RENDERERS.some((entry) => entry.id === persisted.renderer)
      ? (persisted.renderer as OpenApiPreviewRenderer)
      : DEFAULT_RENDERER
  );
  let theme = $state<OpenApiPreviewTheme>(persisted.theme ?? 'auto');
  let selectedOperationPointer = $state<string>(persisted.selectedOperationPointer ?? '');

  /** Inline action state; the host serializes actions, so one flag suffices. */
  let actionBusy = $state(false);
  let actionMessage = $state('');
  let actionError = $state('');

  let spec = $state<object | undefined>(undefined);
  let specVersion = $state<string | undefined>(undefined);
  let stale = $state(false);
  let status = $state<'waiting' | 'loading' | 'ready' | 'error'>('waiting');
  let errorMessage = $state('');
  /** Bumped by the theme observer so `resolvedTheme` recomputes on VS Code theme switches. */
  let themeTick = $state(0);

  let frameEl = $state<HTMLIFrameElement | undefined>(undefined);
  let frameReady = $state(false);
  let blobUrl: string | null = null;
  let channel = $state('');
  /** Non-reactive: which renderer the current frame was built from. */
  let mountedRenderer: OpenApiPreviewRenderer | null = null;

  const resolvedTheme = $derived.by(() => {
    themeTick;
    return resolveTheme(theme, document.body);
  });
  const activeRenderer = $derived(getRenderer(renderer));
  const showCompatibilityWarning = $derived(
    specVersion === '3.2' && !activeRenderer.supportsOpenApi32
  );

  // Enumerated with the same core helper the extension host uses, so ordering
  // and JSON Pointers match exactly — selection survives document updates and
  // the (path, method) pair the host converts is the one shown here.
  const operations = $derived.by<OpenApiOperationSummary[]>(() =>
    spec ? listPreviewOperations($state.snapshot(spec)) : []
  );
  const selectedOperation = $derived(
    operations.find((operation) => operation.pointer === selectedOperationPointer)
  );
  const canTry = $derived(!stale && !actionBusy && operations.length > 0 && !!selectedOperation);
  const canGenerate = $derived(!stale && !actionBusy && !!spec);

  // Keeps the selection valid: retained when the operation still exists after a
  // document change, otherwise falls back to the first operation.
  $effect(() => {
    const resolved = resolveSelection(operations, selectedOperationPointer);
    if (resolved !== selectedOperationPointer) {
      selectedOperationPointer = resolved;
      persist();
    }
  });

  function persist(): void {
    vscode.setState({
      sourceUri,
      renderer,
      theme,
      selectedOperationPointer,
    } satisfies PersistedState);
  }

  function onOperationChange(event: Event): void {
    selectedOperationPointer = (event.currentTarget as HTMLSelectElement).value;
    persist();
  }

  function tryOperation(): void {
    const operation = selectedOperation;
    if (!operation || !canTry) return;
    actionMessage = '';
    actionError = '';
    // The host resolves the document from the panel's bound URI; only the
    // operation coordinates travel with the message.
    vscode.postMessage({
      type: 'openApiTryOperation',
      data: { path: operation.path, method: operation.method },
    });
  }

  function generateCollection(): void {
    if (!canGenerate) return;
    actionMessage = '';
    actionError = '';
    vscode.postMessage({ type: 'openApiGenerateCollection' });
  }

  function revokeFrame(): void {
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      blobUrl = null;
    }
    frameReady = false;
  }

  async function mountFrame(): Promise<void> {
    revokeFrame();
    if (!spec) return;

    status = 'loading';
    errorMessage = '';
    const token = createChannelToken();
    channel = token;

    try {
      const assets = await activeRenderer.load();
      // A renderer switch during the await invalidates this mount.
      if (channel !== token) return;
      const html = buildFrameDocument(assets, token);
      blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      if (frameEl) frameEl.src = blobUrl;
    } catch (error) {
      status = 'error';
      errorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  function pushRender(): void {
    if (!frameReady || !spec || !frameEl?.contentWindow) return;
    frameEl.contentWindow.postMessage(
      { channel, type: 'render', spec: $state.snapshot(spec), theme: resolvedTheme },
      '*'
    );
  }

  function onWindowMessage(event: MessageEvent): void {
    const data = event.data as Record<string, unknown> | null;
    if (!data || typeof data !== 'object') return;

    // Frame → shell. Validated by channel token and source window.
    if (typeof data.channel === 'string') {
      if (data.channel !== channel) return;
      if (!frameEl || event.source !== frameEl.contentWindow) return;
      if (data.type === 'ready') {
        frameReady = true;
        pushRender();
      } else if (data.type === 'rendered') {
        status = 'ready';
      } else if (data.type === 'error') {
        status = 'error';
        errorMessage = String(data.message ?? 'The renderer failed.');
      }
      return;
    }

    // Host → shell. A renderer must never be able to forge these.
    if (frameEl && event.source === frameEl.contentWindow) return;

    if (data.type === 'openApiActionStarted') {
      actionBusy = true;
      actionMessage = '';
      actionError = '';
      return;
    }
    if (data.type === 'openApiActionSucceeded') {
      actionBusy = false;
      actionMessage = String((data.data as { message?: string } | undefined)?.message ?? 'Done.');
      return;
    }
    if (data.type === 'openApiActionFailed') {
      actionBusy = false;
      actionError = String(
        (data.data as { message?: string } | undefined)?.message ?? 'The action failed.'
      );
      return;
    }

    if (data.type !== 'openApiPreviewData') return;
    const payload = data.data as {
      spec?: object;
      version?: string;
      stale?: boolean;
    } | undefined;
    if (!payload) return;

    stale = payload.stale === true;
    if (payload.version) specVersion = payload.version;
    if (payload.spec && typeof payload.spec === 'object') {
      spec = payload.spec;
    }
    if (!spec) {
      status = 'waiting';
    }
  }

  $effect(() => {
    window.addEventListener('message', onWindowMessage);
    const stopThemeObserver = observeTheme(document.body, () => { themeTick += 1; });
    vscode.postMessage({ type: 'openApiPreviewReady' });
    return () => {
      window.removeEventListener('message', onWindowMessage);
      stopThemeObserver();
      revokeFrame();
    };
  });

  // Renderer switches replace the frame; a first specification mounts it.
  // `mountedRenderer` is deliberately NOT reactive: this effect also tracks
  // `spec` (to mount once one arrives), and without the guard every document
  // update would rebuild the blob and reload the whole renderer bundle.
  $effect(() => {
    const nextRenderer = renderer;
    if (!spec) return;
    if (mountedRenderer === nextRenderer) return;
    mountedRenderer = nextRenderer;
    void mountFrame();
  });

  // Document and theme updates rerender inside the existing frame.
  $effect(() => {
    spec;
    resolvedTheme;
    if (frameReady) pushRender();
  });

  function onRendererChange(event: Event): void {
    renderer = (event.currentTarget as HTMLSelectElement).value as OpenApiPreviewRenderer;
    persist();
  }

  function onThemeChange(event: Event): void {
    theme = (event.currentTarget as HTMLSelectElement).value as OpenApiPreviewTheme;
    persist();
  }
</script>

<div class="preview">
  <div class="toolbar">
    <label class="field">
      <span>Renderer</span>
      <select value={renderer} onchange={onRendererChange}>
        {#each RENDERERS as entry (entry.id)}
          <option value={entry.id}>{entry.label}</option>
        {/each}
      </select>
    </label>
    <label class="field">
      <span>Theme</span>
      <select value={theme} onchange={onThemeChange}>
        <option value="auto">Match VS Code</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
    <label class="field operation">
      <span>Operation</span>
      <select
        value={selectedOperationPointer}
        onchange={onOperationChange}
        disabled={operations.length === 0}
      >
        {#each operations as operation (operation.pointer)}
          <option value={operation.pointer}>{operationLabel(operation)}</option>
        {/each}
        {#if operations.length === 0}
          <option value="">No operations</option>
        {/if}
      </select>
    </label>
    <button type="button" onclick={tryOperation} disabled={!canTry}>Try It</button>
    <button type="button" onclick={generateCollection} disabled={!canGenerate}>
      Generate Collection
    </button>
    <div class="spacer"></div>
    {#if specVersion}
      <span class="badge">OpenAPI {specVersion}</span>
    {/if}
  </div>

  {#if actionBusy}
    <div class="banner info">Working…</div>
  {:else if actionError}
    <div class="banner error">{actionError}</div>
  {:else if actionMessage}
    <div class="banner info">{actionMessage}</div>
  {/if}

  {#if showCompatibilityWarning}
    <div class="banner warning">
      {activeRenderer.label} does not document OpenAPI 3.2 support. Parts of this
      specification may render incorrectly — Swagger UI supports 3.2.
    </div>
  {/if}

  {#if stale && spec}
    <div class="banner stale">
      Showing the last valid specification. The document currently does not parse
      as OpenAPI 3.0, 3.1, or 3.2.
    </div>
  {/if}

  {#if status === 'error'}
    <div class="banner error">Renderer error: {errorMessage}</div>
  {/if}

  {#if !spec}
    <div class="empty">
      {#if stale}
        This document does not parse as an OpenAPI 3.0, 3.1, or 3.2
        specification yet. The preview will appear once it does.
      {:else}
        Loading specification…
      {/if}
    </div>
  {/if}

  <iframe
    bind:this={frameEl}
    class="frame"
    class:hidden={!spec}
    title="OpenAPI documentation preview"
    sandbox="allow-scripts"
  ></iframe>
</div>

<style>
  .preview {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--vscode-editor-background);
    color: var(--vscode-foreground);
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--vscode-panel-border, transparent);
    flex: 0 0 auto;
  }

  .field {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.846rem;
  }

  .field select {
    background: var(--vscode-dropdown-background);
    color: var(--vscode-dropdown-foreground);
    border: 1px solid var(--vscode-dropdown-border, transparent);
    border-radius: 2px;
    padding: 2px 4px;
    font-size: 0.846rem;
  }

  /* The operation list is the only toolbar control that can grow long. */
  .field.operation select {
    max-width: 320px;
  }

  .toolbar button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: 1px solid var(--vscode-button-border, transparent);
    border-radius: 2px;
    padding: 3px 10px;
    font-size: 0.846rem;
    cursor: pointer;
  }

  .toolbar button:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground);
  }

  .toolbar button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .spacer { flex: 1 1 auto; }

  .badge {
    font-size: 0.769rem;
    padding: 2px 6px;
    border-radius: 8px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
  }

  .banner {
    padding: 6px 10px;
    font-size: 0.846rem;
    flex: 0 0 auto;
  }

  .banner.warning {
    background: var(--vscode-inputValidation-warningBackground);
    border-bottom: 1px solid var(--vscode-inputValidation-warningBorder);
  }

  .banner.info {
    background: var(--vscode-inputValidation-infoBackground);
    border-bottom: 1px solid var(--vscode-inputValidation-infoBorder);
  }

  .banner.stale {
    background: var(--vscode-inputValidation-infoBackground);
    border-bottom: 1px solid var(--vscode-inputValidation-infoBorder);
  }

  .banner.error {
    background: var(--vscode-inputValidation-errorBackground);
    border-bottom: 1px solid var(--vscode-inputValidation-errorBorder);
  }

  .empty {
    padding: 24px;
    font-size: 0.923rem;
    opacity: 0.8;
  }

  .frame {
    flex: 1 1 auto;
    width: 100%;
    border: 0;
    background: var(--vscode-editor-background);
  }

  .frame.hidden {
    display: none;
  }
</style>
