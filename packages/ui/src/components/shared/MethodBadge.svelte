<script lang="ts">
  import type { HttpMethod, ConnectionMode, BodyType } from '../../types';

  interface Props {
    method: HttpMethod;
    connectionMode?: ConnectionMode;
    bodyType?: BodyType;
  }
  let { method, connectionMode, bodyType }: Props = $props();

  const methodColors: Record<string, string> = {
    GET: '#49cc90',
    POST: '#fca130',
    PUT: '#61affe',
    PATCH: '#50e3c2',
    DELETE: '#f93e3e',
    HEAD: '#9012fe',
    OPTIONS: '#0d5aa7',
  };

  const connectionLabels: Record<string, { label: string; color: string }> = {
    websocket: { label: 'WS', color: '#e535ab' },
    sse: { label: 'SSE', color: '#ff6b35' },
    'graphql-ws': { label: 'GQL-S', color: '#e535ab' },
  };

  const display = $derived.by(() => {
    if (connectionMode && connectionLabels[connectionMode]) {
      return connectionLabels[connectionMode];
    }
    if (bodyType === 'graphql') {
      return { label: 'GQL', color: '#e535ab' };
    }
    return { label: method, color: methodColors[method] || '#999' };
  });
</script>

<span class="method-badge" style="color: {display.color};">
  {display.label}
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
