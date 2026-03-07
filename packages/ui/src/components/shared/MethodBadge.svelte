<script lang="ts">
  import type { HttpMethod } from '../../types';

  interface Props {
    method: HttpMethod;
  }
  let { method }: Props = $props();

  const methodColors: Record<string, string> = {
    GET: '#49cc90',
    POST: '#fca130',
    PUT: '#61affe',
    PATCH: '#50e3c2',
    DELETE: '#f93e3e',
    HEAD: '#9012fe',
    OPTIONS: '#0d5aa7',
  };

  const color = $derived(methodColors[method] || '#999');
</script>

<span class="method-badge" style="color: {color};">
  {method}
</span>

<style>
  .method-badge {
    display: inline-flex;
    align-items: center;
    min-width: 36px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    line-height: 1;
    flex-shrink: 0;
  }
</style>
