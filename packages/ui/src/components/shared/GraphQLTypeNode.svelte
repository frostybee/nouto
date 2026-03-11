<script lang="ts">
  import type { GraphQLField, GraphQLInputValue, GraphQLTypeRef } from '../../types';
  import { copyToClipboard } from '../../lib/clipboard';
  import Tooltip from './Tooltip.svelte';

  interface Props {
    field: GraphQLField | GraphQLInputValue;
    showArgs?: boolean;
  }
  let { field, showArgs = true }: Props = $props();

  let expanded = $state(false);

  function formatTypeRef(ref: GraphQLTypeRef): string {
    if (ref.kind === 'NON_NULL' && ref.ofType) {
      return `${formatTypeRef(ref.ofType)}!`;
    }
    if (ref.kind === 'LIST' && ref.ofType) {
      return `[${formatTypeRef(ref.ofType)}]`;
    }
    return ref.name || 'Unknown';
  }

  function getTypeName(ref: GraphQLTypeRef): string | undefined {
    if (ref.kind === 'NON_NULL' || ref.kind === 'LIST') {
      return ref.ofType ? getTypeName(ref.ofType) : undefined;
    }
    return ref.name || undefined;
  }

  const hasArgs = $derived(showArgs && 'args' in field && field.args && field.args.length > 0);
  const isDeprecated = $derived('isDeprecated' in field && field.isDeprecated);
  const deprecationReason = $derived('deprecationReason' in field ? field.deprecationReason : undefined);
</script>

<div class="type-node" class:deprecated={isDeprecated}>
  <div class="field-row">
    {#if hasArgs}
      <Tooltip text="Toggle arguments" position="top">
        <button class="expand-btn" onclick={() => expanded = !expanded} aria-label="Toggle arguments">
          <span class="codicon" class:codicon-chevron-right={!expanded} class:codicon-chevron-down={expanded}></span>
        </button>
      </Tooltip>
    {:else}
      <span class="expand-spacer"></span>
    {/if}

    <Tooltip text="Click to copy field name" position="top">
      <button class="field-name" onclick={handleCopyName} aria-label="Copy field name">
        {field.name}
      </button>
    </Tooltip>

    {#if hasArgs}
      <span class="args-hint">({('args' in field ? field.args : []).map(a => a.name).join(', ')})</span>
    {/if}

    <span class="field-type">
      : {formatTypeRef(field.type)}
    </span>

    {#if isDeprecated}
      <Tooltip text={deprecationReason || 'Deprecated'} position="top">
        <span class="deprecated-badge">DEPRECATED</span>
      </Tooltip>
    {/if}
  </div>

  {#if field.description}
    <div class="field-description">{field.description}</div>
  {/if}

  {#if expanded && hasArgs && 'args' in field}
    <div class="args-list">
      {#each field.args as arg}
        <div class="arg-item">
          <span class="arg-name">{arg.name}</span>
          <span class="arg-type">: {formatTypeRef(arg.type)}</span>
          {#if arg.defaultValue}
            <span class="arg-default"> = {arg.defaultValue}</span>
          {/if}
          {#if arg.description}
            <span class="arg-description">{arg.description}</span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .type-node {
    padding: 2px 0;
  }

  .type-node.deprecated {
    opacity: 0.6;
  }

  .field-row {
    display: flex;
    align-items: center;
    gap: 2px;
    min-height: 22px;
  }

  .expand-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    background: none;
    border: none;
    color: var(--hf-foreground);
    cursor: pointer;
    opacity: 0.7;
    flex-shrink: 0;
  }

  .expand-btn:hover {
    opacity: 1;
  }

  .expand-spacer {
    width: 16px;
    flex-shrink: 0;
  }

  .field-name {
    background: none;
    border: none;
    padding: 0;
    color: var(--hf-symbolIcon-fieldForeground, #75beff);
    font-family: var(--hf-editor-font-family), monospace;
    font-size: 12px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .field-name:hover {
    text-decoration: underline;
  }

  .args-hint {
    color: var(--hf-descriptionForeground);
    font-size: 11px;
    font-family: var(--hf-editor-font-family), monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }

  .field-type {
    color: var(--hf-symbolIcon-typeParameterForeground, #ee9d28);
    font-family: var(--hf-editor-font-family), monospace;
    font-size: 12px;
    white-space: nowrap;
  }

  .deprecated-badge {
    padding: 1px 4px;
    background: var(--hf-inputValidation-warningBackground, rgba(255, 200, 0, 0.15));
    color: var(--hf-editorWarning-foreground, #fca130);
    border-radius: 3px;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.5px;
    flex-shrink: 0;
    margin-left: 4px;
  }

  .field-description {
    padding-left: 18px;
    color: var(--hf-descriptionForeground);
    font-size: 11px;
    font-style: italic;
    line-height: 1.4;
  }

  .args-list {
    padding-left: 28px;
    border-left: 1px solid var(--hf-panel-border);
    margin-left: 7px;
    margin-top: 2px;
    margin-bottom: 2px;
  }

  .arg-item {
    display: flex;
    align-items: baseline;
    gap: 2px;
    padding: 1px 0;
    font-size: 11px;
    flex-wrap: wrap;
  }

  .arg-name {
    color: var(--hf-symbolIcon-variableForeground, #9cdcfe);
    font-family: var(--hf-editor-font-family), monospace;
  }

  .arg-type {
    color: var(--hf-symbolIcon-typeParameterForeground, #ee9d28);
    font-family: var(--hf-editor-font-family), monospace;
  }

  .arg-default {
    color: var(--hf-descriptionForeground);
    font-family: var(--hf-editor-font-family), monospace;
  }

  .arg-description {
    color: var(--hf-descriptionForeground);
    font-style: italic;
    margin-left: 4px;
  }
</style>
