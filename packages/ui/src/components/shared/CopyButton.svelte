<script lang="ts">
  import { copyToClipboard } from '../../lib/clipboard';
  import Tooltip from './Tooltip.svelte';

  interface Props {
    /** Content to copy - static string or async function returning string|null */
    text: string | (() => Promise<string | null>);
    /** Button label (default: "Copy"). Set to "" for no label. */
    label?: string;
    /** Label shown after successful copy (default: "Copied!") */
    copiedLabel?: string;
    /** Render as icon-only button */
    iconOnly?: boolean;
    /** Feedback duration in ms (default: 1500) */
    duration?: number;
    /** Extra CSS classes */
    class?: string;
    /** Button title attribute */
    title?: string;
    /** Button size variant */
    size?: 'sm' | 'md';
  }

  let {
    text,
    label = 'Copy',
    copiedLabel = 'Copied!',
    iconOnly = false,
    duration = 1500,
    class: className = '',
    title: titleAttr,
    size = 'md',
  }: Props = $props();

  let state = $state<'idle' | 'copied' | 'error'>('idle');
  let timer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    return () => {
      if (timer) clearTimeout(timer);
    };
  });

  async function handleClick() {
    const resolved = typeof text === 'function' ? await text() : text;
    if (resolved == null) return;

    const success = await copyToClipboard(resolved);
    state = success ? 'copied' : 'error';

    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { state = 'idle'; }, duration);
  }

  const icon = $derived(
    state === 'copied' ? 'codicon-check'
    : state === 'error' ? 'codicon-error'
    : 'codicon-copy'
  );

  const displayLabel = $derived(
    iconOnly ? ''
    : state === 'copied' ? copiedLabel
    : state === 'error' ? 'Failed'
    : label
  );
</script>

<Tooltip text={titleAttr ?? (state === 'copied' ? copiedLabel : label || 'Copy')}>
  <button
    class="copy-button {size === 'sm' ? 'copy-button-sm' : ''} {className}"
    class:icon-only={iconOnly}
    class:copied={state === 'copied'}
    class:error={state === 'error'}
    onclick={handleClick}
  >
    <i class="codicon {icon}"></i>
    {#if displayLabel}
      <span class="copy-label">{displayLabel}</span>
    {/if}
  </button>
</Tooltip>

<style>
  .copy-button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: transparent;
    color: var(--hf-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }

  .copy-button:hover {
    background: var(--hf-list-hoverBackground);
    border-color: var(--hf-focusBorder);
  }

  .copy-button .codicon {
    font-size: 12px;
  }

  .copy-button.icon-only {
    padding: 4px 6px;
    border: none;
  }

  .copy-button.icon-only .codicon {
    font-size: 14px;
  }

  .copy-button-sm {
    padding: 2px 6px;
    font-size: 10px;
  }

  .copy-button-sm .codicon {
    font-size: 11px;
  }

  .copy-button.copied .codicon {
    color: var(--hf-testing-iconPassed, #73c991);
  }

  .copy-button.error .codicon {
    color: var(--hf-errorForeground, #f44336);
  }
</style>
