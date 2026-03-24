<script lang="ts">
  import type { Assertion, AssertionResult } from '../../types';
  import { request, setAssertions } from '../../stores/request.svelte';
  import { ui } from '../../stores/ui.svelte';
  import { assertionResults, createDefaultAssertion, createDefaultGrpcAssertion } from '../../stores/assertions.svelte';
  import AssertionRow from './AssertionRow.svelte';

  const assertions = $derived(request.assertions || []);
  const results = $derived(assertionResults());

  function getResultForAssertion(assertionId: string): AssertionResult | undefined {
    return results.find(r => r.assertionId === assertionId);
  }

  function handleAdd() {
    const newAssertion = ui.connectionMode === 'grpc' ? createDefaultGrpcAssertion() : createDefaultAssertion();
    setAssertions([...assertions, newAssertion]);
  }

  function handleUpdate(index: number, updated: Assertion) {
    const newAssertions = [...assertions];
    newAssertions[index] = updated;
    setAssertions(newAssertions);
  }

  function handleRemove(index: number) {
    const newAssertions = assertions.filter((_, i) => i !== index);
    setAssertions(newAssertions);
  }

  const passedCount = $derived(results.filter(r => r.passed).length);
  const totalCount = $derived(results.length);
  const hasResults = $derived(results.length > 0);
</script>

<div class="assertion-editor">
  <div class="editor-header">
    <span class="title">Test Assertions</span>
    {#if hasResults}
      <span class="summary" class:all-passed={passedCount === totalCount} class:has-failures={passedCount < totalCount}>
        {passedCount}/{totalCount} passed
      </span>
    {/if}
    <button class="add-btn" onclick={handleAdd}>
      <span class="codicon codicon-add"></span>
      Add Test
    </button>
  </div>

  {#if assertions.length === 0}
    <div class="empty-state">
      <span class="empty-icon codicon codicon-beaker"></span>
      <p>No test assertions yet</p>
      <p class="hint">Add assertions to validate responses automatically</p>
    </div>
  {:else}
    <div class="assertions-list">
      {#each assertions as assertion, i (assertion.id)}
        <AssertionRow
          {assertion}
          result={getResultForAssertion(assertion.id)}
          connectionMode={ui.connectionMode}
          onchange={(updated) => handleUpdate(i, updated)}
          onremove={() => handleRemove(i)}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  .assertion-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .editor-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .title {
    font-size: 12px;
    font-weight: 600;
    color: var(--hf-foreground);
  }

  .summary {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 10px;
    font-weight: 600;
  }

  .summary.all-passed {
    background: rgba(73, 204, 144, 0.15);
    color: #49cc90;
  }

  .summary.has-failures {
    background: rgba(249, 62, 62, 0.15);
    color: #f93e3e;
  }

  .add-btn {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .add-btn:hover {
    background: var(--hf-button-secondaryHoverBackground);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px;
    color: var(--hf-descriptionForeground);
  }

  .empty-icon {
    font-size: 32px;
    margin-bottom: 8px;
    opacity: 0.5;
  }

  .empty-state p {
    margin: 0;
    font-size: 13px;
  }

  .hint {
    margin-top: 4px;
    font-size: 12px;
    opacity: 0.7;
  }

  .assertions-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
</style>
