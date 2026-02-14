<script lang="ts">
  import { cookieJarData, type Cookie } from '../../stores/cookieJar';
  import { postMessage } from '../../lib/vscode';

  let expandedDomains = $state<Set<string>>(new Set());

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

  function deleteCookie(cookie: Cookie) {
    postMessage({ type: 'deleteCookie', data: { name: cookie.name, domain: cookie.domain, path: cookie.path } });
  }

  function deleteDomain(domain: string) {
    postMessage({ type: 'deleteCookieDomain', data: { domain } });
  }

  function clearAll() {
    postMessage({ type: 'clearCookieJar' });
  }

  function refresh() {
    postMessage({ type: 'getCookieJar' });
  }

  function formatExpiry(expires?: number): string {
    if (!expires) return 'Session';
    const date = new Date(expires);
    if (date.getTime() < Date.now()) return 'Expired';
    return date.toLocaleString();
  }
</script>

<div class="cookie-jar-panel">
  <div class="panel-header">
    <span class="panel-title">Cookie Jar</span>
    <span class="cookie-count">{totalCookies} cookie{totalCookies !== 1 ? 's' : ''}</span>
    <div class="header-actions">
      <button class="action-btn" onclick={refresh} title="Refresh">
        <i class="codicon codicon-refresh"></i>
      </button>
      {#if totalCookies > 0}
        <button class="action-btn danger" onclick={clearAll} title="Clear all cookies">
          <i class="codicon codicon-trash"></i>
        </button>
      {/if}
    </div>
  </div>

  {#if domains.length === 0}
    <div class="empty-state">
      <i class="codicon codicon-globe"></i>
      <p>No cookies stored</p>
      <p class="empty-hint">Cookies from responses will appear here automatically.</p>
    </div>
  {:else}
    <div class="domain-list">
      {#each domains as domain}
        {@const cookies = $cookieJarData[domain]}
        <div class="domain-group">
          <button class="domain-header" onclick={() => toggleDomain(domain)}>
            <i class="codicon {expandedDomains.has(domain) ? 'codicon-chevron-down' : 'codicon-chevron-right'}"></i>
            <span class="domain-name">{domain}</span>
            <span class="domain-count">{cookies.length}</span>
            <button class="domain-delete" onclick|stopPropagation={() => deleteDomain(domain)} title="Delete all for {domain}">
              <i class="codicon codicon-trash"></i>
            </button>
          </button>
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
                    <button class="cookie-delete" onclick={() => deleteCookie(cookie)} title="Delete cookie">
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
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
  }

  .panel-title {
    font-weight: 600;
    font-size: 12px;
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

  .empty-state .codicon {
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

  .cookie-row:hover .cookie-delete {
    opacity: 1;
  }

  .cookie-delete:hover {
    color: var(--hf-errorForeground, #f44336);
  }
</style>
