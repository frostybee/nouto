<script lang="ts">
  import { settings, updateShortcut, resetShortcut, resetAllShortcuts, hasWorkspace, appVersion, iconUrl } from '../../stores/settings.svelte';
  import { resolvedShortcuts } from '../../stores/settings.svelte';
  import type { MinimapMode, StorageMode, GlobalProxyConfig, GlobalClientCertConfig } from '../../stores/settings.svelte';
  import { onMessage } from '../../lib/vscode';
  import {
    SHORTCUT_DEFINITIONS,
    eventToBinding,
    bindingToDisplayString,
    detectConflicts,
    type ShortcutAction,
    type ShortcutBinding,
  } from '../../lib/shortcuts';
  import { postMessage } from '../../lib/vscode';
  // Import the catalog from its specific module (not the `@nouto/core/services`
  // barrel, which pulls Node-only HTTP services into the browser bundle).
  import { LINT_RULES_CATALOG, type LintRuleCatalogEntry } from '@nouto/core/services/openapi/lint/registry';
  import Tooltip from './Tooltip.svelte';
  import { resetOnboarding } from '../../stores/onboarding.svelte';
  import { showNotification } from '../../stores/notifications.svelte';
  import {
    currentTheme, setTheme, THEMES, FONT_SIZES,
    interfaceFont, interfaceFontSize, editorFont, editorFontSize,
    setInterfaceFont, setInterfaceFontSize, setEditorFont, setEditorFontSize,
    type ThemeDefinition,
  } from '../../stores/theme.svelte';

  interface Props {
    onclose?: () => void;
    standalone?: boolean;
    fullPage?: boolean;
    initialSection?: string | null;
  }
  let { onclose, standalone = false, fullPage = false, initialSection = null }: Props = $props();

  type SettingsSection = 'appearance' | 'interface' | 'general' | 'network' | 'storage' | 'openapi' | 'shortcuts' | 'about';

  function normalizeSection(section: unknown): SettingsSection {
    const validSections: SettingsSection[] = standalone
      ? ['appearance', 'interface', 'general', 'network', 'storage', 'shortcuts', 'about']
      : ['general', 'network', 'storage', 'openapi', 'shortcuts', 'about'];
    return typeof section === 'string' && validSections.includes(section as SettingsSection)
      ? section as SettingsSection
      : standalone ? 'appearance' : 'general';
  }

  // svelte-ignore state_referenced_locally
  let activeSection = $state<SettingsSection>(normalizeSection(initialSection));
  let recordingId = $state<ShortcutAction | null>(null);
  let projectDirPath = $state<string | null>(null);

  // Listen for focusSection events from the extension
  $effect(() => {
    const handleFocusSection = (e: Event) => {
      const section = (e as CustomEvent).detail;
      activeSection = normalizeSection(section);
    };
    window.addEventListener('nouto:focusSection', handleFocusSection);
    return () => window.removeEventListener('nouto:focusSection', handleFocusSection);
  });

  // Backup operation loading state
  let backupExporting = $state(false);
  let backupImporting = $state(false);

  $effect(() => {
    const onExportDone = () => { backupExporting = false; };
    const onImportDone = () => { backupImporting = false; };
    window.addEventListener('backup-export-done', onExportDone);
    window.addEventListener('backup-import-done', onImportDone);
    // VS Code: completion arrives as postMessage from extension host
    const unsub = onMessage((msg: any) => {
      if (msg.type === 'backupExportDone') onExportDone();
      if (msg.type === 'backupImportDone') onImportDone();
    });
    return () => {
      window.removeEventListener('backup-export-done', onExportDone);
      window.removeEventListener('backup-import-done', onImportDone);
      unsub();
    };
  });

  // Font lists from Rust backend (desktop only)
  let uiFonts = $state<string[]>([]);
  let editorFonts = $state<string[]>([]);
  let fontsLoaded = $state(false);

  // Bundled fonts that are always available regardless of system installation
  const BUNDLED_EDITOR_FONTS = ['JetBrains Mono'];

  $effect(() => {
    if (standalone && !fontsLoaded) {
      fontsLoaded = true;
      const unsub = onMessage((msg: any) => {
        if (msg.type === 'fontsListed' && msg.data) {
          uiFonts = msg.data.uiFonts;
          const merged = new Set([...BUNDLED_EDITOR_FONTS, ...msg.data.editorFonts]);
          editorFonts = [...merged].sort();
          unsub();
        }
      });
      postMessage({ type: 'listFonts' });
    }
  });

  // Listen for project open/close events in standalone (desktop) mode
  $effect(() => {
    if (standalone) {
      return onMessage((msg: any) => {
        if (msg.type === 'projectOpened' && msg.data?.path) {
          projectDirPath = msg.data.path;
        } else if (msg.type === 'projectClosed') {
          projectDirPath = null;
        }
      });
    }
  });

  const currentSettings = $derived(settings);
  const shortcuts = $derived(resolvedShortcuts());
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

  function applySettings(patch: Record<string, any>) {
    Object.assign(settings, patch);
    postMessage({ type: 'updateSettings', data: $state.snapshot(settings) });
  }

  function handleToggleAutoCorrect() {
    applySettings({ autoCorrectUrls: !currentSettings.autoCorrectUrls });
  }

  function handleMinimapChange(value: string) {
    applySettings({ minimap: value as MinimapMode });
  }

  function handleToggleSaveResponseBody() {
    applySettings({ saveResponseBody: !currentSettings.saveResponseBody });
  }

  function handleResetOnboarding() {
    resetOnboarding();
    showNotification('info', 'Onboarding hints have been reset. They will appear again on relevant screens.');
  }

  function handleToggleSslRejectUnauthorized() {
    applySettings({ sslRejectUnauthorized: !currentSettings.sslRejectUnauthorized });
  }

  function handleStorageModeChange(value: string) {
    applySettings({ storageMode: value as StorageMode });
  }

  const defaultGlobalProxy: GlobalProxyConfig = { enabled: false, protocol: 'http', host: '', port: 8080 };
  const globalProxy = $derived(currentSettings.globalProxy ?? defaultGlobalProxy);

  function updateGlobalProxy(patch: Partial<GlobalProxyConfig>) {
    const updated = { ...globalProxy, ...patch };
    applySettings({ globalProxy: updated });
  }

  const defaultClientCert: GlobalClientCertConfig = {};
  const globalClientCert = $derived(currentSettings.globalClientCert ?? defaultClientCert);

  function updateGlobalClientCert(patch: Partial<GlobalClientCertConfig>) {
    const updated = { ...globalClientCert, ...patch };
    const hasValues = updated.certPath || updated.keyPath || updated.passphrase;
    applySettings({ globalClientCert: hasValues ? updated : null });
  }

  function pickGlobalSslFile(field: 'cert' | 'key' | 'ca') {
    postMessage({ type: 'pickSslFile', data: { field: `global-${field}` } });
  }

  $effect(() => {
    const cleanup = onMessage((msg: any) => {
      if (msg.type === 'sslFilePicked') {
        const { field, path } = msg.data as { field: string; path: string };
        if (field === 'global-cert') updateGlobalClientCert({ certPath: path });
        else if (field === 'global-key') updateGlobalClientCert({ keyPath: path });
        else if (field === 'global-ca') updateGlobalClientCert({ caCertPath: path });
      }
    });
    return cleanup;
  });

  function handleTimeoutChange(value: string) {
    const timeout = value === '' ? null : Math.max(0, Math.min(600000, parseInt(value, 10) || 0));
    applySettings({ defaultTimeout: timeout });
  }

  function handleToggleFollowRedirects() {
    const follow = currentSettings.defaultFollowRedirects === false ? null : false;
    applySettings({ defaultFollowRedirects: follow, defaultMaxRedirects: follow === false ? null : currentSettings.defaultMaxRedirects });
  }

  function handleMaxRedirectsChange(value: string) {
    const max = value === '' ? null : Math.max(1, Math.min(100, parseInt(value, 10) || 1));
    applySettings({ defaultMaxRedirects: max });
  }

  function hasConflict(id: ShortcutAction): boolean {
    return conflicts.some(([a, b]) => a === id || b === id);
  }

  function parseDisplayParts(displayStr: string): string[] {
    return displayStr.split('+');
  }

  const activeThemeId = $derived(currentTheme());
  const activeInterfaceFont = $derived(interfaceFont());
  const activeInterfaceFontSize = $derived(interfaceFontSize());
  const activeEditorFont = $derived(editorFont());
  const activeEditorFontSize = $derived(editorFontSize());

  const autoThemes = $derived(THEMES.filter(t => t.category === 'auto'));
  const darkThemes = $derived(THEMES.filter(t => t.category === 'dark'));
  const lightThemes = $derived(THEMES.filter(t => t.category === 'light'));

  // All fonts available for the interface dropdown (UI + monospace, since some prefer monospace everywhere)
  const allInterfaceFonts = $derived([...uiFonts, ...editorFonts].sort());

  const navItems: { id: SettingsSection; label: string; icon: string; standaloneOnly?: boolean; vscodeOnly?: boolean }[] = [
    { id: 'appearance', label: 'Appearance', icon: 'codicon-symbol-color', standaloneOnly: true },
    { id: 'interface', label: 'Interface', icon: 'codicon-layout', standaloneOnly: true },
    { id: 'general', label: 'General', icon: 'codicon-gear' },
    { id: 'network', label: 'Network', icon: 'codicon-globe' },
    { id: 'storage', label: 'Storage', icon: 'codicon-database' },
    { id: 'openapi', label: 'OpenAPI', icon: 'codicon-symbol-interface' },
    { id: 'shortcuts', label: 'Shortcuts', icon: 'codicon-keyboard' },
    { id: 'about', label: 'About', icon: 'codicon-info' },
  ];

  const LINT_SEVERITY_OPTIONS: { value: 'off' | 'warning' | 'error'; label: string }[] = [
    { value: 'off', label: 'Off' },
    { value: 'warning', label: 'Warning' },
    { value: 'error', label: 'Error' },
  ];

  // Short note under a group heading, for groups whose rules encode a design
  // opinion (Policy) or ship disabled (Opt-in) rather than flag a defect.
  const LINT_GROUP_HINTS: Record<string, string> = {
    Paths: 'Path key and parameter hygiene: trailing slashes, query strings, duplicate or ambiguous routes.',
    OWASP: 'OWASP API Security Top 10 checks (input bounds, error responses, auth hygiene). On by default; turn the group down for internal or non-sensitive APIs.',
    'OpenAPI 3.2': 'Structures introduced in OpenAPI 3.2 (querystring parameters, tag hierarchies, defaultMapping, sequential media types).',
    Components: 'Reference, component, and security-requirement integrity: $ref siblings, unused components, undefined schemes and scopes.',
    Policy: 'Style and policy checks. On by default; turn them off if they do not match how your API is designed.',
    'Opt-in': 'Off by default. Enable per project.',
  };

  // Catalog rows grouped by their `group` field, preserving catalog order.
  const lintRuleGroups = $derived.by(() => {
    const groups: { group: string; rules: LintRuleCatalogEntry[] }[] = [];
    for (const entry of LINT_RULES_CATALOG) {
      let bucket = groups.find((g) => g.group === entry.group);
      if (!bucket) {
        bucket = { group: entry.group, rules: [] };
        groups.push(bucket);
      }
      bucket.rules.push(entry);
    }
    return groups;
  });

  function handleToggleOpenApiLint() {
    applySettings({ openApiLintEnabled: !currentSettings.openApiLintEnabled });
  }

  function handleToggleOutlineSort() {
    applySettings({ openApiOutlineSortAlphabetically: !currentSettings.openApiOutlineSortAlphabetically });
  }

  function handleToggleOpenApiIntelliSense() {
    applySettings({ openApiIntelliSenseEnabled: !currentSettings.openApiIntelliSenseEnabled });
  }

  function handleToggleOpenApiExternalRefs() {
    applySettings({ openApiExternalRefsEnabled: !currentSettings.openApiExternalRefsEnabled });
  }

  function handleLintRuleSeverityChange(id: string, value: string) {
    applySettings({
      openApiLintRules: { ...currentSettings.openApiLintRules, [id]: value as 'error' | 'warning' | 'off' },
    });
  }

  // Opt-in rules run only once the user has picked a severity, so an unset
  // opt-in rule displays as Off (mirrors `lintOptionsFromSettings` in core).
  function lintRuleSeverity(entry: LintRuleCatalogEntry): string {
    const stored = currentSettings.openApiLintRules[entry.id];
    if (stored) return stored;
    return entry.group === 'Opt-in' ? 'off' : entry.defaultSeverity;
  }
</script>

<div class="settings-page">
  {#if !standalone && !fullPage}
    <div class="settings-header">
      <button class="back-btn" onclick={onclose} aria-label="Back">
        <i class="codicon codicon-arrow-left"></i>
      </button>
      <span class="settings-title">Settings</span>
    </div>
  {/if}

  <div class="settings-body">
    <nav class="settings-nav">
      {#each navItems.filter(i => (!i.standaloneOnly || standalone) && (!i.vscodeOnly || !standalone)) as item}
        <button
          class="nav-item"
          class:active={activeSection === item.id}
          onclick={() => activeSection = item.id}
        >
          <i class="codicon {item.icon}"></i>
          {item.label}
        </button>
      {/each}
    </nav>

    <div class="settings-content">
      {#if activeSection === 'appearance'}
        <h3 class="page-title">Appearance</h3>

        {#snippet themeGroup(label: string, themes: ThemeDefinition[])}
          <div class="theme-group">
            <h4 class="theme-group-label">{label}</h4>
            <div class="theme-grid">
              {#each themes as theme}
                <button
                  class="theme-card"
                  class:active={activeThemeId === theme.id}
                  onclick={() => setTheme(theme.id)}
                  aria-label="Select {theme.name} theme"
                >
                  <div class="theme-swatches">
                    <span class="swatch" style:background={theme.colors.background}></span>
                    <span class="swatch" style:background={theme.colors.sidebar}></span>
                    <span class="swatch" style:background={theme.colors.foreground}></span>
                    <span class="swatch" style:background={theme.colors.accent}></span>
                    <span class="swatch" style:background={theme.colors.button}></span>
                  </div>
                  <span class="theme-name">{theme.name}</span>
                  {#if activeThemeId === theme.id}
                    <i class="codicon codicon-check theme-check"></i>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/snippet}

        {@render themeGroup('Auto', autoThemes)}
        {@render themeGroup('Dark Themes', darkThemes)}
        {@render themeGroup('Light Themes', lightThemes)}

      {:else if activeSection === 'interface'}
        <h3 class="page-title">Interface</h3>
        <p class="page-description">Tweak settings related to the user interface.</p>

        <div class="font-section">
          <div class="font-row">
            <label class="font-field">
              <span class="font-label">Interface font</span>
              <select
                class="font-select"
                value={activeInterfaceFont ?? ''}
                onchange={(e) => setInterfaceFont(e.currentTarget.value || null)}
              >
                <option value="">System default</option>
                {#each allInterfaceFonts as font}
                  <option value={font}>{font}</option>
                {/each}
              </select>
            </label>
            <label class="font-field font-size-field">
              <span class="font-label">Size</span>
              <select
                class="font-select"
                value={activeInterfaceFontSize}
                onchange={(e) => setInterfaceFontSize(parseInt(e.currentTarget.value, 10))}
              >
                {#each FONT_SIZES as size}
                  <option value={size}>{size}</option>
                {/each}
              </select>
            </label>
          </div>

          <div class="font-row">
            <label class="font-field">
              <span class="font-label">Editor font</span>
              <select
                class="font-select"
                value={activeEditorFont ?? ''}
                onchange={(e) => setEditorFont(e.currentTarget.value || null)}
              >
                <option value="">System default</option>
                {#each editorFonts as font}
                  <option value={font}>{font}</option>
                {/each}
              </select>
            </label>
            <label class="font-field font-size-field">
              <span class="font-label">Size</span>
              <select
                class="font-select"
                value={activeEditorFontSize}
                onchange={(e) => setEditorFontSize(parseInt(e.currentTarget.value, 10))}
              >
                {#each FONT_SIZES as size}
                  <option value={size}>{size}</option>
                {/each}
              </select>
            </label>
          </div>
        </div>

        <div class="appearance-divider"></div>

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

      {:else if activeSection === 'general'}
        <h3 class="page-title">General</h3>

        {#if !standalone}
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
        {/if}

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

        <div class="setting-row">
          <span class="setting-label">
            Environment Variables
            <span class="setting-description">Environments and the active environment are managed in the Variables tab in the sidebar.</span>
          </span>
          <button class="link-btn" onclick={() => { postMessage({ type: 'openEnvironmentsPanel' }); onclose?.(); }}>Open Variables Tab</button>
        </div>

        <div class="appearance-divider"></div>

        <div class="setting-row">
          <span class="setting-label">
            Onboarding
            <span class="setting-description">Reset to show the welcome screen and contextual hints again</span>
          </span>
          <button class="link-btn" onclick={handleResetOnboarding}>Reset Onboarding Hints</button>
        </div>

      {:else if activeSection === 'network'}
        <h3 class="page-title">Network</h3>

        <div class="subsection">
          <h4 class="subsection-title">SSL / TLS</h4>
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

        <div class="subsection">
          <h4 class="subsection-title">Client Certificate (mTLS)</h4>
          <span class="setting-description cert-description">Default client certificate for mutual TLS authentication. Per-request certificate settings override these.</span>

          <div class="cert-field">
            <span class="cert-field-label">Certificate file <span class="setting-description">(.pem, .crt)</span></span>
            <div class="cert-file-row">
              <span class="cert-file-path" class:empty={!globalClientCert.certPath}>{globalClientCert.certPath || 'No file selected'}</span>
              <button class="cert-pick-btn" onclick={() => pickGlobalSslFile('cert')}>Browse...</button>
              {#if globalClientCert.certPath}
                <Tooltip text="Clear" position="top">
                  <button class="cert-clear-btn" onclick={() => updateGlobalClientCert({ certPath: undefined })} aria-label="Clear"><svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M8 8.707l-4.146 4.147-.708-.708L7.293 8 3.146 3.854l.708-.708L8 7.293l4.146-4.147.708.708L8.707 8l4.147 4.146-.708.708L8 8.707z"/></svg></button>
                </Tooltip>
              {/if}
            </div>
          </div>

          <div class="cert-field">
            <span class="cert-field-label">Key file <span class="setting-description">(.pem, .key)</span></span>
            <div class="cert-file-row">
              <span class="cert-file-path" class:empty={!globalClientCert.keyPath}>{globalClientCert.keyPath || 'No file selected'}</span>
              <button class="cert-pick-btn" onclick={() => pickGlobalSslFile('key')}>Browse...</button>
              {#if globalClientCert.keyPath}
                <Tooltip text="Clear" position="top">
                  <button class="cert-clear-btn" onclick={() => updateGlobalClientCert({ keyPath: undefined })} aria-label="Clear"><svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M8 8.707l-4.146 4.147-.708-.708L7.293 8 3.146 3.854l.708-.708L8 7.293l4.146-4.147.708.708L8.707 8l4.147 4.146-.708.708L8 8.707z"/></svg></button>
                </Tooltip>
              {/if}
            </div>
          </div>

          <div class="cert-field">
            <span class="cert-field-label">Passphrase <span class="setting-description">(if key is encrypted)</span></span>
            <input
              class="cert-passphrase-input"
              type="password"
              placeholder="Enter passphrase"
              value={globalClientCert.passphrase || ''}
              oninput={(e) => updateGlobalClientCert({ passphrase: e.currentTarget.value || undefined })}
            />
          </div>

          <div class="cert-field">
            <span class="cert-field-label">CA Certificate <span class="setting-description">(.pem, .crt — custom root CA)</span></span>
            <div class="cert-file-row">
              <span class="cert-file-path" class:empty={!globalClientCert.caCertPath}>{globalClientCert.caCertPath || 'No file selected'}</span>
              <button class="cert-pick-btn" onclick={() => pickGlobalSslFile('ca')}>Browse...</button>
              {#if globalClientCert.caCertPath}
                <Tooltip text="Clear" position="top">
                  <button class="cert-clear-btn" onclick={() => updateGlobalClientCert({ caCertPath: undefined })} aria-label="Clear"><svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M8 8.707l-4.146 4.147-.708-.708L7.293 8 3.146 3.854l.708-.708L8 7.293l4.146-4.147.708.708L8.707 8l4.147 4.146-.708.708L8 8.707z"/></svg></button>
                </Tooltip>
              {/if}
            </div>
          </div>
        </div>

        <div class="subsection">
          <h4 class="subsection-title">Proxy</h4>
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

        <div class="subsection">
          <h4 class="subsection-title">Timeout</h4>
          <div class="setting-row">
            <span class="setting-label">
              Default Request Timeout
              <span class="setting-description">Global timeout in milliseconds for all requests. 0 = no timeout. Leave empty for default (30s). Per-request timeout settings override this.</span>
            </span>
            <input
              class="number-input"
              type="number"
              placeholder="30000"
              min="0"
              max="600000"
              value={currentSettings.defaultTimeout ?? ''}
              oninput={(e) => handleTimeoutChange(e.currentTarget.value)}
            />
          </div>
        </div>

        <div class="subsection">
          <h4 class="subsection-title">Redirects</h4>
          <div class="setting-row">
            <span class="setting-label">
              Follow Redirects
              <span class="setting-description">Automatically follow HTTP 3xx redirects. Per-request redirect settings override this.</span>
            </span>
            <label class="toggle-control">
              <input
                type="checkbox"
                checked={currentSettings.defaultFollowRedirects !== false}
                onchange={handleToggleFollowRedirects}
              />
              <span class="toggle-slider"></span>
            </label>
          </div>

          {#if currentSettings.defaultFollowRedirects !== false}
            <div class="setting-row">
              <span class="setting-label">
                Max Redirects
                <span class="setting-description">Maximum number of redirects to follow. Leave empty for default (10).</span>
              </span>
              <input
                class="number-input"
                type="number"
                placeholder="10"
                min="1"
                max="100"
                value={currentSettings.defaultMaxRedirects ?? ''}
                oninput={(e) => handleMaxRedirectsChange(e.currentTarget.value)}
              />
            </div>
          {/if}
        </div>

      {:else if activeSection === 'storage'}
        <h3 class="page-title">Storage</h3>

        {#if standalone}
          <div class="setting-row">
            <span class="setting-label">
              Current Mode
              <span class="setting-description">
                {#if projectDirPath}
                  Project Directory: collections and environments are stored in <code>{projectDirPath}/.nouto/</code>, suitable for version control with git.
                {:else}
                  App Data: collections and environments are stored in the application's local data folder. Open a project directory to use file-based storage.
                {/if}
              </span>
            </span>
          </div>
          <div class="setting-row">
            {#if projectDirPath}
              <button class="action-btn" onclick={() => postMessage({ type: 'closeProject' })}>
                Close Project
              </button>
            {:else}
              <button class="action-btn" onclick={() => postMessage({ type: 'openProjectDir' })}>
                Open Project Directory
              </button>
            {/if}
          </div>

        {:else}
          <label class="setting-row select-row">
            <span class="setting-label">
              Storage Mode
              <span class="setting-description">Global stores all collections in VS Code extension storage. Workspace stores each request as an individual file in .nouto/collections/ for clean git diffs.</span>
            </span>
            <select
              value={currentSettings.storageMode}
              onchange={(e) => handleStorageModeChange(e.currentTarget.value)}
            >
              <option value="global">Global</option>
              <option value="workspace">Workspace (.nouto/)</option>
            </select>
          </label>

          {#if !hasWorkspace()}
            <div class="storage-warning">
              <i class="codicon codicon-warning"></i>
              No workspace folder is open. Open a folder in VS Code to use Workspace storage mode.
            </div>
          {/if}
        {/if}

        <div class="settings-section-divider"></div>
        <div class="setting-row">
          <span class="setting-label">
            Backup &amp; Restore
            <span class="setting-description">Export all your data (collections, environments, history, settings) or restore from a previous backup.</span>
          </span>
        </div>
        <div class="setting-row backup-row">
          <button class="action-btn" disabled={backupExporting} onclick={() => {
            const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('nouto_cookie_jars') : null;
            const cookies = raw ? JSON.parse(raw) : null;
            backupExporting = true;
            postMessage({ type: 'exportBackup', data: { cookies } });
          }}>
            {#if backupExporting}
              <span class="btn-spinner"></span> Exporting...
            {:else}
              Export Backup
            {/if}
          </button>
          <button class="action-btn" disabled={backupImporting} onclick={() => {
            backupImporting = true;
            postMessage({ type: 'importBackup' });
          }}>
            {#if backupImporting}
              <span class="btn-spinner"></span> Restoring...
            {:else}
              Restore from Backup
            {/if}
          </button>
        </div>
        <div class="setting-row">
          <span class="setting-description backup-warning">
            <i class="codicon codicon-warning"></i>
            Secrets stored in the OS keychain are not included. Re-enter them after restoring.
          </span>
        </div>

      {:else if activeSection === 'openapi'}
        <h3 class="page-title">OpenAPI</h3>
        <p class="page-description">Settings for the OpenAPI editor: IntelliSense, linting and the structure outline.</p>

        <div class="setting-row">
          <span class="setting-label">
            Enable OpenAPI IntelliSense
            <span class="setting-description">Suggest valid properties, enum values, and $ref targets as you type, and show documentation on hover.</span>
          </span>
          <label class="toggle-control">
            <input
              type="checkbox"
              checked={currentSettings.openApiIntelliSenseEnabled}
              onchange={handleToggleOpenApiIntelliSense}
            />
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="setting-row">
          <span class="setting-label">
            Resolve external $refs
            <span class="setting-description">Resolve $refs that point into other local workspace files: cross-file navigation, diagnostics, and a self-contained preview. Never accesses the network.</span>
          </span>
          <label class="toggle-control">
            <input
              type="checkbox"
              checked={currentSettings.openApiExternalRefsEnabled}
              onchange={handleToggleOpenApiExternalRefs}
            />
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="setting-row">
          <span class="setting-label">
            Enable OpenAPI linting
            <span class="setting-description">Run Nouto's built-in OpenAPI security/quality lint rules and show their findings as diagnostics.</span>
          </span>
          <label class="toggle-control">
            <input
              type="checkbox"
              checked={currentSettings.openApiLintEnabled}
              onchange={handleToggleOpenApiLint}
            />
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="setting-row">
          <span class="setting-label">
            Sort outline alphabetically
            <span class="setting-description">Sort the OpenAPI Outline's Paths, Tags, Components, Servers, and Webhooks alphabetically instead of in document order.</span>
          </span>
          <label class="toggle-control">
            <input
              type="checkbox"
              checked={currentSettings.openApiOutlineSortAlphabetically}
              onchange={handleToggleOutlineSort}
            />
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="subsection">
          <h4 class="subsection-title">Lint rules</h4>
          <span class="setting-description lint-rules-hint">Set each rule to Off, Warning, or Error. Disabled while linting is turned off.</span>
          {#each lintRuleGroups as group}
            <div class="lint-group">
              <h5 class="lint-group-label">{group.group}</h5>
              {#if LINT_GROUP_HINTS[group.group]}
                <span class="setting-description lint-group-hint">{LINT_GROUP_HINTS[group.group]}</span>
              {/if}
              {#each group.rules as entry}
                <label class="setting-row select-row lint-rule-row">
                  <span class="setting-label">
                    <span class="lint-rule-id">{entry.id}</span>
                    <span class="setting-description">{entry.description}</span>
                  </span>
                  <select
                    value={lintRuleSeverity(entry)}
                    disabled={!currentSettings.openApiLintEnabled}
                    onchange={(e) => handleLintRuleSeverityChange(entry.id, e.currentTarget.value)}
                  >
                    {#each LINT_SEVERITY_OPTIONS as opt}
                      <option value={opt.value}>{opt.label}</option>
                    {/each}
                  </select>
                </label>
              {/each}
            </div>
          {/each}
        </div>

      {:else if activeSection === 'shortcuts'}
        <h3 class="page-title">Keyboard Shortcuts</h3>

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
                    <Tooltip text="Click to change shortcut" position="top">
                      <button
                        class="shortcut-badge"
                        class:overridden={isOverridden(def.id)}
                        onclick={() => startRecording(def.id)}
                        aria-label="Click to change shortcut"
                      >
                        {#each parseDisplayParts(getDisplayString(def.id)) as part, i}
                          {#if i > 0}<span class="key-sep">+</span>{/if}
                          <kbd>{part}</kbd>
                        {/each}
                      </button>
                    </Tooltip>
                  {/if}
                </td>
                <td class="reset-cell">
                  {#if isOverridden(def.id)}
                    <Tooltip text="Reset to default" position="top">
                      <button
                        class="reset-btn"
                        onclick={() => resetShortcut(def.id)}
                        aria-label="Reset to default"
                      >
                        <i class="codicon codicon-discard"></i>
                      </button>
                    </Tooltip>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>

        <button class="reset-all-btn" onclick={resetAllShortcuts}>
          Reset All to Defaults
        </button>

      {:else if activeSection === 'about'}
        <div class="about-page">
          <div class="about-logo">
            {#if iconUrl()}
              <img src={iconUrl()} alt="Nouto" width="72" height="72" class="about-icon-img" />
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="64" height="64"><path fill="currentColor" fill-rule="evenodd" d="M81 36 64 0 47 36l-1 2-9-10a6 6 0 0 0-9 9l10 10h-2L0 64l36 17h2L28 91a6 6 0 1 0 9 9l9-10 1 2 17 36 17-36v-2l9 10a6 6 0 1 0 9-9l-9-9 2-1 36-17-36-17-2-1 9-9a6 6 0 1 0-9-9l-9 10v-2Zm-17 2-2 5c-4 8-11 15-19 19l-5 2 5 2c8 4 15 11 19 19l2 5 2-5c4-8 11-15 19-19l5-2-5-2c-8-4-15-11-19-19l-2-5Z" clip-rule="evenodd"/><path fill="currentColor" d="M118 19a6 6 0 0 0-9-9l-3 3a6 6 0 1 0 9 9l3-3Zm-96 4c-2 2-6 2-9 0l-3-3a6 6 0 1 1 9-9l3 3c3 2 3 6 0 9Zm0 82c-2-2-6-2-9 0l-3 3a6 6 0 1 0 9 9l3-3c3-2 3-6 0-9Zm96 4a6 6 0 0 1-9 9l-3-3a6 6 0 1 1 9-9l3 3Z"/></svg>
            {/if}
          </div>
          <h3 class="about-name">Nouto</h3>
          <span class="about-version">Version {appVersion() || 'unknown'}</span>
          <p class="about-description">
            {#if standalone}
              A 100% open-source, privacy-respecting REST client. Features HTTP requests, collections, history, environment variables, GraphQL, WebSocket, SSE, mock server, benchmarking, and more.
            {:else}
              A 100% open-source, privacy-respecting REST client for VS Code. Features HTTP requests, collections, history, environment variables, GraphQL, WebSocket, SSE, mock server, benchmarking, and more.
            {/if}
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
            {#if standalone}
              <div class="about-row">
                <span class="about-label">Platform</span>
                <span class="about-value">Desktop (Tauri)</span>
              </div>
            {:else}
              <div class="about-row">
                <span class="about-label">VS Code Engine</span>
                <span class="about-value">^1.74.0</span>
              </div>
            {/if}
          </div>

          <div class="about-links">
            <button class="about-link-btn" onclick={() => postMessage({ type: 'openExternal', data: { url: 'https://github.com/frostybee/nouto' } })}>
              <i class="codicon codicon-github"></i>
              GitHub Repository
            </button>
            <button class="about-link-btn" onclick={() => postMessage({ type: 'openExternal', data: { url: 'https://github.com/frostybee/nouto/issues/new?template=bug_report.yml' } })}>
              <i class="codicon codicon-bug"></i>
              Report a Bug
            </button>
            <button class="about-link-btn" onclick={() => postMessage({ type: 'openExternal', data: { url: 'https://github.com/frostybee/nouto/issues/new?template=feature_request.yml' } })}>
              <i class="codicon codicon-lightbulb"></i>
              Request a Feature
            </button>
            <button class="about-link-btn" onclick={() => postMessage({ type: 'openExternal', data: { url: standalone ? 'https://github.com/frostybee/nouto/blob/main/packages/desktop/CHANGELOG.md' : 'https://github.com/frostybee/nouto/blob/main/packages/vscode/CHANGELOG.md' } })}>
              <i class="codicon codicon-list-flat"></i>
              Changelog
            </button>
          </div>

          <p class="about-footer">
            Made with care. Star the repo if you find it useful!
          </p>
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
    height: 100%;
    overflow: hidden;
    background: var(--hf-editor-background);
  }

  .settings-header {
    display: flex;
    align-items: center;
    gap: 0.769rem;
    padding: 0.769rem 1.077rem;
    border-bottom: 1px solid var(--hf-panel-border);
    background: var(--hf-editor-background);
  }

  .back-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.308rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0.231rem;
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
    font-size: 1.077rem;
    color: var(--hf-foreground);
  }

  .settings-body {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* ---- Sidebar nav ---- */

  .settings-nav {
    display: flex;
    flex-direction: column;
    gap: 0.154rem;
    padding: 0.769rem 0.462rem;
    width: 12.308rem;
    min-width: 12.308rem;
    background: var(--hf-sideBar-background, var(--hf-editor-background));
    border-right: 1px solid var(--hf-panel-border);
    overflow-y: auto;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 0.615rem;
    padding: 0.615rem 0.923rem;
    background: transparent;
    border: none;
    border-radius: 0.308rem;
    color: var(--hf-foreground);
    font-size: 1rem;
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
    font-size: 1.077rem;
  }

  /* ---- Content area ---- */

  .settings-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 1.538rem 2.154rem;
  }

  .page-title {
    font-size: 1.154rem;
    font-weight: 600;
    color: var(--hf-foreground);
    margin: 0 0 1.538rem;
  }

  /* ---- Subsections (within a page) ---- */

  .subsection {
    margin-bottom: 0.615rem;
  }

  .subsection + .subsection {
    margin-top: 1.538rem;
    padding-top: 1.231rem;
    border-top: 1px solid var(--hf-panel-border);
  }

  .subsection-title {
    font-size: 0.923rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--hf-descriptionForeground);
    margin: 0 0 0.923rem;
  }

  /* ---- Setting rows ---- */

  .setting-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.923rem;
    padding: 0.769rem 0;
  }

  .setting-row + .setting-row {
    border-top: 1px solid color-mix(in srgb, var(--hf-panel-border) 40%, transparent);
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
    width: 2.154rem;
    height: 1.077rem;
    background: var(--hf-input-background);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 0.538rem;
    transition: background 0.2s, border-color 0.2s;
  }

  .toggle-slider::after {
    content: '';
    position: absolute;
    top: 0.077rem;
    left: 0.077rem;
    width: 0.769rem;
    height: 0.769rem;
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
    gap: 0.231rem;
    font-size: 1rem;
    color: var(--hf-foreground);
  }

  .setting-description {
    font-size: 0.923rem;
    color: var(--hf-descriptionForeground);
  }

  /* ---- Selects ---- */

  .select-row {
    justify-content: space-between;
    align-items: center;
  }

  .select-row select {
    padding: 0.308rem 0.615rem;
    background: var(--hf-dropdown-background);
    color: var(--hf-dropdown-foreground);
    border: 1px solid var(--hf-dropdown-border);
    border-radius: 0.231rem;
    cursor: pointer;
    font-size: 1rem;
  }

  .select-row select:focus {
    outline: 1px solid var(--hf-focusBorder);
    outline-offset: -1px;
  }

  .select-row select option {
    background: var(--hf-dropdown-background);
    color: var(--hf-dropdown-foreground);
  }

  /* ---- Link button ---- */

  .link-btn {
    padding: 0.308rem 0.923rem;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: none;
    border-radius: 0.308rem;
    font-size: 0.923rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .link-btn:hover {
    background: var(--hf-button-secondaryHoverBackground);
  }

  /* ---- Client certificate fields ---- */

  .cert-description {
    margin-bottom: 0.308rem;
  }

  .cert-field {
    display: flex;
    flex-direction: column;
    gap: 0.462rem;
    padding: 0.308rem 0;
  }

  .cert-field-label {
    font-size: 0.923rem;
    font-weight: 600;
    color: var(--hf-foreground);
  }

  .cert-file-row {
    display: flex;
    align-items: center;
    gap: 0.462rem;
  }

  .cert-file-path {
    flex: 1;
    padding: 0.462rem 0.769rem;
    background: var(--hf-input-background);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 0.308rem;
    font-size: 0.923rem;
    font-family: var(--hf-editor-font-family), monospace;
    color: var(--hf-input-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .cert-file-path.empty {
    color: var(--hf-input-placeholderForeground);
    font-style: italic;
  }

  .cert-pick-btn {
    padding: 0.385rem 0.923rem;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: none;
    border-radius: 0.308rem;
    font-size: 0.923rem;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .cert-pick-btn:hover {
    background: var(--hf-button-secondaryHoverBackground);
  }

  .cert-clear-btn {
    padding: 0.308rem 0.615rem;
    background: transparent;
    color: var(--hf-foreground);
    border: none;
    border-radius: 0.308rem;
    cursor: pointer;
    opacity: 0.6;
    flex-shrink: 0;
  }

  .cert-clear-btn:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
  }

  .cert-passphrase-input {
    padding: 0.462rem 0.769rem;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 0.308rem;
    font-size: 1rem;
  }

  .cert-passphrase-input:focus {
    outline: none;
    border-color: var(--hf-focusBorder);
  }

  .cert-passphrase-input::placeholder {
    color: var(--hf-input-placeholderForeground);
  }

  /* ---- Number inputs ---- */

  .number-input {
    padding: 0.308rem 0.615rem;
    width: 7.692rem;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 0.308rem;
    font-size: 1rem;
  }

  .number-input:focus {
    outline: none;
    border-color: var(--hf-focusBorder);
  }

  .number-input::placeholder {
    color: var(--hf-input-placeholderForeground);
  }

  /* ---- Proxy form ---- */

  .proxy-form {
    display: flex;
    flex-direction: column;
    gap: 0.769rem;
    padding: 0.769rem 0;
  }

  .proxy-row {
    display: flex;
    gap: 0.615rem;
  }

  .proxy-field {
    display: flex;
    flex-direction: column;
    gap: 0.308rem;
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
    font-size: 0.923rem;
    font-weight: 600;
    color: var(--hf-foreground);
  }

  .proxy-field input,
  .proxy-field select {
    padding: 0.462rem 0.769rem;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 0.308rem;
    font-size: 1rem;
  }

  .proxy-field input:focus,
  .proxy-field select:focus {
    outline: none;
    border-color: var(--hf-focusBorder);
  }

  .proxy-field input::placeholder {
    color: var(--hf-input-placeholderForeground);
  }

  /* ---- Shortcuts ---- */

  .action-btn {
    padding: 0.462rem 1.077rem;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: none;
    border-radius: 0.308rem;
    font-size: 0.923rem;
    cursor: pointer;
    transition: background 0.15s;
  }

  .action-btn:hover {
    background: var(--hf-button-secondaryHoverBackground);
  }

  .settings-section-divider {
    border: none;
    border-top: 1px solid var(--hf-panel-border);
    margin: 0.923rem 0;
  }

  .backup-row {
    gap: 0.615rem;
    justify-content: flex-start;
  }

  .btn-spinner {
    display: inline-block;
    width: 0.846rem;
    height: 0.846rem;
    border: 2px solid var(--hf-panel-border);
    border-top-color: var(--hf-focusBorder);
    border-radius: 50%;
    animation: btn-spin 0.8s linear infinite;
    vertical-align: middle;
  }

  @keyframes btn-spin {
    to { transform: rotate(360deg); }
  }

  .backup-warning {
    display: flex;
    align-items: center;
    gap: 0.462rem;
    color: var(--hf-descriptionForeground);
    font-size: 0.846rem;
  }

  .backup-warning .codicon {
    font-size: 0.923rem;
    flex-shrink: 0;
    color: var(--hf-editorWarning-foreground, #cca700);
  }

  .storage-warning {
    display: flex;
    align-items: center;
    gap: 0.615rem;
    padding: 0.615rem 0.923rem;
    margin-top: 0.615rem;
    background: var(--hf-inputValidation-warningBackground, rgba(204, 167, 0, 0.1));
    border: 1px solid var(--hf-editorWarning-foreground, #cca700);
    border-radius: 0.308rem;
    font-size: 0.923rem;
    color: var(--hf-editorWarning-foreground, #cca700);
  }

  .conflict-banner {
    display: flex;
    align-items: center;
    gap: 0.615rem;
    padding: 0.615rem 0.923rem;
    margin-bottom: 1.077rem;
    background: var(--hf-inputValidation-warningBackground, rgba(204, 167, 0, 0.1));
    border: 1px solid var(--hf-editorWarning-foreground, #cca700);
    border-radius: 0.308rem;
    font-size: 0.923rem;
    color: var(--hf-editorWarning-foreground, #cca700);
  }

  .shortcuts-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 1rem;
  }

  .shortcuts-table th {
    text-align: left;
    padding: 0.615rem 0.769rem;
    font-weight: 600;
    font-size: 0.846rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--hf-descriptionForeground);
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .shortcuts-table td {
    padding: 0.615rem 0.769rem;
    border-bottom: 1px solid var(--hf-panel-border, rgba(128, 128, 128, 0.12));
  }

  .shortcuts-table tr.conflict td {
    background: var(--hf-inputValidation-warningBackground, rgba(204, 167, 0, 0.06));
  }

  .scope-cell {
    color: var(--hf-descriptionForeground);
    width: 6.154rem;
  }

  .action-cell {
    color: var(--hf-foreground);
  }

  .shortcut-cell {
    width: 15.385rem;
  }

  .reset-cell {
    width: 3.077rem;
    text-align: center;
  }

  .shortcut-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.308rem;
    padding: 0.308rem 0.769rem;
    background: var(--hf-keybindingLabel-background, rgba(128, 128, 128, 0.17));
    border: 1px solid var(--hf-widget-border, #454545);
    border-radius: 0.308rem;
    color: var(--hf-keybindingLabel-foreground, var(--hf-foreground));
    cursor: pointer;
    font-size: 0.923rem;
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
    font-size: 0.846rem;
    padding: 0.154rem 0.462rem;
    border-radius: 0.231rem;
    background: var(--hf-keybindingLabel-background, rgba(128, 128, 128, 0.17));
    border: 1px solid var(--hf-widget-border, rgba(128, 128, 128, 0.35));
    box-shadow: none;
  }

  .key-sep {
    color: var(--hf-descriptionForeground);
    font-size: 0.769rem;
  }

  .reset-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.308rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0.231rem;
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
    margin-top: 1.231rem;
    padding: 0.462rem 1.077rem;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: none;
    border-radius: 0.308rem;
    font-size: 0.923rem;
    cursor: pointer;
    transition: background 0.15s;
  }

  .reset-all-btn:hover {
    background: var(--hf-button-secondaryHoverBackground);
  }

  /* ---- About page ---- */

  .about-page {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 1.538rem 0;
  }

  .about-logo {
    color: var(--hf-foreground);
    opacity: 0.85;
    margin-bottom: 1.231rem;
  }

  .about-icon-img {
    border-radius: 0.923rem;
  }

  .about-name {
    font-size: 1.692rem;
    font-weight: 700;
    color: var(--hf-foreground);
    margin: 0 0 0.308rem;
  }

  .about-version {
    font-size: 0.923rem;
    color: var(--hf-descriptionForeground);
    font-family: var(--hf-editor-font-family, monospace);
  }

  .about-description {
    max-width: 32.308rem;
    font-size: 1rem;
    line-height: 1.5;
    color: var(--hf-foreground);
    opacity: 0.85;
    margin: 1.231rem 0 1.846rem;
  }

  .about-details {
    width: 100%;
    max-width: 24.615rem;
    margin-bottom: 1.846rem;
  }

  .about-row {
    display: flex;
    justify-content: space-between;
    padding: 0.615rem 0;
    border-bottom: 1px solid color-mix(in srgb, var(--hf-panel-border) 40%, transparent);
  }

  .about-label {
    font-size: 0.923rem;
    color: var(--hf-descriptionForeground);
  }

  .about-value {
    font-size: 0.923rem;
    color: var(--hf-foreground);
    font-weight: 500;
  }

  .about-links {
    display: flex;
    flex-direction: column;
    gap: 0.462rem;
    width: 100%;
    max-width: 21.538rem;
    margin-bottom: 1.846rem;
  }

  .about-link-btn {
    display: flex;
    align-items: center;
    gap: 0.615rem;
    padding: 0.615rem 1.077rem;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: none;
    border-radius: 0.308rem;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.15s;
  }

  .about-link-btn:hover {
    background: var(--hf-button-secondaryHoverBackground);
  }

  .about-link-btn .codicon {
    font-size: 1.231rem;
    opacity: 0.8;
  }

  .about-footer {
    font-size: 0.923rem;
    color: var(--hf-descriptionForeground);
    opacity: 0.6;
    margin: 0;
  }

  .page-description {
    font-size: 0.923rem;
    color: var(--hf-descriptionForeground);
    margin: -0.615rem 0 1.231rem;
  }

  /* ---- OpenAPI lint rules ---- */

  .lint-rules-hint {
    display: block;
    margin-bottom: 0.615rem;
  }

  .lint-group {
    margin-bottom: 0.923rem;
  }

  .lint-group-label {
    font-size: 0.846rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--hf-descriptionForeground);
    margin: 0.923rem 0 0.308rem;
  }

  .lint-group-hint {
    display: block;
    margin: -0.154rem 0 0.462rem;
  }

  .lint-rule-id {
    font-family: var(--hf-editor-font-family, monospace);
    font-size: 0.923rem;
    color: var(--hf-foreground);
  }

  .lint-rule-row select {
    padding: 0.308rem 0.615rem;
    background: var(--hf-dropdown-background);
    color: var(--hf-dropdown-foreground);
    border: 1px solid var(--hf-dropdown-border);
    border-radius: 0.231rem;
    cursor: pointer;
    font-size: 1rem;
  }

  .lint-rule-row select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .lint-rule-row select:focus {
    outline: 1px solid var(--hf-focusBorder);
    outline-offset: -1px;
  }

  /* ---- Theme selector ---- */

  .theme-group {
    margin-bottom: 1.538rem;
  }

  .theme-group-label {
    font-size: 0.846rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--hf-descriptionForeground);
    margin: 0 0 0.769rem;
  }

  .theme-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 0.769rem;
  }

  .theme-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.615rem;
    padding: 0.923rem;
    background: var(--hf-sideBar-background);
    border: 2px solid var(--hf-panel-border);
    border-radius: 0.462rem;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    text-align: left;
    color: var(--hf-foreground);
  }

  .theme-card:hover {
    border-color: var(--hf-descriptionForeground);
  }

  .theme-card.active {
    border-color: var(--hf-focusBorder);
  }

  .theme-swatches {
    display: flex;
    gap: 0.308rem;
    height: 1.846rem;
    border-radius: 0.308rem;
    overflow: hidden;
  }

  .swatch {
    flex: 1;
    border-radius: 0.231rem;
  }

  .theme-name {
    font-size: 0.923rem;
    font-weight: 500;
  }

  .theme-check {
    position: absolute;
    top: 0.615rem;
    right: 0.615rem;
    font-size: 1.077rem;
    color: var(--hf-focusBorder);
  }

  /* ---- Font settings ---- */

  .appearance-divider {
    border-top: 1px solid var(--hf-panel-border);
    margin: 1.538rem 0;
  }

  .font-section {
    display: flex;
    flex-direction: column;
    gap: 1.077rem;
  }

  .font-row {
    display: flex;
    gap: 0.769rem;
    align-items: flex-end;
  }

  .font-field {
    display: flex;
    flex-direction: column;
    gap: 0.308rem;
    flex: 1;
  }

  .font-size-field {
    flex: 0 0 80px;
  }

  .font-label {
    font-size: 0.846rem;
    color: var(--hf-descriptionForeground);
  }

  .font-select {
    padding: 0.385rem 0.615rem;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border);
    border-radius: 0.308rem;
    font-size: 0.923rem;
    cursor: pointer;
    width: 100%;
  }

  .font-select:focus {
    border-color: var(--hf-focusBorder);
    outline: none;
  }
</style>
