<script lang="ts">
  import {
    environments,
    activeEnvironmentId,
    globalVariables,
    envFileVariables,
    envFilePath,
    addEnvironment,
    deleteEnvironment,
    duplicateEnvironment,
    updateGlobalVariables,
    setActiveEnvironment,
    updateEnvironmentBatch,
    type Environment,
  } from '../../stores/environment.svelte';
  import KeyValueEditor from '../shared/KeyValueEditor.svelte';
  import ConfirmDialog from '../shared/ConfirmDialog.svelte';
  import { postMessage } from '../../lib/vscode';
  import { generateId, type KeyValue } from '../../types';
  import SlidePanel from '../shared/SlidePanel.svelte';
  import Tooltip from '../shared/Tooltip.svelte';
  import CookieJarPanel from '../shared/CookieJarPanel.svelte';
  import ColorPickerPopover from '../shared/ColorPickerPopover.svelte';
  import { cookieJars, requestCookieJars } from '../../stores/cookieJar.svelte';
  import { onMount } from 'svelte';

  type Tab = 'global' | 'environments' | 'cookieJar';

  // Secret detection patterns (shared with KeyValueEditor's inline hints)
  const SECRET_KEY_PATTERN = /(?:key|secret|token|password|passwd|auth|credential|api.?key)/i;
  const SECRET_VALUE_PATTERN = /^(?:sk-|sk_live_|sk_test_|ghp_|gho_|ghs_|Bearer\s|AKIA|xoxb-|xoxp-|xoxs-|glpat-|npm_|pypi-|whsec_|rk_live_|rk_test_|shpat_|shpss_|shppa_)/;

  function findUnmarkedSecrets(vars: KeyValue[]): string[] {
    return vars
      .filter(v => v.key && !v.isSecret && (
        SECRET_KEY_PATTERN.test(v.key) ||
        (v.value.length > 20 && SECRET_VALUE_PATTERN.test(v.value))
      ))
      .map(v => v.key);
  }

  // Fetch cookie jar list on mount so the badge count is available immediately
  requestCookieJars();

  let descriptionOpen = $state(true);

  // ── Color palette ───────────────────────────────────────────────
  const ENV_COLORS: { name: string; hex: string }[] = [
    { name: 'red',    hex: '#ff6b6b' },
    { name: 'orange', hex: '#fd9644' },
    { name: 'yellow', hex: '#ffd43b' },
    { name: 'lime',   hex: '#a9e34b' },
    { name: 'green',  hex: '#51cf66' },
    { name: 'teal',   hex: '#20c997' },
    { name: 'blue',   hex: '#4dabf7' },
    { name: 'violet', hex: '#cc5de8' },
  ];

  // ── Variable name validation ────────────────────────────────────
  function validateVarName(key: string): string | null {
    if (!key) return null;
    if (!/^[a-z_][a-z0-9_.\-]*$/i.test(key)) {
      return 'Must start with a letter or underscore. Only letters, digits, underscores, dots, and hyphens allowed.';
    }
    return null;
  }

  // ── Resizable env list pane ───────────────────────────────────
  const LIST_MIN = 180;
  const LIST_MAX = 400;
  const LIST_DEFAULT = 240;

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

  let activeTab = $state<Tab>('environments');
  let confirmDeleteId = $state<string | null>(null);

  // Secret warning dialog state
  let secretWarningOpen = $state(false);
  let secretWarningNames = $state<string[]>([]);
  let secretWarningCallback = $state<(() => void) | null>(null);

  function saveWithSecretCheck(vars: KeyValue[], doSave: () => void) {
    const unmarked = findUnmarkedSecrets(vars);
    if (unmarked.length > 0) {
      secretWarningNames = unmarked;
      secretWarningCallback = doSave;
      secretWarningOpen = true;
    } else {
      doSave();
    }
  }

  // ── Global Variables tab ───────────────────────────────────────────
  let globalVarsDirty = $state(false);
  let editingGlobalVars: KeyValue[] = $state([]);

  // Sync the store → local editing copy.
  // Re-runs whenever globalVariables() changes, including imports that
  // re-assign the store with the same data (new object = new reference).
  $effect(() => {
    const incoming = globalVariables().map(v => ({ ...v, id: v.id ?? generateId() }));
    // Always apply: imports and init should override local edits.
    // The dirty guard previously blocked imports; we now unconditionally
    // sync and reset dirty on every store update.
    editingGlobalVars = incoming;
    globalVarsDirty = false;
  });

  function handleGlobalVarsChange(items: KeyValue[]) {
    editingGlobalVars = items;
    globalVarsDirty = true;
  }

  function saveGlobalVars() {
    saveWithSecretCheck(editingGlobalVars, () => {
      updateGlobalVariables(editingGlobalVars);
      globalVarsDirty = false;
    });
  }

  // ── Environments tab ───────────────────────────────────────────────
  let globalsExpanded = $state(false);
  let selectedEnvId = $state<string | null>(null);

  const activeGlobals = $derived(globalVariables().filter(v => v.enabled && v.key));
  let editingEnvName = $state('');
  let editingEnvColor = $state<string | undefined>(undefined);
  let editingEnvVars: KeyValue[] = $state([]);

  // Keys defined in the current environment that shadow a global variable
  const envOverriddenKeys = $derived(
    new Set(editingEnvVars.filter(v => v.enabled && v.key).map(v => v.key))
  );
  let envEditorDirty = $state(false);
  let showCustomColorPicker = $state(false);
  let customPickerPos = $state({ x: 0, y: 0 });
  const isCustomColor = $derived(editingEnvColor != null && !ENV_COLORS.some(c => c.hex === editingEnvColor));

  const selectedEnv = $derived(
    selectedEnvId ? environments().find(e => e.id === selectedEnvId) ?? null : null
  );


  function selectEnv(env: Environment) {
    if (envEditorDirty && selectedEnvId && selectedEnvId !== env.id) {
      doSaveSelectedEnv();
    }
    selectedEnvId = env.id;
    editingEnvName = env.name;
    editingEnvColor = env.color;
    editingEnvVars = env.variables.map(v => ({ ...v, id: v.id ?? generateId() }));
    envEditorDirty = false;
  }

  function handleEnvVarsChange(items: KeyValue[]) {
    editingEnvVars = items;
    envEditorDirty = true;
  }

  function handleEnvNameChange(e: Event) {
    editingEnvName = (e.target as HTMLInputElement).value;
    envEditorDirty = true;
  }

  function doSaveSelectedEnv() {
    if (!selectedEnvId) return;
    const trimmed = editingEnvName.trim();
    updateEnvironmentBatch(selectedEnvId, {
      name: trimmed || undefined,
      variables: editingEnvVars,
      color: editingEnvColor,
    });
    envEditorDirty = false;
  }

  function saveSelectedEnv() {
    if (!selectedEnvId) return;
    saveWithSecretCheck(editingEnvVars, doSaveSelectedEnv);
  }

  function handleColorPick(color: string | undefined) {
    editingEnvColor = editingEnvColor === color ? undefined : color;
    envEditorDirty = true;
  }

  function handleNewEnvironment() {
    const env = addEnvironment('New Environment');
    selectEnv(env);
  }

  function handleDeleteEnv(id: string) {
    confirmDeleteId = id;
  }

  function confirmDeleteEnv() {
    if (!confirmDeleteId) return;
    if (selectedEnvId === confirmDeleteId) {
      selectedEnvId = null;
      envEditorDirty = false;
    }
    deleteEnvironment(confirmDeleteId);
    // No explicit postMessage needed: deleteEnvironment() calls saveEnvironments() internally
    confirmDeleteId = null;
  }

  function handleDuplicateEnv(id: string) {
    duplicateEnvironment(id);
    // No explicit postMessage needed: duplicateEnvironment() calls saveEnvironments() internally
  }

  function handleSetActive(id: string) {
    setActiveEnvironment(activeEnvironmentId() === id ? null : id);
    // No explicit postMessage needed: setActiveEnvironment() calls saveEnvironments() internally
  }

  // ── .env file section ──────────────────────────────────────────────
  const envFileName = $derived(
    envFilePath() ? envFilePath().split(/[\\/]/).pop() || '.env' : null
  );

  function handleLinkEnvFile() {
    postMessage({ type: 'linkEnvFile' });
  }

  function handleUnlinkEnvFile() {
    postMessage({ type: 'unlinkEnvFile' });
  }

  // Listen for focusTab events from the extension
  onMount(() => {
    function handleFocusTab(e: Event) {
      const tab = (e as CustomEvent).detail;
      if (tab === 'global' || tab === 'environments' || tab === 'cookieJar') {
        activeTab = tab;
      }
    }
    window.addEventListener('nouto:focusTab', handleFocusTab);
    return () => window.removeEventListener('nouto:focusTab', handleFocusTab);
  });

</script>

<svelte:window />

<div class="env-panel">
  <!-- Left nav -->
  <nav class="env-nav">
    <button class="nav-item" class:active={activeTab === 'global'} onclick={() => { activeTab = 'global'; }}>
      <i class="codicon codicon-symbol-variable"></i>
      Global Variables
      {#if globalVariables().length > 0}
        <span class="tab-badge">{globalVariables().length}</span>
      {/if}
    </button>
    <button class="nav-item" class:active={activeTab === 'environments'} onclick={() => { activeTab = 'environments'; }}>
      <i class="codicon codicon-beaker"></i>
      Environments
      {#if environments().length > 0}
        <span class="tab-badge">{environments().length}</span>
      {/if}
    </button>
    <button class="nav-item" class:active={activeTab === 'cookieJar'} onclick={() => { activeTab = 'cookieJar'; }}>
      <i class="codicon codicon-globe"></i>
      Cookie Jar
      {#if cookieJars().length > 0}
        <span class="tab-badge">{cookieJars().length}</span>
      {/if}
    </button>
  </nav>

  <!-- Right content -->
  <div class="env-content">

  <!-- Content header -->
  <div class="info-toggle-bar">
    <span class="content-title">
      {#if activeTab === 'global'}Global Variables
      {:else if activeTab === 'environments'}Environment Variables
      {:else}Cookie Jar{/if}
    </span>
    <Tooltip text={descriptionOpen ? 'Hide description' : 'Show description'} position="top">
      <button
        class="info-toggle-btn"
        aria-label={descriptionOpen ? 'Hide description' : 'Show description'}
        onclick={() => (descriptionOpen = !descriptionOpen)}
        aria-expanded={descriptionOpen}
      >
        <i class="codicon codicon-info"></i>
      </button>
    </Tooltip>
  </div>
  {#if descriptionOpen}
    <div class="content-header">
      {#if activeTab === 'global'}
        <span class="content-subtitle">
          Unlike environment variables, global variables exist outside any environment. They stay constant regardless of which environment is active. This makes them ideal for values shared across your entire project, such as a team name or API version. You can reference them anywhere using <code>{'{{variable_name}}'}</code>, just like environment variables.
        </span>
      {:else if activeTab === 'environments'}
        <span class="content-subtitle">
          Environments let you define <em>separate sets</em> of variables for different contexts, such as local development, staging, or production. Common examples include a base URL, authentication tokens, or database host. Only the <em>active</em> environment's variables are injected into your requests, so you can switch contexts instantly without touching your request configuration. Reference any variable with <code>{'{{variable_name}}'}</code>.
        </span>
      {:else if activeTab === 'cookieJar'}
        <span class="content-subtitle">
          Cookie jars store cookies received from HTTP responses. You can create multiple jars to isolate cookies between different sessions or testing scenarios. The active jar is automatically used when sending requests. You can also manually add, edit, or delete individual cookies.
        </span>
      {/if}
    </div>
  {/if}

  <!-- Global Variables tab -->
  {#if activeTab === 'global'}
    <div class="tab-content">
      <div class="hint-bar">
        <span>Use <code>{'{{variableName}}'}</code> in URLs, headers, and body.</span>
        <span class="hint-priority">
          <i class="codicon codicon-info"></i>
          Priority: <span class="hint-tier">.env file</span>
          <i class="codicon codicon-arrow-right hint-arrow"></i>
          <span class="hint-tier hint-tier-active">globals</span>
          <i class="codicon codicon-arrow-right hint-arrow"></i>
          <span class="hint-tier">collection/folder</span>
          <i class="codicon codicon-arrow-right hint-arrow"></i>
          <span class="hint-tier">active environment</span>
          <span class="hint-tier-note">(highest wins)</span>
        </span>
      </div>
      <div class="editor-toolbar">
        <button class="toolbar-btn" onclick={() => postMessage({ type: 'importGlobalVariables' })}>
          <i class="codicon codicon-cloud-download"></i>
          Import
        </button>
        <button class="toolbar-btn" onclick={() => postMessage({ type: 'exportGlobalVariables' })}>
          <i class="codicon codicon-export"></i>
          Export
        </button>
        <button class="save-btn" style="margin-left: 12px;" onclick={saveGlobalVars} disabled={!globalVarsDirty}>Save</button>
      </div>
      <div class="editor-area">
        <KeyValueEditor
          items={editingGlobalVars}
          keyPlaceholder="Variable name"
          valuePlaceholder="Value"
          emptyText="No variables added yet"
          showDescription
          showSecretToggle
          keyValidator={validateVarName}
          onchange={handleGlobalVarsChange}
        />
      </div>
    </div>
  {/if}

  <!-- Environments tab -->
  {#if activeTab === 'environments'}
    <div class="tab-content env-split" bind:this={splitPaneEl}>
      <!-- Left: environment list -->
      <div class="env-list-pane" style="width: {listWidth}px; min-width: {listWidth}px;">
        <div class="pane-header">
          <span class="pane-title">Environments</span>
          <Tooltip text="New environment" position="bottom">
            <button class="icon-btn" onclick={handleNewEnvironment} aria-label="New environment">
              <i class="codicon codicon-add"></i>
            </button>
          </Tooltip>
          <Tooltip text="Import environments" position="bottom">
            <button class="icon-btn" onclick={() => postMessage({ type: 'importEnvironments' })} aria-label="Import environments">
              <i class="codicon codicon-cloud-download"></i>
            </button>
          </Tooltip>
          <Tooltip text="Export all environments" position="bottom">
            <button class="icon-btn" onclick={() => postMessage({ type: 'exportAllEnvironments' })} aria-label="Export all environments">
              <i class="codicon codicon-export"></i>
            </button>
          </Tooltip>
        </div>

        <!-- .env file section -->
        <div class="env-file-section" class:env-file-active={!!envFilePath()}>
          {#if envFilePath()}
            <div class="env-file-header">
              <i class="codicon codicon-file-code"></i>
              <span class="env-file-badge">{envFileName}</span>
              <span class="env-file-count">{envFileVariables().length} var{envFileVariables().length !== 1 ? 's' : ''}</span>
            </div>
            <div class="env-file-actions">
              <Tooltip text="Variables from this file are available in all requests" position="bottom">
                <span class="env-file-status"><i class="codicon codicon-check"></i> Linked</span>
              </Tooltip>
              <button class="text-btn danger" onclick={handleUnlinkEnvFile}>
                <i class="codicon codicon-debug-disconnect"></i>
                Unlink
              </button>
            </div>
          {:else}
            <div class="env-file-header">
              <i class="codicon codicon-file-code"></i>
              <span>.env File</span>
            </div>
            <button class="text-btn env-file-link-btn" onclick={handleLinkEnvFile}>
              <i class="codicon codicon-link"></i>
              Link .env file
            </button>
          {/if}
        </div>

        <!-- Environment list -->
        {#if environments().length === 0}
          <div class="empty-list">
            <p>No environments yet</p>
            <button class="create-btn" onclick={handleNewEnvironment}>Create Environment</button>
          </div>
        {:else}
          <div class="env-items">
            {#each environments() as env (env.id)}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="env-item"
                class:selected={selectedEnvId === env.id}
                onclick={() => selectEnv(env)}
              >
                <div class="env-item-main">
                  {#if activeEnvironmentId() === env.id}
                    <Tooltip text="Active" position="top"><i class="codicon codicon-check active-indicator"></i></Tooltip>
                  {:else}
                    <i class="codicon codicon-circle-outline inactive-indicator"></i>
                  {/if}
                  {#if env.color}
                    <span class="env-color-dot" style="background: {env.color};"></span>
                  {/if}
                  <span class="env-item-name">{env.name}</span>
                  <span class="env-item-count">{env.variables.filter(v => v.enabled).length}</span>
                </div>
                <div class="env-item-actions">
                  <Tooltip text={activeEnvironmentId() === env.id ? 'Deactivate' : 'Set active'} position="top">
                    <button
                      class="item-btn"
                      aria-label={activeEnvironmentId() === env.id ? 'Deactivate' : 'Set active'}
                      onclick={(e) => { e.stopPropagation(); handleSetActive(env.id); }}
                    >
                      <i class="codicon {activeEnvironmentId() === env.id ? 'codicon-circle-filled' : 'codicon-circle-outline'}"></i>
                    </button>
                  </Tooltip>
                  <Tooltip text="Duplicate" position="top">
                    <button
                      class="item-btn"
                      aria-label="Duplicate"
                      onclick={(e) => { e.stopPropagation(); handleDuplicateEnv(env.id); }}
                    >
                      <i class="codicon codicon-copy"></i>
                    </button>
                  </Tooltip>
                  <Tooltip text="Export" position="top">
                    <button
                      class="item-btn"
                      aria-label="Export"
                      onclick={(e) => { e.stopPropagation(); postMessage({ type: 'exportEnvironment', data: { id: env.id } }); }}
                    >
                      <i class="codicon codicon-export"></i>
                    </button>
                  </Tooltip>
                  <Tooltip text="Delete" position="top">
                    <button
                      class="item-btn danger"
                      aria-label="Delete"
                      onclick={(e) => { e.stopPropagation(); handleDeleteEnv(env.id); }}
                    >
                      <i class="codicon codicon-trash"></i>
                    </button>
                  </Tooltip>
                </div>
              </div>
            {/each}
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

      <!-- Right: editor pane -->
      <div class="env-editor-pane">
        {#if selectedEnv}
          <div class="editor-pane-title">
            <i class="codicon codicon-settings-gear"></i>
            Edit Environment Settings
          </div>
          <!-- Global variables toggle bar -->
          <div class="globals-toggle-wrap">
            <Tooltip text="Click to view active global variables" position="bottom">
              <button class="globals-toggle-bar" onclick={() => (globalsExpanded = !globalsExpanded)}>
                <i class="codicon codicon-symbol-variable"></i>
                <span>Also active: <strong>{activeGlobals.length}</strong> global variable{activeGlobals.length !== 1 ? 's' : ''}</span>
                <i class="codicon codicon-chevron-right" style="margin-left: auto;"></i>
              </button>
            </Tooltip>
          </div>
          <div class="hint-bar">
            <span>Use <code>{'{{variableName}}'}</code> in URLs, headers, and body.</span>
            <span class="hint-priority">
              <i class="codicon codicon-info"></i>
              Priority: <span class="hint-tier">.env file</span>
              <i class="codicon codicon-arrow-right hint-arrow"></i>
              <span class="hint-tier">globals</span>
              <i class="codicon codicon-arrow-right hint-arrow"></i>
              <span class="hint-tier">collection/folder</span>
              <i class="codicon codicon-arrow-right hint-arrow"></i>
              <span class="hint-tier hint-tier-active">active environment</span>
              <span class="hint-tier-note">(highest wins)</span>
            </span>
          </div>
          <div class="editor-header">
            <!-- Row 1: Name + Save -->
            <div class="editor-header-row">
              <label class="env-name-label" for="env-name-input">Name</label>
              <input
                id="env-name-input"
                class="env-name-input"
                type="text"
                value={editingEnvName}
                oninput={handleEnvNameChange}
                placeholder="Environment name"
              />
              <button class="save-btn" onclick={saveSelectedEnv} disabled={!envEditorDirty}>
                Save
              </button>
            </div>
            <!-- Row 2: Color picker -->
            <div class="editor-header-row editor-color-row">
              <span class="env-color-label">Color</span>
              <div class="color-picker">
                <Tooltip text="No color" position="top">
                  <button
                    class="color-swatch color-swatch-none"
                    class:active={!editingEnvColor}
                    aria-label="No color"
                    onclick={() => handleColorPick(undefined)}
                  >
                    <i class="codicon codicon-close" style="font-size: 8px;"></i>
                  </button>
                </Tooltip>
                {#each ENV_COLORS as c}
                  <Tooltip text={c.name} position="top">
                    <button
                      class="color-swatch"
                      class:active={editingEnvColor === c.hex}
                      aria-label={c.name}
                      style="background: {c.hex};"
                      onclick={() => handleColorPick(c.hex)}
                    ></button>
                  </Tooltip>
                {/each}
                <Tooltip text="Custom color" position="top">
                  <button
                    class="color-swatch color-swatch-custom"
                    class:active={isCustomColor}
                    aria-label="Custom color"
                    style={isCustomColor ? `background: ${editingEnvColor};` : ''}
                    onclick={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      customPickerPos = { x: rect.left, y: rect.bottom + 6 };
                      showCustomColorPicker = !showCustomColorPicker;
                    }}
                  >
                    {#if isCustomColor}
                      <i class="codicon codicon-check" style="font-size: 10px; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.3);"></i>
                    {/if}
                  </button>
                </Tooltip>
              </div>
              {#if showCustomColorPicker}
                <ColorPickerPopover
                  color={editingEnvColor}
                  x={customPickerPos.x}
                  y={customPickerPos.y}
                  onchange={(hex) => { editingEnvColor = hex; envEditorDirty = true; }}
                  onclose={() => { showCustomColorPicker = false; }}
                />
              {/if}
            </div>
          </div>

          <!-- Sliding globals panel -->
          <SlidePanel
            open={globalsExpanded}
            title="Global Variables"
            onclose={() => (globalsExpanded = false)}
          >
            {#if activeGlobals.length === 0}
              <p class="slide-empty">No global variables defined.</p>
            {:else}
              {#each activeGlobals as v}
                {@const overridden = envOverriddenKeys.has(v.key)}
                <div class="slide-row" class:slide-row-overridden={overridden}>
                  <span class="slide-key">{v.key}</span>
                  <span class="slide-sep">=</span>
                  <span class="slide-value">{v.value}</span>
                  {#if overridden}
                    <Tooltip text="Overridden by the active environment" position="top"><span class="slide-override-badge">env wins</span></Tooltip>
                  {/if}
                </div>
              {/each}
            {/if}

            {#snippet footer()}
              <button class="slide-edit-btn" onclick={() => { activeTab = 'global'; globalsExpanded = false; }}>
                <i class="codicon codicon-edit"></i>
                Edit global variables
              </button>
            {/snippet}
          </SlidePanel>

          <div class="editor-area">
            <KeyValueEditor
              items={editingEnvVars}
              keyPlaceholder="Variable name"
              valuePlaceholder="Value"
              emptyText="No variables added yet"
              showDescription
              showSecretToggle
              keyValidator={validateVarName}
              onchange={handleEnvVarsChange}
            />
          </div>
        {:else}
          <div class="no-selection">
            <i class="codicon codicon-beaker" style="font-size: 40px; opacity: 0.3;"></i>
            <p>Select an environment to edit its variables</p>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Cookie Jar tab -->
  {#if activeTab === 'cookieJar'}
    <div class="tab-content cookie-jar-tab">
      <CookieJarPanel />
    </div>
  {/if}

  </div><!-- /env-content -->
</div>

<ConfirmDialog
  open={confirmDeleteId !== null}
  title="Delete environment"
  message="This environment and all its variables will be permanently removed. This action cannot be undone."
  confirmLabel="Delete"
  variant="danger"
  onconfirm={confirmDeleteEnv}
  oncancel={() => (confirmDeleteId = null)}
/>

<ConfirmDialog
  open={secretWarningOpen}
  title="Possible secrets detected"
  message={`${secretWarningNames.length} variable${secretWarningNames.length === 1 ? '' : 's'} may contain secrets but ${secretWarningNames.length === 1 ? 'is' : 'are'} not marked as secret: ${secretWarningNames.join(', ')}. Values will be saved to disk in plain text.`}
  confirmLabel="Save Anyway"
  cancelLabel="Go Back"
  variant="warning"
  onconfirm={() => {
    secretWarningOpen = false;
    secretWarningCallback?.();
    secretWarningCallback = null;
  }}
  oncancel={() => {
    secretWarningOpen = false;
    secretWarningCallback = null;
  }}
/>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    background: var(--hf-editor-background);
    color: var(--hf-foreground);
    font-family: var(--hf-font-family);
    font-size: var(--hf-font-size);
    height: 100vh;
    overflow: hidden;
  }

  .env-panel {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  /* Horizontal tab bar */
  .env-nav {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    gap: 0;
    padding: 16px 8px 0;
    background: var(--hf-sideBar-background, var(--hf-editor-background));
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
    overflow: hidden;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 14px;
    height: 40px;
    background: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    color: var(--hf-foreground);
    font-size: 13px;
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.15s, border-color 0.15s, background 0.15s;
    white-space: nowrap;
    border-radius: 0;
    flex-shrink: 0;
  }

  .nav-item:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
  }

  .nav-item.active {
    opacity: 1;
    border-bottom-color: var(--hf-focusBorder);
    background: transparent;
    color: var(--hf-foreground);
  }

  .nav-item .codicon {
    font-size: 14px;
    flex-shrink: 0;
  }

  .tab-badge {
    padding: 1px 5px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    border-radius: 8px;
    font-size: 10px;
  }

  /* Right content area */
  .env-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  /* Tab content */
  .tab-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .cookie-jar-tab {
    overflow: hidden;
  }

  /* Content header */
  .info-toggle-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
  }

  .content-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--hf-foreground);
  }

  .info-toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    background: transparent;
    border: none;
    border-radius: 3px;
    color: var(--hf-descriptionForeground);
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 0.15s, background 0.15s;
  }

  .info-toggle-btn:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
  }

  .content-header {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 0 16px 12px;
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
  }

  .content-subtitle {
    font-size: 12px;
    color: var(--hf-descriptionForeground);
    padding: 8px 12px;
    background: var(--hf-textBlockQuote-background);
    border-left: 3px solid var(--hf-textBlockQuote-border);
    border-radius: 0 4px 4px 0;
    line-height: 1.5;
    margin: 0;
  }

  .content-subtitle code {
    background: var(--hf-textCodeBlock-background);
    padding: 1px 4px;
    border-radius: 3px;
    font-family: var(--hf-editor-font-family), monospace;
  }

  .content-subtitle em {
    font-style: italic;
    color: var(--hf-foreground);
  }

  .editor-toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 16px;
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
  }

  .toolbar-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    background: transparent;
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    color: var(--hf-foreground);
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .toolbar-btn:hover {
    background: var(--hf-list-hoverBackground);
  }

  .toolbar-btn .codicon {
    font-size: 13px;
  }

  .editor-area {
    flex: 1;
    overflow-y: auto;
    padding: 0 16px;
  }

  /* Environments tab split */
  .env-split {
    flex-direction: row !important;
  }

  .env-list-pane {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    flex-shrink: 0;
  }

  /* Resize handle between env list and editor */
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

  /* .env file section */
  .env-file-section {
    margin: 8px 10px;
    padding: 10px 12px;
    border: 1px dashed var(--hf-panel-border);
    border-radius: 5px;
    font-size: 12px;
    flex-shrink: 0;
    background: var(--hf-editor-background);
  }

  .env-file-section.env-file-active {
    border-style: solid;
    border-left: 3px solid #3fb950;
    background: rgba(63, 185, 80, 0.06);
  }

  .env-file-header {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--hf-foreground);
    font-weight: 600;
  }

  .env-file-badge {
    font-size: 11px;
    padding: 1px 6px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    border-radius: 3px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 160px;
  }

  .env-file-count {
    font-size: 11px;
    color: var(--hf-descriptionForeground);
    margin-left: auto;
  }

  .env-file-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 8px;
  }

  .env-file-status {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: #3fb950;
  }

  .env-file-link-btn {
    margin-top: 6px;
    width: 100%;
    justify-content: center;
  }

  .text-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: transparent;
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 3px;
    color: var(--hf-foreground);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .text-btn:hover {
    background: var(--hf-list-hoverBackground);
  }

  .text-btn.danger:hover {
    color: var(--hf-errorForeground, #f44336);
    border-color: var(--hf-errorForeground, #f44336);
  }

  /* Env items list */
  .env-items {
    flex: 1;
    overflow-y: auto;
  }

  .env-item {
    display: flex;
    align-items: center;
    padding: 0 12px;
    height: 36px;
    cursor: pointer;
    border-bottom: 1px solid transparent;
    transition: background 0.1s;
    gap: 4px;
  }

  .env-item:hover {
    background: var(--hf-list-hoverBackground);
  }

  .env-item.selected {
    background: var(--hf-list-activeSelectionBackground);
    color: var(--hf-list-activeSelectionForeground);
  }

  .env-item-main {
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

  .env-color-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .env-item-name {
    flex: 1;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .env-item-count {
    font-size: 10px;
    padding: 1px 5px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    border-radius: 8px;
    flex-shrink: 0;
  }

  .env-item-actions {
    display: none;
    gap: 2px;
    flex-shrink: 0;
  }

  .env-item:hover .env-item-actions,
  .env-item.selected .env-item-actions {
    display: flex;
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

  /* Right editor pane */
  .env-editor-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
    position: relative;
  }

  .editor-pane-title {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    font-size: 13px;
    font-weight: 600;
    color: var(--hf-foreground);
    background: var(--hf-sideBarSectionHeader-background);
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
  }

  .editor-pane-title .codicon {
    font-size: 14px;
    opacity: 0.7;
  }

  .editor-header {
    display: flex;
    flex-direction: column;
    gap: 0;
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
  }

  .editor-header-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px 8px;
  }

  .editor-color-row {
    padding: 0 16px 10px;
    gap: 8px;
  }

  .env-color-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--hf-descriptionForeground);
    flex-shrink: 0;
    white-space: nowrap;
    min-width: 38px;
  }

  .env-name-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--hf-descriptionForeground);
    flex-shrink: 0;
    white-space: nowrap;
  }

  .env-name-input {
    flex: 1;
    padding: 6px 10px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    font-size: 14px;
    font-weight: 600;
    outline: none;
  }

  .env-name-input:focus {
    border-color: var(--hf-focusBorder);
  }

  .hint-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 7px 16px;
    font-size: 11px;
    color: var(--hf-descriptionForeground);
    background: var(--hf-textBlockQuote-background);
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .hint-bar code {
    background: var(--hf-textCodeBlock-background);
    padding: 1px 4px;
    border-radius: 3px;
    font-family: var(--hf-editor-font-family), monospace;
  }

  .hint-priority {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
    opacity: 0.8;
  }

  .hint-priority .codicon {
    font-size: 11px;
    opacity: 0.6;
  }

  .hint-tier {
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--hf-textCodeBlock-background);
    font-family: var(--hf-editor-font-family), monospace;
    font-size: 10px;
  }

  .hint-tier-active {
    background: color-mix(in srgb, var(--hf-charts-green, #49cc90) 15%, var(--hf-textCodeBlock-background));
    color: var(--hf-charts-green, #49cc90);
  }

  .hint-arrow {
    opacity: 0.35;
    font-size: 10px;
  }

  .hint-tier-note {
    opacity: 0.5;
    font-style: italic;
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

  /* Buttons */
  .save-btn {
    padding: 6px 14px;
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: background 0.15s;
    flex-shrink: 0;
  }

  .save-btn:hover:not(:disabled) {
    background: var(--hf-button-hoverBackground);
  }

  .save-btn:disabled {
    opacity: 0.45;
    cursor: default;
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

  /* Globals toggle bar container */
  .globals-toggle-wrap {
    flex-shrink: 0;
    width: 100%;
  }

  .globals-toggle-wrap :global(.tooltip-wrapper) {
    width: 100%;
    display: flex;
  }

  /* Globals toggle bar */
  .globals-toggle-bar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    padding: 7px 14px 7px 11px;
    background: color-mix(in srgb, var(--hf-charts-green, #49cc90) 6%, var(--hf-editor-background));
    border: none;
    border-top: 1px solid color-mix(in srgb, var(--hf-charts-green, #49cc90) 25%, var(--hf-panel-border));
    border-bottom: 1px solid color-mix(in srgb, var(--hf-charts-green, #49cc90) 25%, var(--hf-panel-border));
    border-left: 3px solid var(--hf-charts-green, #49cc90);
    color: var(--hf-descriptionForeground);
    font-size: 11px;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s, color 0.15s;
  }

  .globals-toggle-bar:hover {
    background: color-mix(in srgb, var(--hf-charts-green, #49cc90) 12%, var(--hf-editor-background));
    color: var(--hf-foreground);
  }

  .globals-toggle-bar strong {
    color: var(--hf-charts-green, #49cc90);
    font-weight: 600;
  }

  .globals-toggle-bar .codicon {
    font-size: 13px;
    flex-shrink: 0;
    color: var(--hf-charts-green, #49cc90);
    opacity: 0.85;
  }

  .slide-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    font-size: 12px;
    border-bottom: 1px solid var(--hf-panel-border);
    opacity: 0.85;
  }

  .slide-row:last-child {
    border-bottom: none;
  }

  .slide-row-overridden .slide-key,
  .slide-row-overridden .slide-sep,
  .slide-row-overridden .slide-value {
    opacity: 0.4;
    text-decoration: line-through;
  }

  .slide-override-badge {
    flex-shrink: 0;
    margin-left: auto;
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    padding: 1px 5px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--hf-charts-yellow, #f0c040) 18%, transparent);
    color: var(--hf-charts-yellow, #f0c040);
    border: 1px solid color-mix(in srgb, var(--hf-charts-yellow, #f0c040) 40%, transparent);
  }

  .slide-key {
    font-family: var(--hf-editor-font-family), monospace;
    color: var(--hf-symbolIcon-variableForeground, var(--hf-foreground));
    flex-shrink: 0;
    min-width: 80px;
  }

  .slide-sep {
    color: var(--hf-descriptionForeground);
    opacity: 0.4;
    flex-shrink: 0;
  }

  .slide-value {
    font-family: var(--hf-editor-font-family), monospace;
    color: var(--hf-descriptionForeground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .slide-empty {
    margin: 0;
    padding: 12px 0;
    color: var(--hf-descriptionForeground);
    font-size: 12px;
    font-style: italic;
    text-align: center;
  }

  .slide-edit-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 10px;
    background: var(--hf-button-secondaryBackground, transparent);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    color: var(--hf-foreground);
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .slide-edit-btn:hover {
    background: var(--hf-list-hoverBackground);
    border-color: var(--hf-focusBorder);
  }

  /* Color picker */
  .color-picker {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .color-swatch {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: transform 0.1s, border-color 0.15s;
    padding: 0;
    flex-shrink: 0;
  }

  .color-swatch:hover {
    transform: scale(1.2);
  }

  .color-swatch.active {
    border-color: var(--hf-foreground);
    transform: scale(1.15);
  }

  .color-swatch-none {
    background: var(--hf-input-background);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--hf-descriptionForeground);
  }

  .color-swatch-none.active {
    border-color: var(--hf-foreground);
  }

  .color-swatch-custom {
    background: conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .color-swatch-custom.active {
    border-color: var(--hf-foreground);
  }
</style>
