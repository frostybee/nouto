<script lang="ts">
  import { cookieJarData, cookieJars, activeCookieJarId, activeCookieJar, switchCookieJar, createCookieJar, renameCookieJar, deleteCookieJar as deleteJar, type Cookie, addCookie, updateCookie, deleteCookie, deleteCookieDomain, clearCookieJar, requestCookieJarData, requestCookieJars } from '../../stores/cookieJar';
  import { onMount } from 'svelte';

  onMount(() => {
    requestCookieJars();
    requestCookieJarData();
  });

  // Jar selector state
  let showJarDropdown = $state(false);
  let jarButtonEl: HTMLButtonElement | undefined = $state();
  let showNewJarInput = $state(false);
  let newJarName = $state('');
  let newJarInputEl: HTMLInputElement | undefined = $state();

  const jarList = $derived($cookieJars);
  const activeId = $derived($activeCookieJarId);
  const activeJar = $derived($activeCookieJar);

  function toggleJarDropdown() {
    showJarDropdown = !showJarDropdown;
    showNewJarInput = false;
  }

  function selectJar(id: string) {
    switchCookieJar(id);
    showJarDropdown = false;
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
    deleteJar(id);
  }

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

  const domains = $derived(Object.keys($cookieJarData).sort());
  const totalCookies = $derived(
    Object.values($cookieJarData).reduce((sum, arr) => sum + arr.length, 0)
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
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<svelte:window onclick={() => { showJarDropdown = false; showNewJarInput = false; }} />

<div class="cookie-jar-panel">
  <div class="panel-header">
    <div class="jar-selector-wrapper">
      <button
        bind:this={jarButtonEl}
        class="jar-select-btn"
        onclick={(e) => { e.stopPropagation(); toggleJarDropdown(); }}
      >
        <i class="codicon codicon-globe"></i>
        <span class="jar-label">{activeJar?.name ?? 'Cookie Jar'}</span>
        <svg class="jar-arrow" class:open={showJarDropdown} width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M8 10.5L2.5 5h11L8 10.5z"/></svg>
      </button>
      {#if showJarDropdown}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="jar-dropdown" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
          {#each jarList as jar}
            <div class="jar-row">
              <button
                class="jar-item"
                class:selected={activeId === jar.id}
                onclick={() => selectJar(jar.id)}
              >
                <span>{jar.name}</span>
                <span class="jar-count">{jar.cookieCount}</span>
              </button>
              {#if jarList.length > 1}
                <button
                  class="jar-delete-btn"
                  onclick={(e) => { e.stopPropagation(); handleDeleteJar(jar.id); }}
                  title="Delete jar"
                >
                  <i class="codicon codicon-trash"></i>
                </button>
              {/if}
            </div>
          {/each}
          {#if showNewJarInput}
            <div class="jar-new-input-row">
              <input
                bind:this={newJarInputEl}
                class="jar-new-input"
                bind:value={newJarName}
                placeholder="Jar name..."
                onblur={submitNewJar}
                onkeydown={handleNewJarKeydown}
              />
            </div>
          {:else}
            <button class="jar-new-btn" onclick={handleNewJar}>
              <i class="codicon codicon-add"></i>
              New Jar
            </button>
          {/if}
        </div>
      {/if}
    </div>
    <span class="cookie-count">{totalCookies} cookie{totalCookies !== 1 ? 's' : ''}</span>
    <div class="header-actions">
      <button class="action-btn" onclick={openAddForm} title="Add cookie">
        <i class="codicon codicon-add"></i>
      </button>
      <button class="action-btn" onclick={refresh} title="Refresh">
        <i class="codicon codicon-refresh"></i>
      </button>
      {#if totalCookies > 0}
        <button class="action-btn danger" onclick={handleClearAll} title="Clear all cookies">
          <i class="codicon codicon-trash"></i>
        </button>
      {/if}
    </div>
  </div>

  {#if showAddForm}
    <div class="cookie-form">
      <div class="form-title">{editingKey ? 'Edit Cookie' : 'Add Cookie'}</div>
      <div class="form-row">
        <label class="form-label">Name *</label>
        <input class="form-input" bind:value={formName} placeholder="cookie_name" />
      </div>
      <div class="form-row">
        <label class="form-label">Value</label>
        <input class="form-input" bind:value={formValue} placeholder="cookie_value" />
      </div>
      <div class="form-row">
        <label class="form-label">Domain *</label>
        <input class="form-input" bind:value={formDomain} placeholder="example.com" />
      </div>
      <div class="form-row-pair">
        <div class="form-row half">
          <label class="form-label">Path</label>
          <input class="form-input" bind:value={formPath} placeholder="/" />
        </div>
        <div class="form-row half">
          <label class="form-label">Expires</label>
          <input class="form-input" type="datetime-local" bind:value={formExpires} />
        </div>
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
        {@const cookies = $cookieJarData[domain]}
        <div class="domain-group">
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="domain-header" onclick={() => toggleDomain(domain)}>
            <i class="codicon {expandedDomains.has(domain) ? 'codicon-chevron-down' : 'codicon-chevron-right'}"></i>
            <span class="domain-name">{domain}</span>
            <span class="domain-count">{cookies.length}</span>
            <button class="domain-delete" onclick={(e) => { e.stopPropagation(); handleDeleteDomain(domain); }} title="Delete all for {domain}">
              <i class="codicon codicon-trash"></i>
            </button>
          </div>
          {#if expandedDomains.has(domain)}
            <div class="cookie-list">
              {#each cookies as cookie}
                <div class="cookie-row">
                  <div class="cookie-main">
                    <span class="cookie-name">{cookie.name}</span>
                    <span class="cookie-value" title={cookie.value}>{cookie.value}</span>
                  </div>
                  <div class="cookie-meta">
                    <span class="cookie-path" title="Path">{cookie.path}</span>
                    <span class="cookie-expiry">{formatExpiry(cookie.expires)}</span>
                    {#if cookie.httpOnly}<span class="cookie-flag">HttpOnly</span>{/if}
                    {#if cookie.secure}<span class="cookie-flag">Secure</span>{/if}
                    {#if cookie.sameSite}<span class="cookie-flag">{cookie.sameSite}</span>{/if}
                    <button class="cookie-edit" onclick={(e) => { e.stopPropagation(); openEditForm(cookie); }} title="Edit cookie">
                      <i class="codicon codicon-edit"></i>
                    </button>
                    <button class="cookie-delete" onclick={() => handleDeleteCookie(cookie)} title="Delete cookie">
                      <i class="codicon codicon-close"></i>
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .cookie-jar-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 12px 24px;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
  }

  .jar-selector-wrapper {
    position: relative;
  }

  .jar-select-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    background: transparent;
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    color: var(--hf-foreground);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
  }

  .jar-select-btn:hover {
    border-color: var(--hf-focusBorder);
  }

  .jar-select-btn .codicon {
    font-size: 13px;
    color: var(--hf-descriptionForeground);
  }

  .jar-label {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .jar-arrow {
    color: var(--hf-descriptionForeground);
    transition: transform 0.15s;
    flex-shrink: 0;
  }

  .jar-arrow.open {
    transform: rotate(180deg);
  }

  .jar-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 200px;
    background: var(--hf-dropdown-background);
    border: 1px solid var(--hf-dropdown-border);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 100;
    overflow: hidden;
  }

  .jar-row {
    display: flex;
    align-items: stretch;
  }

  .jar-item {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 12px;
    background: transparent;
    border: none;
    color: var(--hf-foreground);
    cursor: pointer;
    font-size: 12px;
    text-align: left;
  }

  .jar-item:hover {
    background: var(--hf-list-hoverBackground);
  }

  .jar-item.selected {
    background: var(--hf-list-activeSelectionBackground);
    color: var(--hf-list-activeSelectionForeground);
  }

  .jar-count {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
    background: rgba(128, 128, 128, 0.15);
    padding: 1px 6px;
    border-radius: 8px;
  }

  .jar-delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 6px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--hf-descriptionForeground);
  }

  .jar-delete-btn:hover {
    color: var(--hf-errorForeground, #f14c4c);
    background: var(--hf-list-hoverBackground);
  }

  .jar-new-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: transparent;
    border: none;
    border-top: 1px solid var(--hf-panel-border);
    color: var(--hf-textLink-foreground);
    cursor: pointer;
    font-size: 12px;
    text-align: left;
  }

  .jar-new-btn:hover {
    background: var(--hf-list-hoverBackground);
  }

  .jar-new-input-row {
    padding: 6px 8px;
    border-top: 1px solid var(--hf-panel-border);
  }

  .jar-new-input {
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

  .cookie-count {
    font-size: 11px;
    color: var(--hf-descriptionForeground);
  }

  .header-actions {
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

  /* --- Cookie Form --- */

  .cookie-form {
    padding: 12px 0;
    border-bottom: 1px solid var(--hf-panel-border);
    display: flex;
    flex-direction: column;
    gap: 8px;
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

  /* --- Existing styles --- */

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

  .empty-state :global(.codicon) {
    font-size: 24px;
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
