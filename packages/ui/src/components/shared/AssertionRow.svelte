<script lang="ts">
  import type { Assertion, AssertionTarget, AssertionOperator, AssertionResult, ConnectionMode } from '../../types';
  import Tooltip from './Tooltip.svelte';

  interface Props {
    assertion: Assertion;
    result?: AssertionResult;
    connectionMode?: ConnectionMode;
    onchange?: (assertion: Assertion) => void;
    onremove?: () => void;
  }
  let { assertion, result, connectionMode = 'http', onchange, onremove }: Props = $props();

  const targets = $derived.by(() => {
    const isGrpc = connectionMode === 'grpc';
    const all: { id: AssertionTarget; label: string; grpcOnly?: boolean }[] = [
      { id: 'status', label: 'Status Code' },
      { id: 'responseTime', label: 'Response Time' },
      { id: 'responseSize', label: 'Response Size' },
      { id: 'body', label: 'Response Body' },
      { id: 'jsonQuery', label: 'JSON Path' },
      { id: 'header', label: isGrpc ? 'Header / Initial Metadata' : 'Header' },
      { id: 'contentType', label: 'Content-Type' },
      { id: 'schema', label: 'JSON Schema' },
      { id: 'setVariable', label: 'Set Variable' },
      { id: 'grpcStatusMessage', label: 'gRPC Status Name', grpcOnly: true },
      { id: 'trailer', label: 'gRPC Trailer', grpcOnly: true },
      { id: 'streamMessageCount', label: 'Stream Msg Count', grpcOnly: true },
      { id: 'streamMessage', label: 'Stream Message', grpcOnly: true },
    ];
    return isGrpc ? all : all.filter(t => !t.grpcOnly);
  });

  const allOperators: { id: AssertionOperator; label: string; numeric?: boolean; noExpected?: boolean }[] = [
    { id: 'equals', label: '=' },
    { id: 'notEquals', label: '!=' },
    { id: 'contains', label: 'contains' },
    { id: 'notContains', label: '!contains' },
    { id: 'greaterThan', label: '>', numeric: true },
    { id: 'lessThan', label: '<', numeric: true },
    { id: 'greaterThanOrEqual', label: '>=', numeric: true },
    { id: 'lessThanOrEqual', label: '<=', numeric: true },
    { id: 'exists', label: 'exists', noExpected: true },
    { id: 'notExists', label: '!exists', noExpected: true },
    { id: 'isType', label: 'isType' },
    { id: 'isJson', label: 'isJSON', noExpected: true },
    { id: 'count', label: 'count', numeric: true },
    { id: 'matches', label: 'regex' },
    { id: 'anyItemEquals', label: 'any[] =' },
    { id: 'anyItemContains', label: 'any[] contains' },
    { id: 'anyItemStartsWith', label: 'any[] starts' },
    { id: 'anyItemEndsWith', label: 'any[] ends' },
  ];

  const numericTargets: AssertionTarget[] = ['status', 'responseTime', 'responseSize', 'streamMessageCount'];
  const showProperty = $derived(
    assertion.target === 'jsonQuery' || assertion.target === 'header' || assertion.target === 'setVariable'
    || assertion.target === 'trailer' || assertion.target === 'streamMessage'
  );
  const isSetVariable = $derived(assertion.target === 'setVariable');
  const isSchema = $derived(assertion.target === 'schema');

  const filteredOperators = $derived.by(() => {
    if (isSetVariable || isSchema) return [];
    return allOperators;
  });

  const currentOperator = $derived(allOperators.find(o => o.id === assertion.operator));
  const hideExpected = $derived(currentOperator?.noExpected || isSetVariable || isSchema);

  function update(changes: Partial<Assertion>) {
    onchange?.({ ...assertion, ...changes });
  }

  function handleTargetChange(e: Event) {
    const target = (e.target as HTMLSelectElement).value as AssertionTarget;
    const updates: Partial<Assertion> = { target };
    // Reset fields when target changes
    if (target === 'schema') {
      updates.operator = 'equals';
      updates.property = undefined;
      updates.expected = '';
    } else if (target === 'setVariable') {
      updates.operator = 'equals';
      updates.property = '';
      updates.variableName = assertion.variableName || '';
    } else if (target === 'jsonQuery' || target === 'header' || target === 'trailer' || target === 'streamMessage') {
      updates.property = '';
    }
    update(updates);
  }
</script>

<div class="assertion-container" class:disabled={!assertion.enabled} class:passed={result?.passed === true} class:failed={result?.passed === false}>
  <div class="assertion-row">
    <label class="checkbox-wrapper">
      <input
        type="checkbox"
        checked={assertion.enabled}
        onchange={() => update({ enabled: !assertion.enabled })}
      />
    </label>

    {#if result}
      <span class="result-icon" class:pass={result.passed} class:fail={!result.passed}>
        {#if result.passed}
          <span class="codicon codicon-pass-filled"></span>
        {:else}
          <span class="codicon codicon-error"></span>
        {/if}
      </span>
    {/if}

    <select
      class="target-select"
      value={assertion.target}
      onchange={handleTargetChange}
      disabled={!assertion.enabled}
    >
      {#each targets as t}
        <option value={t.id}>{t.label}</option>
      {/each}
    </select>

    {#if showProperty}
      <input
        type="text"
        class="property-input"
        placeholder={
          assertion.target === 'jsonQuery' ? '$.path'
          : assertion.target === 'header' ? 'Header name'
          : assertion.target === 'trailer' ? 'Trailer name'
          : assertion.target === 'streamMessage' ? '0 or 0.$.path'
          : 'JSONPath source'
        }
        value={assertion.property || ''}
        oninput={(e) => update({ property: e.currentTarget.value })}
        disabled={!assertion.enabled}
      />
    {/if}

    {#if !isSetVariable && !isSchema}
      <select
        class="operator-select"
        value={assertion.operator}
        onchange={(e) => update({ operator: (e.target as HTMLSelectElement).value as AssertionOperator })}
        disabled={!assertion.enabled}
      >
        {#each filteredOperators as op}
          <option value={op.id}>{op.label}</option>
        {/each}
      </select>
    {/if}

    {#if !hideExpected && !isSetVariable}
      <input
        type="text"
        class="expected-input"
        placeholder="Expected"
        value={assertion.expected || ''}
        oninput={(e) => update({ expected: e.currentTarget.value })}
        disabled={!assertion.enabled}
      />
    {/if}

    {#if isSetVariable}
      <input
        type="text"
        class="variable-input"
        placeholder="Variable name"
        value={assertion.variableName || ''}
        oninput={(e) => update({ variableName: e.currentTarget.value })}
        disabled={!assertion.enabled}
      />
    {/if}

    <Tooltip text="Remove assertion" position="top">
      <button class="remove-btn" onclick={onremove} aria-label="Remove assertion">
        <span class="codicon codicon-close"></span>
      </button>
    </Tooltip>
  </div>

  {#if isSchema}
    <textarea
      class="schema-input"
      placeholder={'{\n  "type": "object",\n  "properties": { ... }\n}'}
      value={assertion.expected || ''}
      oninput={(e) => update({ expected: e.currentTarget.value })}
      disabled={!assertion.enabled}
      rows="5"
      spellcheck="false"
    ></textarea>
  {/if}
</div>

{#if result && !result.passed}
  <div class="result-detail">
    <span class="result-message">{result.message}</span>
    {#if result.actual !== undefined}
      <span class="result-actual">Got: <code>{result.actual}</code></span>
    {/if}
  </div>
{/if}

<style>
  .assertion-container {
    display: flex;
    flex-direction: column;
    border-radius: 4px;
    background: var(--hf-input-background);
    border: 1px solid var(--hf-panel-border);
    transition: border-color 0.15s;
  }

  .assertion-container.disabled {
    opacity: 0.5;
  }

  .assertion-container.passed {
    border-color: #49cc90;
  }

  .assertion-container.failed {
    border-color: #f93e3e;
  }

  .assertion-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
  }

  .checkbox-wrapper {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .checkbox-wrapper input {
    margin: 0;
    cursor: pointer;
  }

  .result-icon {
    flex-shrink: 0;
    font-size: 14px;
  }

  .result-icon.pass {
    color: #49cc90;
  }

  .result-icon.fail {
    color: #f93e3e;
  }

  .target-select,
  .operator-select {
    padding: 4px 6px;
    background: var(--hf-dropdown-background);
    color: var(--hf-dropdown-foreground);
    border: 1px solid var(--hf-dropdown-border, var(--hf-panel-border));
    border-radius: 3px;
    font-size: 12px;
    cursor: pointer;
  }

  .target-select {
    min-width: 110px;
  }

  .operator-select {
    min-width: 80px;
  }

  .property-input,
  .expected-input,
  .variable-input {
    flex: 1;
    min-width: 80px;
    padding: 4px 8px;
    background: var(--hf-editor-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 3px;
    font-size: 12px;
    font-family: var(--hf-editor-font-family), monospace;
  }

  .property-input:focus,
  .expected-input:focus,
  .variable-input:focus {
    outline: none;
    border-color: var(--hf-focusBorder);
  }

  .remove-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    background: transparent;
    border: none;
    color: var(--hf-foreground);
    cursor: pointer;
    border-radius: 3px;
    opacity: 0.5;
    flex-shrink: 0;
  }

  .remove-btn:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
  }

  .result-detail {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px 4px 36px;
    font-size: 11px;
    color: var(--hf-errorForeground);
  }

  .result-message {
    flex-shrink: 0;
  }

  .result-actual code {
    background: var(--hf-textCodeBlock-background);
    padding: 1px 4px;
    border-radius: 3px;
    font-family: var(--hf-editor-font-family), monospace;
    font-size: 11px;
  }

  .schema-input {
    width: 100%;
    box-sizing: border-box;
    padding: 6px 8px;
    background: var(--hf-editor-background);
    color: var(--hf-input-foreground);
    border: none;
    border-top: 1px solid var(--hf-panel-border);
    border-radius: 0 0 4px 4px;
    font-size: 11px;
    font-family: var(--hf-editor-font-family), monospace;
    resize: vertical;
    line-height: 1.4;
  }

  .schema-input:focus {
    outline: none;
    border-top-color: var(--hf-focusBorder);
  }
</style>
