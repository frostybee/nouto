<script lang="ts">
  import type { HttpMethod } from '../../types';

  interface Props {
    method: HttpMethod;
  }
  let { method }: Props = $props();

  const methodColors: Record<HttpMethod, string> = {
    GET: '#61affe',
    POST: '#49cc90',
    PUT: '#fca130',
    PATCH: '#50e3c2',
    DELETE: '#f93e3e',
    HEAD: '#9012fe',
    OPTIONS: '#0d5aa7',
  };

  const color = $derived(methodColors[method] || '#999');
</script>

<span class="method-badge" style="--method-color: {color}">
  {method}
</span>

<style>
  .method-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 52px;
    padding: 2px 6px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--method-color);
    background: color-mix(in srgb, var(--method-color) 15%, transparent);
    border-radius: 3px;
    font-family: var(--hf-editor-font-family), monospace;
  }
</style>
