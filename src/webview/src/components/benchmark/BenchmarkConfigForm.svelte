<script lang="ts">
  import type { BenchmarkConfig } from '../../types';

  let { config, onUpdate, onStart }: {
    config: BenchmarkConfig;
    onUpdate: (updates: Partial<BenchmarkConfig>) => void;
    onStart: () => void;
  } = $props();
</script>

<div class="config-form">
  <div class="form-row">
    <label for="iterations">Iterations</label>
    <input
      id="iterations"
      type="number"
      min="1"
      max="10000"
      value={config.iterations}
      onchange={(e) => onUpdate({ iterations: parseInt((e.target as HTMLInputElement).value) || 10 })}
    />
  </div>

  <div class="form-row">
    <label for="concurrency">Concurrency</label>
    <input
      id="concurrency"
      type="number"
      min="1"
      max="100"
      value={config.concurrency}
      onchange={(e) => onUpdate({ concurrency: parseInt((e.target as HTMLInputElement).value) || 1 })}
    />
    <span class="hint">{config.concurrency <= 1 ? 'Sequential' : `${config.concurrency} concurrent`}</span>
  </div>

  {#if config.concurrency <= 1}
    <div class="form-row">
      <label for="delay">Delay between (ms)</label>
      <input
        id="delay"
        type="number"
        min="0"
        max="60000"
        value={config.delayBetweenMs}
        onchange={(e) => onUpdate({ delayBetweenMs: parseInt((e.target as HTMLInputElement).value) || 0 })}
      />
    </div>
  {/if}

  <button class="start-btn" onclick={onStart}>
    Run Benchmark
  </button>
</div>

<style>
  .config-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 400px;
  }

  .form-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .form-row label {
    min-width: 130px;
    font-size: 13px;
    color: var(--vscode-foreground);
  }

  .form-row input {
    flex: 1;
    max-width: 120px;
    padding: 4px 8px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 2px;
    font-size: 13px;
  }

  .hint {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }

  .start-btn {
    margin-top: 8px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 8px 20px;
    border-radius: 2px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    align-self: flex-start;
  }

  .start-btn:hover {
    background: var(--vscode-button-hoverBackground);
  }
</style>
