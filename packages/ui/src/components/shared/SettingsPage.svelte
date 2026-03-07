<script lang="ts">
  import { settings, updateShortcut, resetShortcut, resetAllShortcuts } from '../../stores/settings';
  import { resolvedShortcuts } from '../../stores/settings';
  import type { MinimapMode, StorageMode, CollectionMode, CollectionFormat, GlobalProxyConfig } from '../../stores/settings';
  import {
    SHORTCUT_DEFINITIONS,
    eventToBinding,
    bindingToDisplayString,
    detectConflicts,
    type ShortcutAction,
    type ShortcutBinding,
  } from '../../lib/shortcuts';
  import { postMessage } from '../../lib/vscode';

  interface Props {
    onclose: () => void;
  }
  let { onclose }: Props = $props();

  type SettingsSection = 'general' | 'shortcuts';

  let activeSection = $state<SettingsSection>('general');
  let recordingId = $state<ShortcutAction | null>(null);

  const currentSettings = $derived($settings);
  const shortcuts = $derived($resolvedShortcuts);
  const conflicts = $derived(detectConflicts(shortcuts));

  function getDisplayString(id: ShortcutAction): string {
    const binding = shortcuts.get(id);
    return binding ? bindingToDisplayString(binding) : '';
  }

  function isOverridden(id: ShortcutAction): boolean {
    return id in currentSettings.shortcuts;
  }

  function startRecording(id: ShortcutAction) {
    recordingId = id;
  }

  function handleRecordKeydown(event: KeyboardEvent) {
    if (recordingId === null) return;

    event.preventDefault();
    event.stopPropagation();

    const binding = eventToBinding(event);
    if (!binding) return; // modifier-only press, keep recording

    updateShortcut(recordingId, binding);
    recordingId = null;
  }

  function handleRecordBlur() {
    recordingId = null;
  }

  function handleToggleAutoCorrect() {
    const next = { ...currentSettings, autoCorrectUrls: !currentSettings.autoCorrectUrls };
    settings.set(next);
    postMessage({ type: 'updateSettings', data: next });
  }

  function handleMinimapChange(value: string) {
    const next = { ...currentSettings, minimap: value as MinimapMode };
    settings.set(next);
    postMessage({ type: 'updateSettings', data: next });
  }

  function handleToggleSaveResponseBody() {
    const next = { ...currentSettings, saveResponseBody: !currentSettings.saveResponseBody };
    settings.set(next);
    postMessage({ type: 'updateSettings', data: next });
  }

  function handleToggleSslRejectUnauthorized() {
    const next = { ...currentSettings, sslRejectUnauthorized: !currentSettings.sslRejectUnauthorized };
    settings.set(next);
    postMessage({ type: 'updateSettings', data: next });
  }

  function handleStorageModeChange(value: string) {
    const next = { ...currentSettings, storageMode: value as StorageMode };
    settings.set(next);
    postMessage({ type: 'updateSettings', data: next });
  }

  function handleCollectionModeChange(value: string) {
    const next = { ...currentSettings, collectionMode: value as CollectionMode };
    settings.set(next);
    postMessage({ type: 'updateSettings', data: next });
  }

  function handleCollectionFormatChange(value: string) {
    const next = { ...currentSettings, collectionFormat: value as CollectionFormat };
    settings.set(next);
    postMessage({ type: 'updateSettings', data: next });
  }

  const defaultGlobalProxy: GlobalProxyConfig = { enabled: false, protocol: 'http', host: '', port: 8080 };
  const globalProxy = $derived(currentSettings.globalProxy ?? defaultGlobalProxy);

  function updateGlobalProxy(patch: Partial<GlobalProxyConfig>) {
    const updated = { ...globalProxy, ...patch };
    const next = { ...currentSettings, globalProxy: updated };
    settings.set(next);
    postMessage({ type: 'updateSettings', data: next });
  }

  function hasConflict(id: ShortcutAction): boolean {
    return conflicts.some(([a, b]) => a === id || b === id);
  }

  function parseDisplayParts(displayStr: string): string[] {
    return displayStr.split('+');
  }
</script>

<div class="settings-page">
  <div class="settings-header">
    <button class="back-btn" onclick={onclose} aria-label="Back">
      <i class="codicon codicon-arrow-left"></i>
    </button>
    <span class="settings-title">Settings</span>
  </div>

  <div class="settings-body">
    <nav class="settings-nav">
      <button
        class="nav-item"
        class:active={activeSection === 'general'}
        onclick={() => activeSection = 'general'}
      >
        <i class="codicon codicon-gear"></i>
        General
      </button>
      <button
        class="nav-item"
        class:active={activeSection === 'shortcuts'}
        onclick={() => activeSection = 'shortcuts'}
      >
        <i class="codicon codicon-keyboard"></i>
        Shortcuts
      </button>
    </nav>

    <div class="settings-content">
      {#if activeSection === 'general'}
        <div class="section">
          <h3 class="section-title">General</h3>
          <div class="setting-row">
            <span class="setting-label">
              Auto-correct URLs
              <span class="setting-description">Automatically fix malformed URLs instead of showing suggestions</span>
            </span>
            <label class="toggle-control">
              <input
                type="checkbox"
                checked={currentSettings.autoCorrectUrls}
                onchange={handleToggleAutoCorrect}
              />
              <span class="toggle-slider"></span>
            </label>
          </div>

          <label class="setting-row select-row">
            <span class="setting-label">
              Minimap
              <span class="setting-description">
                Controls when to show the minimap in response viewers
              </span>
            </span>
            <select
              value={currentSettings.minimap}
              onchange={(e) => handleMinimapChange(e.currentTarget.value)}
            >
              <option value="auto">Auto (show for large documents)</option>
              <option value="always">Always</option>
              <option value="never">Never</option>
            </select>
          </label>

          <div class="setting-row">
            <span class="setting-label">
              Save Response Bodies
              <span class="setting-description">Save response bodies in request history. Disable to reduce disk usage. Deep search requires this to be enabled.</span>
            </span>
            <label class="toggle-control">
              <input
                type="checkbox"
                checked={currentSettings.saveResponseBody}
                onchange={handleToggleSaveResponseBody}
              />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>

        <div class="section">
          <h3 class="section-title">SSL / TLS</h3>
          <div class="setting-row">
            <span class="setting-label">
              Verify SSL Certificates
              <span class="setting-description">Global SSL/TLS certificate verification. Disable to accept self-signed or invalid certificates. Per-request SSL settings override this value.</span>
            </span>
            <label class="toggle-control">
              <input
                type="checkbox"
                checked={currentSettings.sslRejectUnauthorized}
                onchange={handleToggleSslRejectUnauthorized}
              />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>

        <div class="section">
          <h3 class="section-title">Proxy</h3>
          <div class="setting-row">
            <span class="setting-label">
              Enable Global Proxy
              <span class="setting-description">Route all requests through a proxy server. Per-request proxy settings override this.</span>
            </span>
            <label class="toggle-control">
              <input
                type="checkbox"
                checked={globalProxy.enabled}
                onchange={() => updateGlobalProxy({ enabled: !globalProxy.enabled })}
              />
              <span class="toggle-slider"></span>
            </label>
          </div>

          {#if globalProxy.enabled}
            <div class="proxy-form">
              <div class="proxy-row">
                <label class="proxy-field proxy-protocol">
                  <span class="proxy-field-label">Protocol</span>
                  <select
                    value={globalProxy.protocol}
                    onchange={(e) => updateGlobalProxy({ protocol: e.currentTarget.value as GlobalProxyConfig['protocol'] })}
                  >
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                    <option value="socks5">SOCKS5</option>
                  </select>
                </label>

                <label class="proxy-field proxy-host">
                  <span class="proxy-field-label">Host</span>
                  <input
                    type="text"
                    placeholder="127.0.0.1"
                    value={globalProxy.host}
                    oninput={(e) => updateGlobalProxy({ host: e.currentTarget.value })}
                  />
                </label>

                <label class="proxy-field proxy-port">
                  <span class="proxy-field-label">Port</span>
                  <input
                    type="number"
                    placeholder="8080"
                    value={globalProxy.port}
                    oninput={(e) => updateGlobalProxy({ port: parseInt(e.currentTarget.value, 10) || 0 })}
                  />
                </label>
              </div>

              <div class="proxy-row">
                <label class="proxy-field">
                  <span class="proxy-field-label">Username <span class="setting-description">(optional)</span></span>
                  <input
                    type="text"
                    placeholder="Username"
                    value={globalProxy.username || ''}
                    oninput={(e) => updateGlobalProxy({ username: e.currentTarget.value || undefined })}
                  />
                </label>

                <label class="proxy-field">
                  <span class="proxy-field-label">Password <span class="setting-description">(optional)</span></span>
                  <input
                    type="password"
                    placeholder="Password"
                    value={globalProxy.password || ''}
                    oninput={(e) => updateGlobalProxy({ password: e.currentTarget.value || undefined })}
                  />
                </label>
              </div>

              <label class="proxy-field">
                <span class="proxy-field-label">No Proxy <span class="setting-description">(comma-separated hostnames to bypass)</span></span>
                <input
                  type="text"
                  placeholder="localhost, 127.0.0.1, *.internal.corp"
                  value={globalProxy.noProxy || ''}
                  oninput={(e) => updateGlobalProxy({ noProxy: e.currentTarget.value || undefined })}
                />
              </label>
            </div>
          {/if}
        </div>

        <div class="section">
          <h3 class="section-title">Storage</h3>

          <label class="setting-row select-row">
            <span class="setting-label">
              Storage Mode
              <span class="setting-description">Monolithic stores all collections in one file. Git-friendly stores each collection as a separate file for better merge conflict resolution.</span>
            </span>
            <select
              value={currentSettings.storageMode}
              onchange={(e) => handleStorageModeChange(e.currentTarget.value)}
            >
              <option value="monolithic">Monolithic</option>
              <option value="git-friendly">Git-friendly</option>
            </select>
          </label>

          <label class="setting-row select-row">
            <span class="setting-label">
              Collection Location
              <span class="setting-description">Where to store collections. Global uses extension storage. Workspace stores in .hivefetch/ in workspace root (version-controllable). Both merges both sources.</span>
            </span>
            <select
              value={currentSettings.collectionMode}
              onchange={(e) => handleCollectionModeChange(e.currentTarget.value)}
            >
              <option value="global">Global</option>
              <option value="workspace">Workspace</option>
              <option value="both">Both (merged)</option>
            </select>
          </label>

          <label class="setting-row select-row">
            <span class="setting-label">
              Collection Format
              <span class="setting-description">File format for workspace-scoped collections. YAML is more human-readable and diff-friendly. Only applies when Collection Location is Workspace or Both.</span>
            </span>
            <select
              value={currentSettings.collectionFormat}
              onchange={(e) => handleCollectionFormatChange(e.currentTarget.value)}
            >
              <option value="json">JSON</option>
              <option value="yaml">YAML</option>
            </select>
          </label>
        </div>

        <div class="section">
          <h3 class="section-title">Environments</h3>
          <div class="setting-row">
            <span class="setting-label">
              Environment Variables
              <span class="setting-description">Environments and the active environment are managed in the Variables tab in the sidebar.</span>
            </span>
            <button class="link-btn" onclick={onclose}>Open Variables Tab</button>
          </div>
        </div>
      {:else if activeSection === 'shortcuts'}
        <div class="section">
          <h3 class="section-title">Keyboard Shortcuts</h3>

          {#if conflicts.length > 0}
            <div class="conflict-banner">
              <i class="codicon codicon-warning"></i>
              Some shortcuts share the same key binding. This may cause unexpected behavior.
            </div>
          {/if}

          <table class="shortcuts-table">
            <thead>
              <tr>
                <th>Scope</th>
                <th>Action</th>
                <th>Shortcut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each SHORTCUT_DEFINITIONS as def}
                <tr class:conflict={hasConflict(def.id)}>
                  <td class="scope-cell">{def.scope}</td>
                  <td class="action-cell">{def.label}</td>
                  <td class="shortcut-cell">
                    {#if recordingId === def.id}
                      <!-- svelte-ignore a11y_autofocus -->
                      <button
                        class="shortcut-badge recording"
                        onkeydown={handleRecordKeydown}
                        onblur={handleRecordBlur}
                        autofocus
                      >
                        Press keys...
                      </button>
                    {:else}
                      <button
                        class="shortcut-badge"
                        class:overridden={isOverridden(def.id)}
                        onclick={() => startRecording(def.id)}
                        title="Click to change shortcut"
                      >
                        {#each parseDisplayParts(getDisplayString(def.id)) as part, i}
                          {#if i > 0}<span class="key-sep">+</span>{/if}
                          <kbd>{part}</kbd>
                        {/each}
                      </button>
                    {/if}
                  </td>
                  <td class="reset-cell">
                    {#if isOverridden(def.id)}
                      <button
                        class="reset-btn"
                        onclick={() => resetShortcut(def.id)}
                        title="Reset to default"
                      >
                        <i class="codicon codicon-discard"></i>
                      </button>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>

          <button class="reset-all-btn" onclick={resetAllShortcuts}>
            Reset All to Defaults
          </button>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .settings-page {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
    background: var(--hf-editor-background);
  }

  .settings-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--hf-panel-border);
    background: var(--hf-editor-background);
  }

  .back-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--hf-foreground);
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 0.15s, background 0.15s;
  }

  .back-btn:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
  }

  .settings-title {
    font-weight: 600;
    font-size: 14px;
    color: var(--hf-foreground);
  }

  .settings-body {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .settings-nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 6px;
    width: 160px;
    min-width: 160px;
    background: var(--hf-sideBar-background, var(--hf-editor-background));
    border-right: 1px solid var(--hf-panel-border);
    overflow-y: auto;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--hf-foreground);
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    opacity: 0.75;
    transition: opacity 0.15s, background 0.15s;
  }

  .nav-item:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
  }

  .nav-item.active {
    opacity: 1;
    background: var(--hf-list-activeSelectionBackground);
    color: var(--hf-list-activeSelectionForeground);
  }

  .nav-item .codicon {
    font-size: 14px;
  }

  .settings-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px 24px;
  }

  .section-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--hf-foreground);
    margin: 0 0 16px;
  }

  .setting-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 0;
  }

  .toggle-control {
    display: flex;
    align-items: center;
    cursor: pointer;
    user-select: none;
  }

  .toggle-control input[type="checkbox"] {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-slider {
    position: relative;
    display: inline-block;
    width: 28px;
    height: 14px;
    background: var(--hf-input-background);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 7px;
    transition: background 0.2s, border-color 0.2s;
  }

  .toggle-slider::after {
    content: '';
    position: absolute;
    top: 1px;
    left: 1px;
    width: 10px;
    height: 10px;
    background: var(--hf-foreground);
    border-radius: 50%;
    transition: transform 0.2s;
    opacity: 0.5;
  }

  .toggle-control input:checked + .toggle-slider {
    background: var(--hf-focusBorder);
    border-color: var(--hf-focusBorder);
  }

  .toggle-control input:checked + .toggle-slider::after {
    transform: translateX(14px);
    opacity: 1;
    background: var(--hf-editor-background);
  }

  .setting-label {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 13px;
    color: var(--hf-foreground);
  }

  .setting-description {
    font-size: 12px;
    color: var(--hf-descriptionForeground);
  }

  .conflict-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    margin-bottom: 14px;
    background: var(--hf-inputValidation-warningBackground, rgba(204, 167, 0, 0.1));
    border: 1px solid var(--hf-editorWarning-foreground, #cca700);
    border-radius: 4px;
    font-size: 12px;
    color: var(--hf-editorWarning-foreground, #cca700);
  }

  .shortcuts-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .shortcuts-table th {
    text-align: left;
    padding: 8px 10px;
    font-weight: 500;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--hf-descriptionForeground);
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .shortcuts-table td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--hf-panel-border, rgba(128, 128, 128, 0.12));
  }

  .shortcuts-table tr.conflict td {
    background: var(--hf-inputValidation-warningBackground, rgba(204, 167, 0, 0.06));
  }

  .scope-cell {
    color: var(--hf-descriptionForeground);
    width: 80px;
  }

  .action-cell {
    color: var(--hf-foreground);
  }

  .shortcut-cell {
    width: 200px;
  }

  .reset-cell {
    width: 40px;
    text-align: center;
  }

  .shortcut-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: var(--hf-keybindingLabel-background, rgba(128, 128, 128, 0.17));
    border: 1px solid var(--hf-widget-border, #454545);
    border-radius: 4px;
    color: var(--hf-keybindingLabel-foreground, var(--hf-foreground));
    cursor: pointer;
    font-size: 12px;
    transition: border-color 0.15s, background 0.15s;
  }

  .shortcut-badge:hover {
    border-color: var(--hf-focusBorder);
  }

  .shortcut-badge.overridden {
    border-color: var(--hf-charts-blue, #007acc);
  }

  .shortcut-badge.recording {
    border-color: var(--hf-focusBorder);
    animation: pulse-border 1s ease-in-out infinite;
    font-style: italic;
    color: var(--hf-descriptionForeground);
  }

  @keyframes pulse-border {
    0%, 100% { border-color: var(--hf-focusBorder); }
    50% { border-color: transparent; }
  }

  .shortcut-badge kbd {
    font-family: var(--hf-editor-font-family, monospace);
    font-size: 11px;
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--hf-keybindingLabel-background, rgba(128, 128, 128, 0.17));
    border: 1px solid var(--hf-widget-border, #454545);
    box-shadow: inset 0 -1px 0 var(--hf-widget-shadow, rgba(0, 0, 0, 0.16));
    min-width: 18px;
    text-align: center;
  }

  .key-sep {
    color: var(--hf-descriptionForeground);
    font-size: 10px;
  }

  .reset-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--hf-foreground);
    cursor: pointer;
    opacity: 0.5;
    transition: opacity 0.15s, background 0.15s;
  }

  .reset-btn:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
  }

  .reset-all-btn {
    margin-top: 16px;
    padding: 6px 14px;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .reset-all-btn:hover {
    background: var(--hf-button-secondaryHoverBackground);
  }

  .select-row {
    justify-content: space-between;
    align-items: center;
  }

  .select-row select {
    padding: 4px 8px;
    background: var(--hf-dropdown-background);
    color: var(--hf-dropdown-foreground);
    border: 1px solid var(--hf-dropdown-border);
    border-radius: 3px;
    cursor: pointer;
    font-size: 13px;
  }

  .select-row select:focus {
    outline: 1px solid var(--hf-focusBorder);
    outline-offset: -1px;
  }

  .select-row select option {
    background: var(--hf-dropdown-background);
    color: var(--hf-dropdown-foreground);
  }

  .section + .section {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--hf-panel-border);
  }

  .link-btn {
    padding: 4px 12px;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
  }

  .link-btn:hover {
    background: var(--hf-button-secondaryHoverBackground);
  }

  .proxy-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 0;
  }

  .proxy-row {
    display: flex;
    gap: 8px;
  }

  .proxy-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }

  .proxy-protocol {
    flex: 0 0 100px;
  }

  .proxy-host {
    flex: 2;
  }

  .proxy-port {
    flex: 0 0 80px;
  }

  .proxy-field-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--hf-foreground);
  }

  .proxy-field input,
  .proxy-field select {
    padding: 6px 10px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    font-size: 13px;
  }

  .proxy-field input:focus,
  .proxy-field select:focus {
    outline: none;
    border-color: var(--hf-focusBorder);
  }

  .proxy-field input::placeholder {
    color: var(--hf-input-placeholderForeground);
  }
</style>
