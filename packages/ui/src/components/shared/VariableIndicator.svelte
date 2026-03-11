<script lang="ts">
  import { classifyVariables, aggregateStatus, type VariableInfo, type VariableStatus } from '../../lib/variable-validator';
  import { activeVariables } from '../../stores/environment.svelte';
  import Tooltip from './Tooltip.svelte';

  interface Props {
    text: string;
  }
  let { text }: Props = $props();

  const vars = $derived(classifyVariables(text, activeVariables()));
  const status = $derived(aggregateStatus(vars));

  const statusColors: Record<VariableStatus, string> = {
    resolved: '#49cc90',    // green
    unresolved: '#fca130',  // orange
    dynamic: '#61affe',     // blue
  };

  const statusIcons: Record<VariableStatus, string> = {
    resolved: 'codicon-pass-filled',
    unresolved: 'codicon-warning',
    dynamic: 'codicon-zap',
  };

  const tooltipText = $derived.by(() => {
    if (!vars.length) return '';
    const grouped: Record<VariableStatus, string[]> = { resolved: [], unresolved: [], dynamic: [] };
    for (const v of vars) grouped[v.status].push(v.name);
    const parts: string[] = [];
    if (grouped.resolved.length) parts.push(`Resolved: ${grouped.resolved.join(', ')}`);
    if (grouped.unresolved.length) parts.push(`Unresolved: ${grouped.unresolved.join(', ')}`);
    if (grouped.dynamic.length) parts.push(`Dynamic: ${grouped.dynamic.join(', ')}`);
    return parts.join(' | ');
  });
</script>

{#if status}
  <Tooltip text={tooltipText} position="top">
    <span
      class="variable-indicator"
      style="color: {statusColors[status]}"
    >
      <i class="codicon {statusIcons[status]}"></i>
    </span>
  </Tooltip>
{/if}

<style>
  .variable-indicator {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    font-size: 12px;
    cursor: default;
  }

  .variable-indicator .codicon {
    font-size: 12px;
  }
</style>
