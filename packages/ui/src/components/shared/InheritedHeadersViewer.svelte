<script lang="ts">
  import type { KeyValue } from '../../types';

  interface Props {
    inheritedHeaders?: KeyValue[];
  }
  let { inheritedHeaders = [] }: Props = $props();
</script>

{#if inheritedHeaders.length > 0}
  <div class="inherited-headers">
    <div class="section-label">
      <span class="codicon codicon-arrow-up"></span>
      Inherited Headers
    </div>
    <div class="headers-list">
      {#each inheritedHeaders as header}
        <div class="header-row" class:disabled={!header.enabled}>
          <span class="header-key">{header.key}</span>
          <span class="separator">:</span>
          <span class="header-value">{header.value}</span>
          <span class="badge">inherited</span>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .inherited-headers {
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

  .headers-list {
    display: flex;
    flex-direction: column;
    gap: 0.308rem;
  }

  .header-row {
    display: flex;
    align-items: center;
    gap: 0.462rem;
    padding: 0.308rem 0.615rem;
    font-size: 0.923rem;
    font-family: var(--hf-editor-font-family), monospace;
    border-radius: 0.231rem;
    background: var(--hf-editor-background);
  }

  .header-row.disabled {
    opacity: 0.5;
  }

  .header-key {
    color: var(--hf-symbolIcon-propertyForeground, #9cdcfe);
    font-weight: 600;
  }

  .separator {
    color: var(--hf-descriptionForeground);
  }

  .header-value {
    flex: 1;
    color: var(--hf-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge {
    font-size: 0.769rem;
    padding: 0.077rem 0.462rem;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    border-radius: 0.769rem;
    flex-shrink: 0;
  }
</style>
