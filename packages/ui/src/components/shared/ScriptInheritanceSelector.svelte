<script lang="ts">
  import type { ScriptInheritance } from '../../types';

  interface Props {
    mode?: ScriptInheritance;
    hasInheritedScripts?: boolean;
    onchange?: (mode: ScriptInheritance) => void;
  }
  let { mode, hasInheritedScripts, onchange }: Props = $props();

  const options: { id: ScriptInheritance; label: string; icon: string }[] = [
    { id: 'inherit', label: 'Inherit', icon: 'codicon-arrow-up' },
    { id: 'own', label: 'Own Only', icon: 'codicon-code' },
  ];

  function handleSelect(id: ScriptInheritance) {
    onchange?.(id);
  }

  const effectiveMode = $derived(mode || 'inherit');
</script>

<div class="script-inheritance">
  <span class="section-label">Script Inheritance</span>
  <div class="inheritance-options" role="group" aria-label="Script inheritance mode">
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
  {#if effectiveMode === 'inherit' && hasInheritedScripts}
    <div class="inherited-info">
      <span class="codicon codicon-info"></span>
      <span>Collection/folder scripts will run before this request's scripts</span>
    </div>
  {:else if effectiveMode === 'inherit' && !hasInheritedScripts}
    <div class="inherited-info muted">
      <span class="codicon codicon-info"></span>
      <span>No inherited scripts found</span>
    </div>
  {:else if effectiveMode === 'own'}
    <div class="inherited-info">
      <span class="codicon codicon-info"></span>
      <span>Only this request's scripts will run</span>
    </div>
  {/if}
</div>

<style>
  .script-inheritance {
    margin-bottom: 12px;
  }

  .section-label {
    display: block;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--hf-descriptionForeground);
    margin-bottom: 8px;
  }

  .inheritance-options {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
  }

  .inheritance-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: var(--hf-input-background);
    color: var(--hf-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
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
    gap: 6px;
    padding: 6px 10px;
    background: var(--hf-textBlockQuote-background);
    border-left: 3px solid var(--hf-textLink-foreground);
    border-radius: 0 4px 4px 0;
    font-size: 12px;
    color: var(--hf-descriptionForeground);
  }

  .inherited-info.muted {
    opacity: 0.7;
  }

  .inherited-info strong {
    color: var(--hf-foreground);
  }
</style>
