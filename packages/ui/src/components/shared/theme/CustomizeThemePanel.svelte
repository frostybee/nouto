<script lang="ts">
  // Inline editor for one custom (engine) theme: rename, edit anchors with
  // live repaint, delete. Anchor edits re-derive the whole palette (pinned
  // colours from a VS Code import are dropped) — say so up front.
  import {
    getCustomTheme,
    updateCustomTheme,
    deleteCustomTheme,
    type ThemePreset,
  } from '../../../stores/theme.svelte';
  import ThemeAnchorFields from './ThemeAnchorFields.svelte';
  import ConfirmDialog from '../ConfirmDialog.svelte';

  interface Props {
    themeId: string;
    onclose: () => void;
  }

  let { themeId, onclose }: Props = $props();

  const preset = $derived<ThemePreset | undefined>(getCustomTheme(themeId));
  const hasPinnedColours = $derived(
    !!preset?.overrides && Object.keys(preset.overrides).length > 0,
  );

  let confirmDelete = $state(false);

  function rename(e: Event) {
    const name = (e.currentTarget as HTMLInputElement).value.trim();
    if (name) updateCustomTheme(themeId, { name });
  }

  function remove() {
    confirmDelete = false;
    deleteCustomTheme(themeId);
    onclose();
  }
</script>

{#if preset}
  <div class="customize-panel">
    <div class="customize-header">
      <input
        class="theme-name-input"
        type="text"
        value={preset.name}
        onchange={rename}
        aria-label="Theme name"
        spellcheck="false"
      />
      <span class="mode-badge">{preset.mode}</span>
      <button class="icon-btn" onclick={onclose} aria-label="Close editor" title="Close">
        <i class="codicon codicon-close"></i>
      </button>
    </div>

    {#if hasPinnedColours}
      <p class="customize-note">
        This theme carries colours pinned from its source. Changing any value below re-derives
        the full palette from the four anchors.
      </p>
    {/if}

    <ThemeAnchorFields
      accent={preset.accent}
      background={preset.background}
      foreground={preset.foreground}
      contrast={preset.contrast}
      onchange={(patch) => updateCustomTheme(themeId, patch)}
    />

    <div class="customize-actions">
      <button class="link-btn danger" onclick={() => (confirmDelete = true)}>
        <i class="codicon codicon-trash"></i>
        Delete theme
      </button>
    </div>
  </div>

  <ConfirmDialog
    open={confirmDelete}
    title="Delete theme"
    message={`Delete "${preset.name}"? This cannot be undone.`}
    confirmLabel="Delete"
    variant="danger"
    onconfirm={remove}
    oncancel={() => (confirmDelete = false)}
  />
{/if}

<style>
  .customize-panel {
    display: flex;
    flex-direction: column;
    gap: 0.923rem;
    padding: 1rem 1.077rem;
    margin-bottom: 1.538rem;
    background: var(--hf-sideBar-background);
    border: 1px solid var(--hf-panel-border);
    border-radius: 0.462rem;
  }

  .customize-header {
    display: flex;
    align-items: center;
    gap: 0.615rem;
  }

  .theme-name-input {
    flex: 1;
    padding: 0.385rem 0.538rem;
    font-size: 1.077rem;
    font-weight: 600;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border);
    border-radius: 0.308rem;
  }

  .theme-name-input:focus {
    outline: 1px solid var(--hf-focusBorder);
    outline-offset: -1px;
  }

  .mode-badge {
    font-size: 0.769rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.154rem 0.462rem;
    border-radius: 0.231rem;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.846rem;
    height: 1.846rem;
    background: transparent;
    border: none;
    border-radius: 0.308rem;
    color: var(--hf-foreground);
    cursor: pointer;
  }

  .icon-btn:hover {
    background: var(--hf-toolbar-hoverBackground);
  }

  .customize-note {
    margin: 0;
    font-size: 0.846rem;
    color: var(--hf-descriptionForeground);
  }

  .customize-actions {
    display: flex;
    justify-content: flex-end;
    padding-top: 0.308rem;
    border-top: 1px solid var(--hf-panel-border);
  }

  .link-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.385rem;
    padding: 0.385rem 0.615rem;
    font-size: 0.923rem;
    background: transparent;
    border: 1px solid var(--hf-panel-border);
    border-radius: 0.308rem;
    color: var(--hf-foreground);
    cursor: pointer;
  }

  .link-btn:hover {
    background: var(--hf-toolbar-hoverBackground);
  }

  .link-btn.danger {
    color: var(--hf-errorForeground);
  }
</style>
