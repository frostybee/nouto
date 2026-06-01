<script lang="ts">
  import type { AuthInheritance } from '../../types';

  interface Props {
    mode?: AuthInheritance;
    inheritedFromName?: string;
    onchange?: (mode: AuthInheritance) => void;
  }
  let { mode, inheritedFromName, onchange }: Props = $props();

  const options: { id: AuthInheritance; label: string; icon: string }[] = [
    { id: 'inherit', label: 'Inherit', icon: 'codicon-arrow-up' },
    { id: 'none', label: 'No Auth', icon: 'codicon-close' },
    { id: 'own', label: 'Own Auth', icon: 'codicon-key' },
  ];

  function handleSelect(id: AuthInheritance) {
    onchange?.(id);
  }

  const effectiveMode = $derived(mode || 'own');
</script>

<div class="auth-inheritance">
  <span class="section-label">Authorization</span>
  <div class="inheritance-options" role="group" aria-label="Auth inheritance mode">
    {#each options as opt}
      <button
        class="inheritance-btn"
        class:active={effectiveMode === opt.id}
        onclick={() => handleSelect(opt.id)}
      >
        <span class="codicon {opt.icon}"></span>
        <span>{opt.label}</span>
      </button>
    {/each}
  </div>
  {#if effectiveMode === 'inherit' && inheritedFromName}
    <div class="inherited-info">
      <span class="codicon codicon-info"></span>
      <span>Using auth from <strong>{inheritedFromName}</strong></span>
    </div>
  {:else if effectiveMode === 'inherit' && !inheritedFromName}
    <div class="inherited-info warning">
      <span class="codicon codicon-warning"></span>
      <span>No parent auth configured</span>
    </div>
  {:else if effectiveMode === 'none'}
    <div class="inherited-info">
      <span class="codicon codicon-lock"></span>
      <span>No authentication will be sent</span>
    </div>
  {/if}
</div>

<style>
  .auth-inheritance {
    margin-bottom: 0.923rem;
  }

  .section-label {
    display: block;
    font-size: 0.846rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--hf-descriptionForeground);
    margin-bottom: 0.615rem;
  }

  .inheritance-options {
    display: flex;
    gap: 0.462rem;
    margin-bottom: 0.615rem;
  }

  .inheritance-btn {
    display: flex;
    align-items: center;
    gap: 0.462rem;
    padding: 0.462rem 0.923rem;
    background: var(--hf-input-background);
    color: var(--hf-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 0.308rem;
    cursor: pointer;
    font-size: 0.923rem;
    transition: all 0.15s;
  }

  .inheritance-btn:hover {
    background: var(--hf-list-hoverBackground);
  }

  .inheritance-btn.active {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border-color: var(--hf-button-background);
  }

  .inherited-info {
    display: flex;
    align-items: center;
    gap: 0.462rem;
    padding: 0.462rem 0.769rem;
    background: var(--hf-textBlockQuote-background);
    border-left: 3px solid var(--hf-textLink-foreground);
    border-radius: 0 0.308rem 0.308rem 0;
    font-size: 0.923rem;
    color: var(--hf-descriptionForeground);
  }

  .inherited-info.warning {
    border-left-color: var(--hf-editorWarning-foreground);
  }

  .inherited-info strong {
    color: var(--hf-foreground);
  }
</style>
