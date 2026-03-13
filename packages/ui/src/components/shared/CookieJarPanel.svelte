<script lang="ts">
  import { cookieJarData, cookieJars, activeCookieJarId, activeCookieJar, switchCookieJar, createCookieJar, renameCookieJar, deleteCookieJar as deleteJar, type Cookie, addCookie, updateCookie, deleteCookie, deleteCookieDomain, clearCookieJar, requestCookieJarData, requestCookieJars } from '../../stores/cookieJar.svelte';
  import { onMount } from 'svelte';
  import Tooltip from './Tooltip.svelte';

  onMount(() => {
    requestCookieJars();
    requestCookieJarData();
  });

  // Jar list state
  let showNewJarInput = $state(false);
  let newJarName = $state('');
  let newJarInputEl: HTMLInputElement | undefined = $state();
  let renamingJarId = $state<string | null>(null);
  let renameValue = $state('');
  let renameInputEl: HTMLInputElement | undefined = $state();

  const jarList = $derived(cookieJars());
  const activeId = $derived(activeCookieJarId());
  const activeJar = $derived(activeCookieJar());

  // Selected jar for viewing cookies (defaults to active jar)
  let selectedJarId = $state<string | null>(null);

  // Auto-select active jar when it changes
  $effect(() => {
    const id = activeId;
    if (id && !selectedJarId) {
      selectedJarId = id;
    }
  });

  const selectedJar = $derived(
    selectedJarId ? jarList.find(j => j.id === selectedJarId) ?? null : null
  );

  function selectJar(id: string) {
    selectedJarId = id;
    // Load cookie data for this jar
    if (id !== activeId) {
      switchCookieJar(id);
    }
    requestCookieJarData();
  }

  function handleNewJar() {
    showNewJarInput = true;
    newJarName = '';
    requestAnimationFrame(() => newJarInputEl?.focus());
  }

  function submitNewJar() {
    if (newJarName.trim()) {
      createCookieJar(newJarName.trim());
    }
    showNewJarInput = false;
    newJarName = '';
  }

  function handleNewJarKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') submitNewJar();
    if (e.key === 'Escape') { showNewJarInput = false; newJarName = ''; }
  }

  function handleDeleteJar(id: string) {
    if (jarList.length <= 1) return;
    if (selectedJarId === id) {
      selectedJarId = null;
    }
    deleteJar(id);
  }

  function startRename(jar: { id: string; name: string }) {
    renamingJarId = jar.id;
    renameValue = jar.name;
    requestAnimationFrame(() => renameInputEl?.focus());
  }

  function submitRename() {
    if (renamingJarId && renameValue.trim()) {
      renameCookieJar(renamingJarId, renameValue.trim());
    }
    renamingJarId = null;
    renameValue = '';
  }

  function handleRenameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') submitRename();
    if (e.key === 'Escape') { renamingJarId = null; renameValue = ''; }
  }

  function handleSetActive(id: string) {
    switchCookieJar(activeId === id ? id : id);
    requestCookieJarData();
  }

  // Cookie display state
  let expandedDomains = $state<Set<string>>(new Set());
  let showAddForm = $state(false);
  let editingKey = $state<string | null>(null); // "name|domain|path" composite key

  // Form state for add/edit
  let formName = $state('');
  let formValue = $state('');
  let formDomain = $state('');
  let formPath = $state('/');
  let formExpires = $state('');
  let formHttpOnly = $state(false);
  let formSecure = $state(false);
  let formSameSite = $state<'Strict' | 'Lax' | 'None' | ''>('');

  const domains = $derived(Object.keys(cookieJarData()).sort());
  const totalCookies = $derived(
    Object.values(cookieJarData()).reduce((sum, arr) => sum + arr.length, 0)
  );

  function toggleDomain(domain: string) {
    const next = new Set(expandedDomains);
    if (next.has(domain)) {
      next.delete(domain);
    } else {
      next.add(domain);
    }
    expandedDomains = next;
  }

  function handleDeleteCookie(cookie: Cookie) {
    deleteCookie(cookie.name, cookie.domain, cookie.path);
  }

  function handleDeleteDomain(domain: string) {
    deleteCookieDomain(domain);
  }

  function handleClearAll() {
    clearCookieJar();
  }

  function refresh() {
    requestCookieJarData();
  }

  function formatExpiry(expires?: number): string {
    if (!expires) return 'Session';
    const date = new Date(expires);
    if (date.getTime() < Date.now()) return 'Expired';
    return date.toLocaleString();
  }

  function resetForm() {
    formName = '';
    formValue = '';
    formDomain = '';
    formPath = '/';
    formExpires = '';
    formHttpOnly = false;
    formSecure = false;
    formSameSite = '';
  }

  function openAddForm() {
    resetForm();
    editingKey = null;
    showAddForm = true;
  }

  function openEditForm(cookie: Cookie) {
    formName = cookie.name;
    formValue = cookie.value;
    formDomain = cookie.domain;
    formPath = cookie.path;
    formExpires = cookie.expires ? new Date(cookie.expires).toISOString().slice(0, 16) : '';
    formHttpOnly = cookie.httpOnly;
    formSecure = cookie.secure;
    formSameSite = cookie.sameSite || '';
    editingKey = `${cookie.name}|${cookie.domain}|${cookie.path}`;
    showAddForm = true;
  }

  function cancelForm() {
    showAddForm = false;
    editingKey = null;
    resetForm();
  }

  function submitForm() {
    if (!formName.trim() || !formDomain.trim()) return;

    const cookieData = {
      name: formName.trim(),
      value: formValue,
      domain: formDomain.trim(),
      path: formPath || '/',
      expires: formExpires ? new Date(formExpires).getTime() : undefined,
      httpOnly: formHttpOnly,
      secure: formSecure,
      sameSite: (formSameSite || undefined) as Cookie['sameSite'],
    };

    if (editingKey) {
      const [oldName, oldDomain, oldPath] = editingKey.split('|');
      updateCookie(oldName, oldDomain, oldPath, cookieData);
    } else {
      addCookie(cookieData);
    }

    showAddForm = false;
    editingKey = null;
    resetForm();
  }

  // Resizable jar list pane
  const LIST_MIN = 160;
  const LIST_MAX = 320;
  const LIST_DEFAULT = 200;

  let listWidth = $state(LIST_DEFAULT);
  let isResizing = $state(false);
  let splitPaneEl: HTMLElement | undefined = $state();

  function handleResizeStart(e: MouseEvent) {
    e.preventDefault();
    isResizing = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(ev: MouseEvent) {
      if (!splitPaneEl) return;
      const rect = splitPaneEl.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      listWidth = Math.max(LIST_MIN, Math.min(LIST_MAX, x));
    }

    function onUp() {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function handleResizeDblClick() {
    listWidth = LIST_DEFAULT;
  }
</script>

<div class="cookie-jar-split" bind:this={splitPaneEl}>
  <!-- Left: jar list -->
  <div class="jar-list-pane" style="width: {listWidth}px; min-width: {listWidth}px;">
    <div class="pane-header">
      <span class="pane-title">Cookie Jars</span>
      <Tooltip text="New jar" position="bottom">
        <button class="icon-btn" onclick={handleNewJar} aria-label="New jar">
          <i class="codicon codicon-add"></i>
        </button>
      </Tooltip>
      <Tooltip text="Refresh" position="bottom">
        <button class="icon-btn" onclick={refresh} aria-label="Refresh">
          <i class="codicon codicon-refresh"></i>
        </button>
      </Tooltip>
    </div>

    {#if showNewJarInput}
      <div class="new-jar-row">
        <input
          bind:this={newJarInputEl}
          class="new-jar-input"
          bind:value={newJarName}
          placeholder="Jar name..."
          onblur={submitNewJar}
          onkeydown={handleNewJarKeydown}
        />
      </div>
    {/if}

    <div class="jar-items">
      {#each jarList as jar (jar.id)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="jar-item"
          class:selected={selectedJarId === jar.id}
          onclick={() => selectJar(jar.id)}
        >
          <div class="jar-item-main">
            {#if activeId === jar.id}
              <Tooltip text="Active jar" position="top"><i class="codicon codicon-check active-indicator"></i></Tooltip>
            {:else}
              <i class="codicon codicon-circle-outline inactive-indicator"></i>
            {/if}
            {#if renamingJarId === jar.id}
              <input
                bind:this={renameInputEl}
                class="jar-rename-input"
                bind:value={renameValue}
                onblur={submitRename}
                onkeydown={handleRenameKeydown}
                onclick={(e) => e.stopPropagation()}
              />
            {:else}
              <span class="jar-item-name">{jar.name}</span>
            {/if}
            <span class="jar-item-count">{jar.cookieCount}</span>
          </div>
          <div class="jar-item-actions">
            {#if activeId !== jar.id}
              <Tooltip text="Set as active" position="top">
                <button
                  class="item-btn"
                  aria-label="Set as active"
                  onclick={(e) => { e.stopPropagation(); handleSetActive(jar.id); }}
                >
                  <i class="codicon codicon-circle-outline"></i>
                </button>
              </Tooltip>
            {/if}
            <Tooltip text="Rename" position="top">
              <button
                class="item-btn"
                aria-label="Rename"
                onclick={(e) => { e.stopPropagation(); startRename(jar); }}
              >
                <i class="codicon codicon-edit"></i>
              </button>
            </Tooltip>
            {#if jarList.length > 1}
              <Tooltip text="Delete" position="top">
                <button
                  class="item-btn danger"
                  aria-label="Delete"
                  onclick={(e) => { e.stopPropagation(); handleDeleteJar(jar.id); }}
                >
                  <i class="codicon codicon-trash"></i>
                </button>
              </Tooltip>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    {#if jarList.length === 0}
      <div class="empty-list">
        <p>No cookie jars</p>
        <button class="create-btn" onclick={handleNewJar}>Create Jar</button>
      </div>
    {/if}
  </div>

  <!-- Resize handle -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="list-resize-handle"
    class:active={isResizing}
    onmousedown={handleResizeStart}
    ondblclick={handleResizeDblClick}
    role="separator"
    tabindex="0"
    aria-orientation="vertical"
  ></div>

  <!-- Right: cookie content -->
  <div class="cookie-content-pane">
    {#if selectedJar}
      <div class="content-header-bar">
        <i class="codicon codicon-globe"></i>
        <span class="content-jar-name">{selectedJar.name}</span>
        <span class="content-cookie-count">{totalCookies} cookie{totalCookies !== 1 ? 's' : ''}</span>
        <div class="content-actions">
          <Tooltip text="Add cookie" position="bottom">
            <button class="action-btn" onclick={openAddForm} aria-label="Add cookie">
              <i class="codicon codicon-add"></i>
            </button>
          </Tooltip>
          <Tooltip text="Refresh" position="bottom">
            <button class="action-btn" onclick={refresh} aria-label="Refresh">
              <i class="codicon codicon-refresh"></i>
            </button>
          </Tooltip>
          {#if totalCookies > 0}
            <Tooltip text="Clear all cookies" position="bottom">
              <button class="action-btn danger" onclick={handleClearAll} aria-label="Clear all cookies">
                <i class="codicon codicon-trash"></i>
              </button>
            </Tooltip>
          {/if}
        </div>
      </div>

      {#if showAddForm}
        <div class="cookie-form">
          <div class="form-title">{editingKey ? 'Edit Cookie' : 'Add Cookie'}</div>
          <label class="form-row">
            <span class="form-label">Name *</span>
            <input class="form-input" bind:value={formName} placeholder="cookie_name" />
          </label>
          <label class="form-row">
            <span class="form-label">Value</span>
            <input class="form-input" bind:value={formValue} placeholder="cookie_value" />
          </label>
          <label class="form-row">
            <span class="form-label">Domain *</span>
            <input class="form-input" bind:value={formDomain} placeholder="example.com" />
          </label>
          <div class="form-row-pair">
            <label class="form-row half">
              <span class="form-label">Path</span>
              <input class="form-input" bind:value={formPath} placeholder="/" />
            </label>
            <label class="form-row half">
              <span class="form-label">Expires</span>
              <input class="form-input" type="datetime-local" bind:value={formExpires} />
            </label>
          </div>
          <div class="form-row-inline">
            <label class="form-checkbox">
              <input type="checkbox" bind:checked={formHttpOnly} />
              HttpOnly
            </label>
            <label class="form-checkbox">
              <input type="checkbox" bind:checked={formSecure} />
              Secure
            </label>
            <select class="form-select" bind:value={formSameSite}>
              <option value="">SameSite...</option>
              <option value="Strict">Strict</option>
              <option value="Lax">Lax</option>
              <option value="None">None</option>
            </select>
          </div>
          <div class="form-actions">
            <button class="form-btn cancel" onclick={cancelForm}>Cancel</button>
            <button class="form-btn save" onclick={submitForm} disabled={!formName.trim() || !formDomain.trim()}>
              {editingKey ? 'Update' : 'Add'}
            </button>
          </div>
        </div>
      {/if}

      {#if domains.length === 0 && !showAddForm}
        <div class="empty-state">
          <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor" style="opacity: 0.6">
            <path d="M13.5 5C13.5 4.4 13 4 12.5 4H11.7C11.9 3.4 12 2.7 12 2c0-.6-.4-1-1-1H5c-.6 0-1 .4-1 1 0 .7.1 1.4.3 2H3.5C3 4 2.5 4.4 2.5 5v8.5c0 .8.7 1.5 1.5 1.5h8c.8 0 1.5-.7 1.5-1.5V5zM5 2h6c0 .5-.1 1-.2 1.4-.1.2-.1.4-.2.6H5.4c-.1-.2-.2-.4-.2-.6C5.1 3 5 2.5 5 2zm6.5 11.5c0 .3-.2.5-.5.5H5c-.3 0-.5-.2-.5-.5V5h7v8.5z"/>
            <circle cx="6" cy="8" r="0.8"/>
            <circle cx="8.5" cy="10" r="0.8"/>
            <circle cx="10" cy="7.5" r="0.8"/>
          </svg>
          <p>No cookies stored</p>
          <p class="empty-hint">Cookies from responses will appear here automatically.</p>
        </div>
      {:else}
        <div class="domain-list">
          {#each domains as domain}
            {@const cookies = cookieJarData()[domain]}
            <div class="domain-group">
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="domain-header" onclick={() => toggleDomain(domain)}>
                <i class="codicon {expandedDomains.has(domain) ? 'codicon-chevron-down' : 'codicon-chevron-right'}"></i>
                <span class="domain-name">{domain}</span>
                <span class="domain-count">{cookies.length}</span>
                <Tooltip text="Delete all for {domain}" position="top">
                  <button class="domain-delete" onclick={(e) => { e.stopPropagation(); handleDeleteDomain(domain); }} aria-label="Delete all for {domain}">
                    <i class="codicon codicon-trash"></i>
                  </button>
                </Tooltip>
              </div>
              {#if expandedDomains.has(domain)}
                <div class="cookie-list">
                  {#each cookies as cookie}
                    <div class="cookie-row">
                      <div class="cookie-main">
                        <span class="cookie-name">{cookie.name}</span>
                        <Tooltip text={cookie.value} position="top"><span class="cookie-value">{cookie.value}</span></Tooltip>
                      </div>
                      <div class="cookie-meta">
                        <Tooltip text="Path" position="top"><span class="cookie-path">{cookie.path}</span></Tooltip>
                        <span class="cookie-expiry">{formatExpiry(cookie.expires)}</span>
                        {#if cookie.httpOnly}<span class="cookie-flag">HttpOnly</span>{/if}
                        {#if cookie.secure}<span class="cookie-flag">Secure</span>{/if}
                        {#if cookie.sameSite}<span class="cookie-flag">{cookie.sameSite}</span>{/if}
                        <Tooltip text="Edit cookie" position="top">
                          <button class="cookie-edit" onclick={(e) => { e.stopPropagation(); openEditForm(cookie); }} aria-label="Edit cookie">
                            <i class="codicon codicon-edit"></i>
                          </button>
                        </Tooltip>
                        <Tooltip text="Delete cookie" position="top">
                          <button class="cookie-delete" onclick={() => handleDeleteCookie(cookie)} aria-label="Delete cookie">
                            <i class="codicon codicon-close"></i>
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {:else}
      <div class="no-selection">
        <i class="codicon codicon-globe" style="font-size: 40px; opacity: 0.3;"></i>
        <p>Select a cookie jar to view its cookies</p>
      </div>
    {/if}
  </div>
</div>

<style>
  /* Split layout */
  .cookie-jar-split {
    display: flex;
    flex-direction: row;
    height: 100%;
    overflow: hidden;
  }

  /* Left: jar list pane */
  .jar-list-pane {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    flex-shrink: 0;
  }

  .pane-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid var(--hf-panel-border);
    background: var(--hf-sideBarSectionHeader-background);
    flex-shrink: 0;
  }

  .pane-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--hf-sideBarSectionHeader-foreground);
    opacity: 0.8;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    background: transparent;
    border: none;
    color: var(--hf-foreground);
    cursor: pointer;
    border-radius: 3px;
    font-size: 14px;
    opacity: 0.7;
  }

  .icon-btn:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
  }

  .new-jar-row {
    padding: 6px 8px;
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .new-jar-input {
    width: 100%;
    padding: 4px 8px;
    background: var(--hf-input-background);
    color: var(--hf-foreground);
    border: 1px solid var(--hf-focusBorder);
    border-radius: 3px;
    font-size: 12px;
    outline: none;
    box-sizing: border-box;
  }

  .jar-items {
    flex: 1;
    overflow-y: auto;
  }

  .jar-item {
    display: flex;
    align-items: center;
    padding: 0 12px;
    height: 36px;
    cursor: pointer;
    border-bottom: 1px solid transparent;
    transition: background 0.1s;
    gap: 4px;
  }

  .jar-item:hover {
    background: var(--hf-list-hoverBackground);
  }

  .jar-item.selected {
    background: var(--hf-list-activeSelectionBackground);
    color: var(--hf-list-activeSelectionForeground);
  }

  .jar-item-main {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    min-width: 0;
  }

  .active-indicator {
    color: var(--hf-charts-green, #49cc90);
    font-size: 12px;
    flex-shrink: 0;
  }

  .inactive-indicator {
    font-size: 12px;
    opacity: 0.2;
    flex-shrink: 0;
  }

  .jar-item-name {
    flex: 1;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .jar-item-count {
    font-size: 10px;
    padding: 1px 5px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    border-radius: 8px;
    flex-shrink: 0;
  }

  .jar-item-actions {
    display: none;
    gap: 2px;
    flex-shrink: 0;
  }

  .jar-item:hover .jar-item-actions,
  .jar-item.selected .jar-item-actions {
    display: flex;
  }

  .jar-rename-input {
    flex: 1;
    padding: 2px 6px;
    background: var(--hf-input-background);
    color: var(--hf-foreground);
    border: 1px solid var(--hf-focusBorder);
    border-radius: 3px;
    font-size: 12px;
    outline: none;
    min-width: 0;
  }

  .item-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    background: transparent;
    border: none;
    color: var(--hf-foreground);
    cursor: pointer;
    border-radius: 3px;
    font-size: 12px;
    opacity: 0.6;
  }

  .item-btn:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
  }

  .item-btn.danger:hover {
    color: var(--hf-errorForeground, #f44336);
  }

  .empty-list {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 20px;
    gap: 12px;
    text-align: center;
    font-size: 12px;
    color: var(--hf-descriptionForeground);
  }

  .create-btn {
    padding: 6px 14px;
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }

  .create-btn:hover {
    background: var(--hf-button-hoverBackground);
  }

  /* Resize handle */
  .list-resize-handle {
    width: 4px;
    flex-shrink: 0;
    cursor: col-resize;
    background: var(--hf-panel-border);
    transition: background 0.15s;
    z-index: 10;
  }

  .list-resize-handle:hover,
  .list-resize-handle.active {
    background: var(--hf-focusBorder);
  }

  /* Right: cookie content pane */
  .cookie-content-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  .content-header-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--hf-panel-border);
    background: var(--hf-sideBarSectionHeader-background);
    flex-shrink: 0;
  }

  .content-header-bar .codicon {
    font-size: 14px;
    opacity: 0.7;
  }

  .content-jar-name {
    font-size: 13px;
    font-weight: 600;
  }

  .content-cookie-count {
    font-size: 11px;
    color: var(--hf-descriptionForeground);
  }

  .content-actions {
    margin-left: auto;
    display: flex;
    gap: 4px;
  }

  .action-btn {
    padding: 2px 6px;
    background: transparent;
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 3px;
    color: var(--hf-foreground);
    cursor: pointer;
    font-size: 13px;
  }

  .action-btn:hover {
    background: var(--hf-list-hoverBackground);
  }

  .action-btn.danger:hover {
    color: var(--hf-errorForeground, #f44336);
  }

  .no-selection {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--hf-descriptionForeground);
    font-size: 13px;
    text-align: center;
    padding: 24px;
  }

  /* --- Cookie Form --- */

  .cookie-form {
    padding: 12px 16px;
    border-bottom: 1px solid var(--hf-panel-border);
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
  }

  .form-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--hf-descriptionForeground);
  }

  .form-row {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .form-row-pair {
    display: flex;
    gap: 8px;
  }

  .form-row.half {
    flex: 1;
  }

  .form-label {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .form-input {
    padding: 4px 8px;
    background: var(--hf-input-background);
    color: var(--hf-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 3px;
    font-size: 12px;
    font-family: var(--hf-editor-font-family), monospace;
    outline: none;
  }

  .form-input:focus {
    border-color: var(--hf-focusBorder);
  }

  .form-row-inline {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .form-checkbox {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--hf-foreground);
    cursor: pointer;
  }

  .form-checkbox input {
    cursor: pointer;
  }

  .form-select {
    padding: 3px 6px;
    background: var(--hf-input-background);
    color: var(--hf-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 3px;
    font-size: 11px;
    outline: none;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .form-btn {
    padding: 4px 12px;
    border: none;
    border-radius: 3px;
    font-size: 11px;
    cursor: pointer;
  }

  .form-btn.cancel {
    background: transparent;
    color: var(--hf-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
  }

  .form-btn.cancel:hover {
    background: var(--hf-list-hoverBackground);
  }

  .form-btn.save {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
  }

  .form-btn.save:hover:not(:disabled) {
    opacity: 0.9;
  }

  .form-btn.save:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* --- Cookie display --- */

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 32px 16px;
    color: var(--hf-descriptionForeground);
    text-align: center;
  }

  .empty-state p {
    margin: 0;
    font-size: 13px;
  }

  .empty-hint {
    font-size: 11px !important;
    opacity: 0.7;
  }

  .domain-list {
    flex: 1;
    overflow-y: auto;
    padding: 0 16px;
  }

  .domain-group {
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .domain-header {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 4px;
    background: transparent;
    border: none;
    color: var(--hf-foreground);
    cursor: pointer;
    font-size: 12px;
    text-align: left;
  }

  .domain-header:hover {
    background: var(--hf-list-hoverBackground);
  }

  .domain-name {
    font-weight: 600;
    flex: 1;
  }

  .domain-count {
    font-size: 10px;
    padding: 1px 6px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    border-radius: 8px;
  }

  .domain-delete {
    padding: 2px 4px;
    background: transparent;
    border: none;
    color: var(--hf-descriptionForeground);
    cursor: pointer;
    font-size: 12px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .domain-header:hover .domain-delete {
    opacity: 1;
  }

  .domain-delete:hover {
    color: var(--hf-errorForeground, #f44336);
  }

  .cookie-list {
    padding: 0 0 4px 20px;
  }

  .cookie-row {
    padding: 4px 6px;
    border-radius: 3px;
    margin-bottom: 2px;
  }

  .cookie-row:hover {
    background: var(--hf-list-hoverBackground);
  }

  .cookie-main {
    display: flex;
    gap: 8px;
    align-items: baseline;
  }

  .cookie-name {
    font-weight: 600;
    font-size: 12px;
    font-family: var(--hf-editor-font-family), monospace;
    color: var(--hf-symbolIcon-propertyForeground, #9cdcfe);
  }

  .cookie-value {
    font-size: 11px;
    font-family: var(--hf-editor-font-family), monospace;
    color: var(--hf-descriptionForeground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }

  .cookie-meta {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-top: 2px;
  }

  .cookie-path, .cookie-expiry {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
  }

  .cookie-flag {
    font-size: 9px;
    padding: 1px 4px;
    background: rgba(128, 128, 128, 0.15);
    border-radius: 3px;
    color: var(--hf-descriptionForeground);
  }

  .cookie-edit,
  .cookie-delete {
    margin-left: auto;
    padding: 1px 3px;
    background: transparent;
    border: none;
    color: var(--hf-descriptionForeground);
    cursor: pointer;
    font-size: 11px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .cookie-edit {
    margin-left: auto;
  }

  .cookie-delete {
    margin-left: 0;
  }

  .cookie-row:hover .cookie-edit,
  .cookie-row:hover .cookie-delete {
    opacity: 1;
  }

  .cookie-edit:hover {
    color: var(--hf-foreground);
  }

  .cookie-delete:hover {
    color: var(--hf-errorForeground, #f44336);
  }
</style>
