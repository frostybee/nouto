<script lang="ts">
  interface RecentFile {
    path: string;
    name: string;
    timestamp: number;
    kind?: 'file' | 'url';
  }

  let view = $state<'main' | 'about'>('main');
  let recentFiles = $state<RecentFile[]>([]);
  let iconUrl = $state<string>('');
  let version = $state<string>('');

  // Fetch-from-URL form state
  let fetchFormOpen = $state(false);
  let fetchUrl = $state('');
  let headers = $state<Array<{ name: string; value: string }>>([]);
  let headersExpanded = $state(false);
  let fetching = $state(false);
  let urlInputEl = $state<HTMLInputElement | undefined>(undefined);

  const urlValid = $derived.by(() => {
    try {
      const u = new URL(fetchUrl.trim());
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  });

  window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data;
    if (msg.type === 'recentFiles') {
      recentFiles = msg.data;
    } else if (msg.type === 'showAbout') {
      iconUrl = msg.iconUrl ?? '';
      version = msg.version ?? '';
      view = 'about';
    } else if (msg.type === 'showMain') {
      view = 'main';
    } else if (msg.type === 'showFetchForm') {
      view = 'main';
      fetchFormOpen = true;
      focusUrlInput();
    } else if (msg.type === 'fetchDone') {
      fetching = false;
      if (msg.ok) {
        fetchFormOpen = false;
        fetchUrl = '';
      }
    }
  });

  (window as any).vscode.postMessage({ type: 'ready' });

  function openFromDisk() {
    (window as any).vscode.postMessage({ type: 'openFromDisk' });
  }

  function pasteJson() {
    (window as any).vscode.postMessage({ type: 'pasteJson' });
  }

  function toggleFetchForm() {
    fetchFormOpen = !fetchFormOpen;
    if (fetchFormOpen) focusUrlInput();
  }

  function focusUrlInput() {
    setTimeout(() => urlInputEl?.focus(), 0);
  }

  function addHeader() {
    headers.push({ name: '', value: '' });
  }

  function removeHeader(index: number) {
    headers.splice(index, 1);
  }

  function submitFetch() {
    if (!urlValid || fetching) return;
    fetching = true;
    const cleaned = headers
      .filter((h) => h.name.trim())
      .map((h) => ({ name: h.name.trim(), value: h.value }));
    (window as any).vscode.postMessage({ type: 'fetchFromUrl', url: fetchUrl.trim(), headers: cleaned });
  }

  function handleFetchKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      submitFetch();
    } else if (e.key === 'Escape') {
      fetchFormOpen = false;
    }
  }

  function openRecentFile(path: string) {
    (window as any).vscode.postMessage({ type: 'openRecentFile', path });
  }

  function removeRecentFile(e: MouseEvent, path: string) {
    e.stopPropagation();
    (window as any).vscode.postMessage({ type: 'removeRecentFile', path });
  }

  function openLink(url: string) {
    (window as any).vscode.postMessage({ type: 'openLink', url });
  }

  function formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function truncatePath(path: string, maxLen = 50): string {
    if (path.length <= maxLen) return path;
    const sep = path.includes('\\') ? '\\' : '/';
    const parts = path.split(sep);
    if (parts.length <= 2) return '...' + path.slice(-(maxLen - 3));
    const head = parts[0];
    const tail = parts[parts.length - 2] + sep + parts[parts.length - 1];
    return head + sep + '...' + sep + tail;
  }

  const repoUrl = 'https://github.com/frostybee/nouto';

  // ---- Recent file context menu ----
  let ctxMenuFile = $state<RecentFile | null>(null);
  let ctxMenuPos = $state({ x: 0, y: 0 });

  function handleRecentContextMenu(e: MouseEvent, file: RecentFile) {
    e.preventDefault();
    e.stopPropagation();
    ctxMenuFile = file;
    ctxMenuPos = { x: e.clientX, y: e.clientY };
  }

  function closeCtxMenu() {
    ctxMenuFile = null;
  }

  async function ctxCopyPath() {
    if (!ctxMenuFile) return;
    await navigator.clipboard.writeText(ctxMenuFile.path);
    closeCtxMenu();
  }

  function ctxEditUrl() {
    if (!ctxMenuFile || ctxMenuFile.kind !== 'url') return;
    fetchUrl = ctxMenuFile.path;
    fetchFormOpen = true;
    headersExpanded = false;
    closeCtxMenu();
    focusUrlInput();
  }

  function ctxOpenInBrowser() {
    if (!ctxMenuFile || ctxMenuFile.kind !== 'url') return;
    openLink(ctxMenuFile.path);
    closeCtxMenu();
  }

  function ctxRemove() {
    if (!ctxMenuFile) return;
    (window as any).vscode.postMessage({ type: 'removeRecentFile', path: ctxMenuFile.path });
    closeCtxMenu();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<svelte:window oncontextmenu={(e) => e.preventDefault()} />

{#if view === 'about'}
  <div class="sidebar-container">
    <div class="about-header">
      <span class="about-title">
        <i class="codicon codicon-info"></i>
        About
      </span>
      <button class="done-btn" onclick={() => {
        view = 'main';
        (window as any).vscode.postMessage({ type: 'viewChanged', view: 'main' });
      }}>Done</button>
    </div>

    <div class="about-body">
      <div class="about-hero">
        {#if iconUrl}
          <img src={iconUrl} alt="Nouto JSON Explorer" class="about-icon" />
        {/if}
        <h2 class="about-name">Nouto JSON Explorer</h2>
        <span class="about-version">v{version}</span>
      </div>
      <p class="about-description">
        A JSON Explorer for VS Code. Open any JSON file or paste JSON from your clipboard and navigate it as a collapsible tree or a table.
      </p>

      <div class="about-details">
        <div class="about-row">
          <span class="about-label">License</span>
          <span class="about-value">MIT</span>
        </div>
        <div class="about-row">
          <span class="about-label">Author</span>
          <span class="about-value">frostybee</span>
        </div>
        <div class="about-row">
          <span class="about-label">VS Code Engine</span>
          <span class="about-value">^1.74.0</span>
        </div>
      </div>

      <div class="about-section-label">Links</div>
      <div class="about-links">
        <button class="about-link-btn" onclick={() => openLink('https://nouto.frostybee.dev')}>
          <i class="codicon codicon-book"></i>
          Documentation
        </button>
        <button class="about-link-btn" onclick={() => openLink(repoUrl)}>
          <i class="codicon codicon-github"></i>
          GitHub Repository
        </button>
        <button class="about-link-btn" onclick={() => openLink(repoUrl + '/issues/new?template=bug_report.yml')}>
          <i class="codicon codicon-bug"></i>
          Report a Bug
        </button>
        <button class="about-link-btn" onclick={() => openLink(repoUrl + '/issues/new?template=feature_request.yml')}>
          <i class="codicon codicon-lightbulb"></i>
          Request a Feature
        </button>
        <button class="about-link-btn" onclick={() => openLink(repoUrl + '/blob/main/packages/json-explorer-ext/changelog.md')}>
          <i class="codicon codicon-list-flat"></i>
          Changelog
        </button>
      </div>
    </div>
  </div>
{:else}
  <div class="sidebar-container">
    <div class="open-section">
      <button class="open-btn" onclick={openFromDisk}>
        <i class="codicon codicon-folder-opened"></i>
        Open JSON File...
      </button>
      <button class="paste-btn" onclick={pasteJson}>
        <i class="codicon codicon-clippy"></i>
        Paste JSON
      </button>
      <button class="paste-btn" onclick={toggleFetchForm}>
        <i class="codicon codicon-cloud-download"></i>
        Fetch from URL...
      </button>
      <p class="paste-hint">Copy JSON from any source, then click Paste JSON to explore it.</p>
    </div>

    {#if fetchFormOpen}
      <div class="fetch-form">
        <label class="fetch-label" for="fetch-url-input">URL</label>
        <input
          id="fetch-url-input"
          bind:this={urlInputEl}
          bind:value={fetchUrl}
          onkeydown={handleFetchKeydown}
          type="text"
          class="fetch-input"
          placeholder="https://api.example.com/data.json"
          spellcheck="false"
        />
        {#if fetchUrl.trim() && !urlValid}
          <div class="fetch-error">Enter a valid http:// or https:// URL.</div>
        {/if}

        <button class="headers-toggle" onclick={() => { headersExpanded = !headersExpanded; }}>
          <i class="codicon {headersExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right'}"></i>
          Headers{headers.length > 0 ? ` (${headers.length})` : ''}
        </button>

        {#if headersExpanded}
          {#each headers as header, i}
            <div class="header-row">
              <input
                class="fetch-input header-name"
                placeholder="Name"
                bind:value={header.name}
                spellcheck="false"
              />
              <input
                class="fetch-input header-value"
                placeholder="Value"
                type="password"
                bind:value={header.value}
                spellcheck="false"
              />
              <button class="header-remove" title="Remove header" onclick={() => removeHeader(i)}>
                <i class="codicon codicon-close"></i>
              </button>
            </div>
          {/each}
          <button class="add-header-btn" onclick={addHeader}>+ Add header</button>
        {/if}

        <div class="fetch-actions">
          <button class="fetch-submit-btn" disabled={!urlValid || fetching} onclick={submitFetch}>
            {fetching ? 'Fetching…' : 'Fetch'}
          </button>
          <button class="fetch-cancel-btn" onclick={() => { fetchFormOpen = false; }}>Cancel</button>
        </div>
      </div>
    {/if}

    <div class="recent-section">
      <div class="section-header">Recent Files</div>

      {#if recentFiles.length === 0}
        <div class="empty-state">No recent files</div>
      {:else}
        <ul class="recent-list">
          {#each recentFiles as file (file.path)}
            <li class="recent-item" title={file.path} oncontextmenu={(e) => handleRecentContextMenu(e, file)}>
              <button class="recent-item-btn" onclick={() => openRecentFile(file.path)}>
                <i class="codicon {file.kind === 'url' ? 'codicon-globe' : 'codicon-json'}"></i>
                <div class="file-info">
                  <span class="file-name">{file.name}</span>
                  <span class="file-path">{file.kind === 'url' ? file.path : truncatePath(file.path)}</span>
                  <span class="file-date">{formatTimestamp(file.timestamp)}</span>
                </div>
              </button>
              <button
                class="remove-btn"
                title="Remove from recent"
                onclick={(e) => removeRecentFile(e, file.path)}
              >
                <i class="codicon codicon-close"></i>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    {#if ctxMenuFile}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="ctx-backdrop" onclick={closeCtxMenu} onkeydown={(e) => { if (e.key === 'Escape') closeCtxMenu(); }}></div>
      <div class="ctx-menu" style="left: {ctxMenuPos.x}px; top: {ctxMenuPos.y}px;" role="menu">
        <button class="ctx-item" onclick={ctxCopyPath} role="menuitem">
          <i class="codicon codicon-copy"></i>
          {ctxMenuFile.kind === 'url' ? 'Copy URL' : 'Copy Path'}
        </button>
        {#if ctxMenuFile.kind === 'url'}
          <button class="ctx-item" onclick={ctxEditUrl} role="menuitem">
            <i class="codicon codicon-edit"></i>
            Edit URL
          </button>
          <button class="ctx-item" onclick={ctxOpenInBrowser} role="menuitem">
            <i class="codicon codicon-link-external"></i>
            Open in Browser
          </button>
        {/if}
        <div class="ctx-separator"></div>
        <button class="ctx-item ctx-item-danger" onclick={ctxRemove} role="menuitem">
          <i class="codicon codicon-trash"></i>
          Remove
        </button>
      </div>
    {/if}
  </div>
{/if}

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    overflow: hidden;
  }

  .sidebar-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background);
  }

  /* ---- About view ---- */

  .about-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid var(--vscode-sideBar-border, var(--vscode-panel-border));
  }

  .about-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--vscode-foreground);
  }

  .about-title .codicon {
    font-size: 14px;
    opacity: 0.8;
  }

  .done-btn {
    padding: 4px 14px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 2px;
    font-size: 12px;
    font-family: var(--vscode-font-family);
    cursor: pointer;
  }

  .done-btn:hover {
    background: var(--vscode-button-hoverBackground);
  }

  .about-body {
    padding: 20px 16px;
    overflow-y: auto;
    flex: 1;
  }

  .about-hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    margin-bottom: 16px;
  }

  .about-icon {
    width: 56px;
    height: 56px;
    border-radius: 10px;
    margin-bottom: 10px;
  }

  .about-name {
    font-size: 18px;
    font-weight: 700;
    color: var(--vscode-foreground);
    margin: 0 0 4px;
  }

  .about-version {
    font-size: 14px;
    color: var(--vscode-foreground);
    font-family: var(--vscode-editor-font-family, monospace);
    opacity: 0.7;
  }

  .about-description {
    font-size: 13px;
    line-height: 1.5;
    color: var(--vscode-foreground);
    opacity: 0.85;
    margin: 0 0 20px;
  }

  .about-details {
    margin-bottom: 20px;
  }

  .about-row {
    display: flex;
    justify-content: space-between;
    padding: 7px 0;
    border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border, #555) 40%, transparent);
  }

  .about-label {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }

  .about-value {
    font-size: 12px;
    color: var(--vscode-foreground);
    font-weight: 500;
  }

  .about-section-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground));
    opacity: 0.7;
    margin-bottom: 8px;
  }

  .about-links {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .about-link-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 12px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none;
    border-radius: 2px;
    font-size: 13px;
    font-family: var(--vscode-font-family);
    cursor: pointer;
    text-align: left;
  }

  .about-link-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  .about-link-btn .codicon {
    font-size: 15px;
    opacity: 0.8;
    flex-shrink: 0;
  }

  /* ---- Main view ---- */

  .open-section {
    padding: 10px 8px 8px;
    border-bottom: 1px solid var(--vscode-sideBar-border, var(--vscode-panel-border));
  }

  .open-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 6px 10px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 2px;
    cursor: pointer;
    font-size: var(--vscode-font-size);
    font-family: var(--vscode-font-family);
  }

  .open-btn:hover {
    background: var(--vscode-button-hoverBackground);
  }

  .open-btn .codicon {
    font-size: 14px;
  }

  .paste-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    margin-top: 6px;
    padding: 6px 10px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    border: 1px solid var(--vscode-button-border, color-mix(in srgb, var(--vscode-foreground) 20%, transparent));
    border-radius: 2px;
    cursor: pointer;
    font-size: var(--vscode-font-size);
    font-family: var(--vscode-font-family);
    white-space: nowrap;
  }

  .paste-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground);
    border-color: var(--vscode-button-border, color-mix(in srgb, var(--vscode-foreground) 35%, transparent));
  }

  .paste-btn .codicon {
    font-size: 14px;
    flex-shrink: 0;
  }

  .paste-hint {
    margin: 6px 2px 0;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    line-height: 1.4;
  }

  /* ---- Fetch from URL form ---- */

  .fetch-form {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 8px;
    border-bottom: 1px solid var(--vscode-sideBar-border, var(--vscode-panel-border));
  }

  .fetch-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground));
    opacity: 0.7;
  }

  .fetch-input {
    width: 100%;
    box-sizing: border-box;
    padding: 4px 6px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    outline: none;
  }

  .fetch-input:focus {
    border-color: var(--vscode-focusBorder);
  }

  .fetch-input::placeholder {
    color: var(--vscode-input-placeholderForeground);
  }

  .fetch-error {
    font-size: 11px;
    color: var(--vscode-errorForeground);
  }

  .headers-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 0;
    background: none;
    border: none;
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    font-size: 12px;
    cursor: pointer;
    text-align: left;
  }

  .headers-toggle .codicon {
    font-size: 13px;
  }

  .header-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .header-name {
    flex: 2;
    min-width: 0;
  }

  .header-value {
    flex: 3;
    min-width: 0;
  }

  .header-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    padding: 0;
    background: none;
    border: none;
    border-radius: 2px;
    cursor: pointer;
    color: var(--vscode-foreground);
    opacity: 0.7;
  }

  .header-remove:hover {
    background: var(--vscode-toolbar-hoverBackground);
    opacity: 1;
  }

  .add-header-btn {
    align-self: flex-start;
    padding: 2px 0;
    background: none;
    border: none;
    color: var(--vscode-textLink-foreground);
    font-family: var(--vscode-font-family);
    font-size: 12px;
    cursor: pointer;
  }

  .add-header-btn:hover {
    text-decoration: underline;
  }

  .fetch-actions {
    display: flex;
    gap: 6px;
    margin-top: 2px;
  }

  .fetch-submit-btn {
    flex: 1;
    padding: 5px 10px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 2px;
    cursor: pointer;
    font-size: var(--vscode-font-size);
    font-family: var(--vscode-font-family);
  }

  .fetch-submit-btn:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground);
  }

  .fetch-submit-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .fetch-cancel-btn {
    flex: 1;
    padding: 5px 10px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none;
    border-radius: 2px;
    cursor: pointer;
    font-size: var(--vscode-font-size);
    font-family: var(--vscode-font-family);
  }

  .fetch-cancel-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  .recent-section {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
  }

  .section-header {
    padding: 8px 8px 2px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground));
    opacity: 0.7;
  }

  .empty-state {
    padding: 8px 8px;
    color: var(--vscode-descriptionForeground);
    font-style: italic;
  }

  .recent-list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    flex: 1;
  }

  .recent-item {
    display: flex;
    align-items: center;
    position: relative;
  }

  .recent-item:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .recent-item-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
    padding: 4px 4px 4px 8px;
    background: none;
    border: none;
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    cursor: pointer;
    text-align: left;
  }

  .recent-item-btn .codicon-json,
  .recent-item-btn .codicon-globe {
    flex-shrink: 0;
    font-size: 14px;
    color: var(--vscode-descriptionForeground);
  }

  .file-info {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  .file-name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-path {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-date {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    opacity: 0.7;
  }

  .remove-btn {
    display: none;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    background: none;
    border: none;
    border-radius: 2px;
    cursor: pointer;
    color: var(--vscode-foreground);
    opacity: 0.7;
  }

  .remove-btn:hover {
    background: var(--vscode-toolbar-hoverBackground);
    opacity: 1;
  }

  .recent-item:hover .remove-btn,
  .remove-btn:focus {
    display: flex;
  }

  /* ---- Context menu ---- */

  .ctx-backdrop {
    position: fixed;
    inset: 0;
    z-index: 999;
  }

  .ctx-menu {
    position: fixed;
    z-index: 1000;
    min-width: 160px;
    background: var(--vscode-menu-background, var(--vscode-editorWidget-background));
    border: 1px solid var(--vscode-menu-border, var(--vscode-editorWidget-border, var(--vscode-panel-border)));
    border-radius: 4px;
    padding: 4px 0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  }

  .ctx-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 12px;
    background: none;
    color: var(--vscode-menu-foreground, var(--vscode-foreground));
    border: none;
    cursor: pointer;
    font-size: 12px;
    font-family: var(--vscode-font-family);
    text-align: left;
    white-space: nowrap;
  }

  .ctx-item:hover {
    background: var(--vscode-menu-selectionBackground, var(--vscode-list-activeSelectionBackground));
    color: var(--vscode-menu-selectionForeground, var(--vscode-list-activeSelectionForeground));
  }

  .ctx-item .codicon {
    font-size: 14px;
    width: 14px;
    text-align: center;
  }

  .ctx-item-danger {
    color: var(--vscode-errorForeground);
  }

  .ctx-separator {
    height: 1px;
    background: var(--vscode-menu-separatorBackground, var(--vscode-panel-border));
    margin: 4px 0;
  }
</style>
