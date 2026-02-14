<script lang="ts">
  import type { AssertionResult } from '../../types';

  interface Props {
    results: AssertionResult[];
  }
  let { results }: Props = $props();

  const passedCount = $derived(results.filter(r => r.passed).length);
  const failedCount = $derived(results.length - passedCount);
  const allPassed = $derived(passedCount === results.length);
</script>

{#if results.length > 0}
  <div class="assertion-results">
    <div class="summary" class:all-passed={allPassed} class:has-failures={!allPassed}>
      <span class="codicon" class:codicon-pass-filled={allPassed} class:codicon-error={!allPassed}></span>
      <span class="summary-text">
        {passedCount}/{results.length} tests passed
        {#if failedCount > 0}
          <span class="failed-count">({failedCount} failed)</span>
        {/if}
      </span>
    </div>

    <div class="results-list">
      {#each results as result}
        <div class="result-item" class:passed={result.passed} class:failed={!result.passed}>
          <span class="result-icon codicon" class:codicon-pass-filled={result.passed} class:codicon-error={!result.passed}></span>
          <span class="result-message">{result.message}</span>
          {#if !result.passed && result.actual !== undefined}
            <span class="result-actual">
              Actual: <code>{result.actual}</code>
            </span>
          {/if}
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .assertion-results {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 600;
  }

  .summary.all-passed {
    background: rgba(73, 204, 144, 0.1);
    color: #49cc90;
  }

  .summary.has-failures {
    background: rgba(249, 62, 62, 0.1);
    color: #f93e3e;
  }

  .failed-count {
    font-weight: 400;
    opacity: 0.8;
  }

  .results-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .result-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 12px;
    background: var(--hf-input-background);
    border: 1px solid var(--hf-panel-border);
  }

  .result-item.passed {
    border-left: 3px solid #49cc90;
  }

  .result-item.failed {
    border-left: 3px solid #f93e3e;
  }

  .result-icon {
    flex-shrink: 0;
    font-size: 14px;
  }

  .result-icon.codicon-pass-filled {
    color: #49cc90;
  }

  .result-icon.codicon-error {
    color: #f93e3e;
  }

  .result-message {
    flex: 1;
    color: var(--hf-foreground);
  }

  .result-actual {
    font-size: 11px;
    color: var(--hf-descriptionForeground);
  }

  .result-actual code {
    background: var(--hf-textCodeBlock-background);
    padding: 1px 4px;
    border-radius: 3px;
    font-family: var(--hf-editor-font-family), monospace;
  }
</style>
