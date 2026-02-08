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
    margin-bottom: 12px;
    padding: 8px;
    background: var(--vscode-textBlockQuote-background);
    border-radius: 4px;
    border: 1px solid var(--vscode-panel-border);
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
    color: var(--vscode-descriptionForeground);
    margin-bottom: 8px;
  }

  .headers-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .header-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    font-size: 12px;
    font-family: var(--vscode-editor-font-family), monospace;
    border-radius: 3px;
    background: var(--vscode-editor-background);
  }

  .header-row.disabled {
    opacity: 0.5;
  }

  .header-key {
    color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe);
    font-weight: 500;
  }

  .separator {
    color: var(--vscode-descriptionForeground);
  }

  .header-value {
    flex: 1;
    color: var(--vscode-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge {
    font-size: 10px;
    padding: 1px 6px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 10px;
    flex-shrink: 0;
  }
</style>
