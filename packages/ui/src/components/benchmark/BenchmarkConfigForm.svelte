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
    gap: 0.923rem;
    max-width: 30.769rem;
  }

  .form-row {
    display: flex;
    align-items: center;
    gap: 0.769rem;
  }

  .form-row label {
    min-width: 10rem;
    font-size: 1rem;
    color: var(--hf-foreground);
  }

  .form-row input {
    flex: 1;
    max-width: 11.538rem;
    padding: 0.308rem 0.615rem;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border);
    border-radius: 0.308rem;
    font-size: 1rem;
  }

  .hint {
    font-size: 0.846rem;
    color: var(--hf-descriptionForeground);
  }

  .start-btn {
    margin-top: 0.615rem;
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    padding: 0.615rem 1.538rem;
    border-radius: 0.308rem;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 600;
    align-self: flex-start;
    transition: background 0.15s;
  }

  .start-btn:hover {
    background: var(--hf-button-hoverBackground);
  }
</style>
