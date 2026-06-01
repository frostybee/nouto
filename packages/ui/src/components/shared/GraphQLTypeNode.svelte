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

  function handleCopyName() {
    copyToClipboard(field.name);
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
    padding: 0.154rem 0;
  }

  .type-node.deprecated {
    opacity: 0.6;
  }

  .field-row {
    display: flex;
    align-items: center;
    gap: 0.154rem;
    min-height: 1.692rem;
  }

  .expand-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.231rem;
    height: 1.231rem;
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
    width: 1.231rem;
    flex-shrink: 0;
  }

  .field-name {
    background: none;
    border: none;
    padding: 0;
    color: var(--hf-symbolIcon-fieldForeground, #75beff);
    font-family: var(--hf-editor-font-family), monospace;
    font-size: 0.923rem;
    cursor: pointer;
    flex-shrink: 0;
  }

  .field-name:hover {
    text-decoration: underline;
  }

  .args-hint {
    color: var(--hf-descriptionForeground);
    font-size: 0.846rem;
    font-family: var(--hf-editor-font-family), monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 15.385rem;
  }

  .field-type {
    color: var(--hf-symbolIcon-typeParameterForeground, #ee9d28);
    font-family: var(--hf-editor-font-family), monospace;
    font-size: 0.923rem;
    white-space: nowrap;
  }

  .deprecated-badge {
    padding: 0.077rem 0.308rem;
    background: var(--hf-inputValidation-warningBackground, rgba(255, 200, 0, 0.15));
    color: var(--hf-editorWarning-foreground, #fca130);
    border-radius: 0.231rem;
    font-size: 0.692rem;
    font-weight: 600;
    letter-spacing: 0.5px;
    flex-shrink: 0;
    margin-left: 0.308rem;
  }

  .field-description {
    padding-left: 1.385rem;
    color: var(--hf-descriptionForeground);
    font-size: 0.846rem;
    font-style: italic;
    line-height: 1.4;
  }

  .args-list {
    padding-left: 2.154rem;
    border-left: 1px solid var(--hf-panel-border);
    margin-left: 0.538rem;
    margin-top: 0.154rem;
    margin-bottom: 0.154rem;
  }

  .arg-item {
    display: flex;
    align-items: baseline;
    gap: 0.154rem;
    padding: 0.077rem 0;
    font-size: 0.846rem;
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
    margin-left: 0.308rem;
  }
</style>
