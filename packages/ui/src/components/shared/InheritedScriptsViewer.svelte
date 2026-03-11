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
    margin-bottom: 12px;
    padding: 8px;
    background: var(--hf-textBlockQuote-background);
    border-radius: 4px;
    border: 1px solid var(--hf-panel-border);
    opacity: 0.8;
  }

  .section-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--hf-descriptionForeground);
    margin-bottom: 8px;
  }

  .scripts-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .script-entry {
    border-radius: 3px;
    background: var(--hf-editor-background);
    overflow: hidden;
  }

  .script-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px;
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .script-level {
    font-size: 12px;
    font-weight: 600;
    color: var(--hf-symbolIcon-propertyForeground, #9cdcfe);
  }

  .badge {
    font-size: 10px;
    padding: 1px 6px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    border-radius: 10px;
    flex-shrink: 0;
  }

  .script-preview {
    margin: 0;
    padding: 6px 8px;
    font-size: 12px;
    font-family: var(--hf-editor-font-family), monospace;
    color: var(--hf-foreground);
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 80px;
    overflow: auto;
    opacity: 0.85;
  }
</style>
