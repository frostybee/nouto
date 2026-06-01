<script lang="ts">
  import type { InheritedScriptEntry } from '../../stores/environment.svelte';

  interface Props {
    inheritedScripts?: InheritedScriptEntry[];
    activePhase?: 'pre' | 'post';
  }
  let { inheritedScripts = [], activePhase = 'pre' }: Props = $props();

  const filteredScripts = $derived(
    inheritedScripts
      .filter(s => activePhase === 'pre' ? s.preRequest.trim() : s.postResponse.trim())
      .map(s => ({
        level: s.level,
        source: activePhase === 'pre' ? s.preRequest.trim() : s.postResponse.trim(),
      }))
  );
</script>

{#if filteredScripts.length > 0}
  <div class="inherited-scripts">
    <div class="section-label">
      <span class="codicon codicon-arrow-up"></span>
      Inherited Scripts
    </div>
    <div class="scripts-list">
      {#each filteredScripts as script}
        <div class="script-entry">
          <div class="script-header">
            <span class="script-level">{script.level}</span>
            <span class="badge">inherited</span>
          </div>
          <pre class="script-preview">{script.source}</pre>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .inherited-scripts {
    margin-bottom: 0.923rem;
    padding: 0.615rem;
    background: var(--hf-textBlockQuote-background);
    border-radius: 0.308rem;
    border: 1px solid var(--hf-panel-border);
    opacity: 0.8;
  }

  .section-label {
    display: flex;
    align-items: center;
    gap: 0.462rem;
    font-size: 0.846rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--hf-descriptionForeground);
    margin-bottom: 0.615rem;
  }

  .scripts-list {
    display: flex;
    flex-direction: column;
    gap: 0.462rem;
  }

  .script-entry {
    border-radius: 0.231rem;
    background: var(--hf-editor-background);
    overflow: hidden;
  }

  .script-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.308rem 0.615rem;
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .script-level {
    font-size: 0.923rem;
    font-weight: 600;
    color: var(--hf-symbolIcon-propertyForeground, #9cdcfe);
  }

  .badge {
    font-size: 0.769rem;
    padding: 0.077rem 0.462rem;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    border-radius: 0.769rem;
    flex-shrink: 0;
  }

  .script-preview {
    margin: 0;
    padding: 0.462rem 0.615rem;
    font-size: 0.923rem;
    font-family: var(--hf-editor-font-family), monospace;
    color: var(--hf-foreground);
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 6.154rem;
    overflow: auto;
    opacity: 0.85;
  }
</style>
