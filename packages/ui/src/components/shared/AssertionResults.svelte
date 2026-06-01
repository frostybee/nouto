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
    gap: 0.615rem;
  }

  .summary {
    display: flex;
    align-items: center;
    gap: 0.615rem;
    padding: 0.615rem 0.923rem;
    border-radius: 0.308rem;
    font-size: 1rem;
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
    gap: 0.308rem;
  }

  .result-item {
    display: flex;
    align-items: center;
    gap: 0.615rem;
    padding: 0.462rem 0.769rem;
    border-radius: 0.308rem;
    font-size: 0.923rem;
    background: var(--hf-input-background);
    border: 1px solid var(--hf-panel-border);
  }

  .result-item.passed {
    border-left: 0.231rem solid #49cc90;
  }

  .result-item.failed {
    border-left: 0.231rem solid #f93e3e;
  }

  .result-icon {
    flex-shrink: 0;
    font-size: 1.077rem;
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
    font-size: 0.846rem;
    color: var(--hf-descriptionForeground);
  }

  .result-actual code {
    background: var(--hf-textCodeBlock-background);
    padding: 0.077rem 0.308rem;
    border-radius: 0.231rem;
    font-family: var(--hf-editor-font-family), monospace;
  }
</style>
