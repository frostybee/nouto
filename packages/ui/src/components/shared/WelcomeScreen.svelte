<script lang="ts">
  interface RecentProject {
    path: string;
    name: string;
    last_opened: string;
  }

  interface Props {
    recentProjects?: RecentProject[];
    isFirstRun?: boolean;
    iconSrc?: string;
    projectPath?: string | null;
    collectionCount?: number;
    environmentCount?: number;
    onNewProject?: () => void;
    onOpenFolder?: () => void;
    onImportCollection?: () => void;
    onLoadSampleCollection?: () => void;
    onStartFromScratch?: () => void;
    onNewRequest?: () => void;
    onOpenDocs?: () => void;
    onOpenEnvironments?: () => void;
    onOpenRecentProject?: (path: string) => void;
    onRemoveRecentProject?: (path: string) => void;
  }

  let {
    recentProjects = [],
    isFirstRun = false,
    iconSrc,
    projectPath = null,
    collectionCount = 0,
    environmentCount = 0,
    onNewProject,
    onOpenFolder,
    onImportCollection,
    onLoadSampleCollection,
    onStartFromScratch,
    onNewRequest,
    onOpenDocs,
    onOpenEnvironments,
    onOpenRecentProject,
    onRemoveRecentProject,
  }: Props = $props();

  function formatRelativeTime(isoDate: string): string {
    try {
      const date = new Date(isoDate);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return '';
    }
  }

  function shortenPath(path: string): string {
    // Replace home directory with ~
    const home = path.match(/^([A-Z]:[\\/]Users[\\/][^\\/]+)/i)?.[1]
      || path.match(/^(\/home\/[^/]+)/)?.[1]
      || path.match(/^(\/Users\/[^/]+)/)?.[1];
    if (home) {
      return '~' + path.slice(home.length).replace(/\\/g, '/');
    }
    return path.replace(/\\/g, '/');
  }
</script>

<div class="welcome-screen">
  <div class="welcome-content">
    {#if iconSrc}
      <img class="welcome-icon-img" src={iconSrc} alt="Nouto" />
    {:else}
      <div class="welcome-icon codicon codicon-globe"></div>
    {/if}
    <h2 class="welcome-title">Welcome to Nouto</h2>
    <p class="welcome-subtitle">
      {#if projectPath}
        Select a request from the sidebar or get started
      {:else if isFirstRun}
        A REST client for testing APIs
      {:else}
        Create a project or open an existing folder to get started
      {/if}
    </p>

    {#if projectPath}
      <div class="stats-bar">
        <div class="stat-item">
          <span class="stat-number">{collectionCount}</span>
          <span class="stat-label">Collections</span>
        </div>
        <div class="stat-item">
          <span class="stat-number">{environmentCount}</span>
          <span class="stat-label">Environments</span>
        </div>
      </div>
      {#if onOpenEnvironments}
        <button class="manage-env-btn" onclick={onOpenEnvironments} type="button">
          <span class="codicon codicon-settings-gear"></span>
          Manage Environments
        </button>
      {/if}
      <div class="onboarding-cards">
        {#if onNewRequest}
          <button class="onboarding-card primary" onclick={onNewRequest}>
            <span class="card-icon codicon codicon-add"></span>
            <span class="card-label">New Request</span>
            <span class="card-desc">Create a blank request</span>
          </button>
        {/if}
        {#if onImportCollection}
          <button class="onboarding-card" onclick={onImportCollection}>
            <span class="card-icon codicon codicon-cloud-download"></span>
            <span class="card-label">Import Collection</span>
            <span class="card-desc">Postman, Bruno, OpenAPI, and more</span>
          </button>
        {/if}
        {#if onLoadSampleCollection}
          <button class="onboarding-card" onclick={onLoadSampleCollection}>
            <span class="card-icon codicon codicon-beaker"></span>
            <span class="card-label">Try Sample Collection</span>
            <span class="card-desc">Explore httpbin.org API examples</span>
          </button>
        {/if}
        {#if onOpenDocs}
          <button class="onboarding-card" onclick={onOpenDocs}>
            <span class="card-icon codicon codicon-book"></span>
            <span class="card-label">Open Documentation</span>
            <span class="card-desc">Learn how to use Nouto</span>
          </button>
        {/if}
      </div>
    {:else if isFirstRun}
      <div class="onboarding-cards">
        {#if onLoadSampleCollection}
          <button class="onboarding-card primary" onclick={onLoadSampleCollection}>
            <span class="card-icon codicon codicon-beaker"></span>
            <span class="card-label">Try Sample Collection</span>
            <span class="card-desc">Explore httpbin.org API examples</span>
          </button>
        {/if}
        {#if onImportCollection}
          <button class="onboarding-card" onclick={onImportCollection}>
            <span class="card-icon codicon codicon-cloud-download"></span>
            <span class="card-label">Import from Postman</span>
            <span class="card-desc">Bring your existing collections</span>
          </button>
        {/if}
        {#if onStartFromScratch}
          <button class="onboarding-card" onclick={onStartFromScratch}>
            <span class="card-icon codicon codicon-add"></span>
            <span class="card-label">Start from Scratch</span>
            <span class="card-desc">Create a new request</span>
          </button>
        {/if}
        {#if onOpenFolder}
          <button class="onboarding-card" onclick={onOpenFolder}>
            <span class="card-icon codicon codicon-folder-opened"></span>
            <span class="card-label">Open Existing Project</span>
            <span class="card-desc">Open a folder with saved data</span>
          </button>
        {/if}
      </div>
    {:else}
      <div class="welcome-actions">
        {#if onNewProject}
          <button class="welcome-btn primary" onclick={onNewProject}>
            <span class="codicon codicon-new-folder"></span>
            New Project
          </button>
        {/if}
        {#if onOpenFolder}
          <button class="welcome-btn" onclick={onOpenFolder}>
            <span class="codicon codicon-folder-opened"></span>
            Open Folder
          </button>
        {/if}
        {#if onImportCollection}
          <button class="welcome-btn" onclick={onImportCollection}>
            <span class="codicon codicon-cloud-download"></span>
            Import Collection
          </button>
        {/if}
      </div>
    {/if}

    {#if !projectPath && recentProjects.length > 0}
      <div class="recent-section">
        <h3 class="recent-heading">Recent Projects</h3>
        <div class="recent-list">
          {#each recentProjects as project (project.path)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="recent-item"
              role="button"
              tabindex="0"
              onclick={() => onOpenRecentProject?.(project.path)}
              onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') onOpenRecentProject?.(project.path); }}
            >
              <span class="recent-icon codicon codicon-folder"></span>
              <div class="recent-info">
                <span class="recent-name">{project.name}</span>
                <span class="recent-path">{shortenPath(project.path)}</span>
              </div>
              <span class="recent-time">{formatRelativeTime(project.last_opened)}</span>
              <button
                class="recent-remove"
                title="Remove from recent"
                onclick={(e: MouseEvent) => { e.stopPropagation(); onRemoveRecentProject?.(project.path); }}
              >
                <span class="codicon codicon-close"></span>
              </button>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .welcome-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 3.077rem;
    background: var(--hf-editor-background);
  }

  .welcome-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    max-width: 30.769rem;
    width: 100%;
  }

  .welcome-icon {
    font-size: 3.692rem;
    color: var(--hf-foreground);
    opacity: 0.4;
    margin-bottom: 1.231rem;
  }

  .welcome-icon-img {
    width: 7.385rem;
    height: 7.385rem;
    margin-bottom: 1.231rem;
    object-fit: contain;
  }

  .welcome-title {
    margin: 0 0 0.615rem;
    font-size: 1.538rem;
    font-weight: 600;
    color: var(--hf-foreground);
  }

  .welcome-subtitle {
    margin: 0 0 1.846rem;
    font-size: 1rem;
    color: var(--hf-descriptionForeground);
    max-width: 21.538rem;
  }

  .stats-bar {
    display: flex;
    gap: 2.462rem;
    margin-bottom: 1.846rem;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.154rem;
  }

  .stat-number {
    font-size: 1.846rem;
    font-weight: 700;
    color: var(--hf-foreground);
  }

  .stat-label {
    font-size: 0.923rem;
    color: var(--hf-descriptionForeground);
  }

  .manage-env-btn {
    display: flex;
    align-items: center;
    gap: 0.462rem;
    padding: 0.462rem 1.077rem;
    margin-bottom: 1.846rem;
    background: transparent;
    color: var(--hf-textLink-foreground, #3794ff);
    border: 1px solid var(--hf-textLink-foreground, #3794ff);
    border-radius: 0.308rem;
    font-size: 0.923rem;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .manage-env-btn:hover {
    background: var(--hf-textLink-foreground, #3794ff);
    color: var(--hf-editor-background, #1e1e1e);
  }

  .manage-env-btn .codicon {
    font-size: 1rem;
  }

  .welcome-actions {
    display: flex;
    gap: 0.615rem;
    margin-bottom: 2.462rem;
  }

  .welcome-btn {
    display: flex;
    align-items: center;
    gap: 0.462rem;
    padding: 0.615rem 1.231rem;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: none;
    border-radius: 0.308rem;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.15s;
    white-space: nowrap;
  }

  .welcome-btn:hover {
    background: var(--hf-button-secondaryHoverBackground);
  }

  .welcome-btn.primary {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
  }

  .welcome-btn.primary:hover {
    background: var(--hf-button-hoverBackground);
  }

  .welcome-btn .codicon {
    font-size: 1.077rem;
  }

  /* Onboarding card layout */
  .onboarding-cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.769rem;
    width: 100%;
    margin-bottom: 2.462rem;
  }

  .onboarding-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.462rem;
    padding: 1.538rem 0.923rem;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: 1px solid var(--hf-panel-border);
    border-radius: 0.462rem;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    text-align: center;
  }

  .onboarding-card:hover {
    background: var(--hf-button-secondaryHoverBackground);
    border-color: var(--hf-focusBorder, #007fd4);
  }

  .onboarding-card.primary {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border-color: transparent;
  }

  .onboarding-card.primary:hover {
    background: var(--hf-button-hoverBackground);
  }

  .card-icon {
    font-size: 1.846rem;
    opacity: 0.85;
  }

  .card-label {
    font-size: 1rem;
    font-weight: 600;
  }

  .card-desc {
    font-size: 0.846rem;
    opacity: 0.7;
    line-height: 1.3;
  }

  .recent-section {
    width: 100%;
    text-align: left;
  }

  .recent-heading {
    margin: 0 0 0.615rem;
    font-size: 0.846rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--hf-descriptionForeground);
  }

  .recent-list {
    display: flex;
    flex-direction: column;
    gap: 0.154rem;
  }

  .recent-item {
    display: flex;
    align-items: center;
    gap: 0.769rem;
    padding: 0.615rem 0.769rem;
    background: transparent;
    border: none;
    border-radius: 0.308rem;
    cursor: pointer;
    text-align: left;
    width: 100%;
    color: var(--hf-foreground);
    transition: background 0.1s;
  }

  .recent-item:hover {
    background: var(--hf-list-hoverBackground);
  }

  .recent-icon {
    font-size: 1.231rem;
    opacity: 0.6;
    flex-shrink: 0;
  }

  .recent-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }

  .recent-name {
    font-size: 1rem;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .recent-path {
    font-size: 0.846rem;
    color: var(--hf-descriptionForeground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .recent-time {
    font-size: 0.846rem;
    color: var(--hf-descriptionForeground);
    flex-shrink: 0;
    white-space: nowrap;
  }

  .recent-remove {
    background: transparent;
    border: none;
    padding: 0.154rem;
    cursor: pointer;
    color: var(--hf-descriptionForeground);
    opacity: 0;
    transition: opacity 0.1s;
    flex-shrink: 0;
  }

  .recent-item:hover .recent-remove {
    opacity: 0.6;
  }

  .recent-remove:hover {
    opacity: 1 !important;
    color: var(--hf-foreground);
  }
</style>
