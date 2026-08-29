<script lang="ts">
  import { activeEnvironment } from '@nouto/ui/stores/environment.svelte';
  import { response, isLoading, formatBytes } from '@nouto/ui/stores/response.svelte';
  import { getStatusColor } from '@nouto/ui/lib/http-helpers';

  const env = $derived(activeEnvironment());
  const res = $derived(response());
  const loading = $derived(isLoading());

  const statusColor = $derived.by(() => {
    if (!res) return 'inherit';
    if (res.error) return 'var(--hf-charts-red, #f14c4c)';
    return getStatusColor(res.status);
  });
</script>

<div class="status-bar">
  <div class="status-left">
    <span class="status-item connection">
      <span class="status-dot" class:loading></span>
      {loading ? 'Sending…' : 'Ready'}
    </span>
    <span class="status-separator">|</span>
    <span class="status-item env">
      ENV: {env ? env.name : 'No Environment'}
    </span>
  </div>

  {#if res}
    <div class="status-right">
      <span class="status-item status-code" style="color: {statusColor}">
        {res.status}
        {res.statusText}
      </span>
      <span class="status-item">{res.duration}ms</span>
      <span class="status-item">{formatBytes(res.size)}</span>
    </div>
  {/if}
</div>

<style>
  .status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.923rem;
    padding: 0 0.923rem;
    min-height: 22px;
    border-top: 1px solid var(--hf-panel-border);
    background: var(--hf-titleBar-activeBackground, var(--hf-editor-background));
    color: var(--hf-titleBar-activeForeground, var(--hf-editor-foreground));
    font-size: 0.846rem;
    flex-shrink: 0;
    overflow: hidden;
    user-select: none;
  }

  .status-left,
  .status-right {
    display: flex;
    align-items: center;
    gap: 0.615rem;
    min-width: 0;
  }

  .status-item {
    white-space: nowrap;
  }

  .status-separator {
    opacity: 0.4;
  }

  .connection {
    display: inline-flex;
    align-items: center;
    gap: 0.462rem;
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--hf-charts-green, #388a34);
    flex-shrink: 0;
  }

  .status-dot.loading {
    background: var(--hf-charts-yellow, #bf8803);
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }

  .status-code {
    font-weight: 600;
  }
</style>
