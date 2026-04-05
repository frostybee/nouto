<script lang="ts">
  interface RecentFile {
    path: string;
    name: string;
    timestamp: number;
  }

  let view = $state<'main' | 'about'>('main');
  let recentFiles = $state<RecentFile[]>([]);
  let iconUrl = $state<string>('');
  let version = $state<string>('');

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
    }
  });

  (window as any).vscode.postMessage({ type: 'ready' });

  function openFromDisk() {
    (window as any).vscode.postMessage({ type: 'openFromDisk' });
  }

  function pasteJson() {
    (window as any).vscode.postMessage({ type: 'pasteJson' });
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
</script>

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
        <button class="about-link-btn" onclick={() => openLink(repoUrl + '/issues')}>
          <i class="codicon codicon-issues"></i>
          Report an Issue
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
      <p class="paste-hint">Copy JSON from any source, then click Paste JSON to explore it.</p>
    </div>

    <div class="recent-section">
      <div class="section-header">Recent Files</div>

      {#if recentFiles.length === 0}
        <div class="empty-state">No recent files</div>
      {:else}
        <ul class="recent-list">
          {#each recentFiles as file (file.path)}
            <li class="recent-item" title={file.path}>
              <button class="recent-item-btn" onclick={() => openRecentFile(file.path)}>
                <i class="codicon codicon-json"></i>
                <div class="file-info">
                  <span class="file-name">{file.name}</span>
                  <span class="file-path">{truncatePath(file.path)}</span>
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
    padding: 3px 10px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none;
    border-radius: 2px;
    font-size: 12px;
    font-family: var(--vscode-font-family);
    cursor: pointer;
  }

  .done-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground);
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
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-editor-font-family, monospace);
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
    color: var(--vscode-button-secondaryForeground);
    border: none;
    border-radius: 2px;
    cursor: pointer;
    font-size: var(--vscode-font-size);
    font-family: var(--vscode-font-family);
  }

  .paste-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  .paste-btn .codicon {
    font-size: 14px;
  }

  .paste-hint {
    margin: 6px 2px 0;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    line-height: 1.4;
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

  .recent-item-btn .codicon-json {
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
</style>
