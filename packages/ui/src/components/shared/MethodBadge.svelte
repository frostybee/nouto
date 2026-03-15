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
    grpc: { label: 'gRPC', color: '#4db848' },
  };

  const display = $derived.by(() => {
    if (connectionMode && connectionLabels[connectionMode]) {
      return connectionLabels[connectionMode];
    }
    if (bodyType === 'graphql') {
      return { label: 'GQL', color: '#e535ab' };
    }
    if (method.toUpperCase() === 'GRPC') {
      return connectionLabels['grpc'];
    }
    return { label: method, color: methodColors[method] || '#999' };
  });
</script>

<span
  class="method-badge"
  style="color: {display.color}; background: color-mix(in srgb, {display.color} 22%, transparent); border-color: color-mix(in srgb, {display.color} 45%, transparent); box-shadow: 0 0 4px color-mix(in srgb, {display.color} 25%, transparent);"
>
  {display.label}
</span>

<style>
  .method-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 36px;
    padding: 3.5px 5px;
    font-size: 10px;
    font-weight: 800;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    line-height: 1;
    flex-shrink: 0;
    border-radius: 3px;
    border: 1px solid;
  }
</style>
