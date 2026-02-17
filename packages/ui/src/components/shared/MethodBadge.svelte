<script lang="ts">
  import type { HttpMethod } from '../../types';

  interface Props {
    method: HttpMethod;
  }
  let { method }: Props = $props();

  const methodColors: Record<HttpMethod, { color: string; bg: string }> = {
    GET: { color: '#61affe', bg: 'rgba(97, 175, 254, 0.15)' },
    POST: { color: '#49cc90', bg: 'rgba(73, 204, 144, 0.15)' },
    PUT: { color: '#fca130', bg: 'rgba(252, 161, 48, 0.15)' },
    PATCH: { color: '#50e3c2', bg: 'rgba(80, 227, 194, 0.15)' },
    DELETE: { color: '#f93e3e', bg: 'rgba(249, 62, 62, 0.15)' },
    HEAD: { color: '#9012fe', bg: 'rgba(144, 18, 254, 0.15)' },
    OPTIONS: { color: '#0d5aa7', bg: 'rgba(13, 90, 167, 0.15)' },
  };

  const colorScheme = $derived(methodColors[method] || { color: '#999', bg: 'rgba(153, 153, 153, 0.15)' });
</script>

<span class="method-badge" style="color: {colorScheme.color}; background: {colorScheme.bg};">
  {method}
</span>

<style>
  .method-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 42px;
    padding: 1px 4px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    border-radius: 2px;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    line-height: 1.2;
  }
</style>
