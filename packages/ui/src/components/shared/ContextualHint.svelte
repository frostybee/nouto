<script lang="ts">
  import { isHintVisible, dismissHint } from '../../stores/onboarding.svelte';
  import Tooltip from './Tooltip.svelte';

  interface Props {
    hintId: string;
    text: string;
    position?: 'top' | 'bottom';
    align?: 'left' | 'right';
  }

  let { hintId, text, position = 'bottom', align = 'right' }: Props = $props();
</script>

{#if isHintVisible(hintId)}
  <div class="contextual-hint {position} align-{align}">
    <span class="hint-text">{text}</span>
    <Tooltip text="Dismiss" position="top">
      <button
        class="hint-dismiss"
        onclick={(e: MouseEvent) => { e.stopPropagation(); dismissHint(hintId); }}
        aria-label="Dismiss hint"
      >
        <span class="codicon codicon-close"></span>
      </button>
    </Tooltip>
  </div>
{/if}

<style>
  .contextual-hint {
    position: absolute;
    z-index: 40;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-radius: 4px;
    border: 1px solid rgba(55, 148, 255, 0.3);
    background: var(--vscode-editorWidget-background, #1e1e1e);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    white-space: nowrap;
    animation: hintFadeIn 0.2s ease-out;
    pointer-events: auto;
  }

  .contextual-hint.bottom {
    top: 100%;
    margin-top: 6px;
  }

  .contextual-hint.top {
    bottom: 100%;
    margin-bottom: 6px;
  }

  .contextual-hint.align-right {
    right: 0;
  }

  .contextual-hint.align-left {
    left: 0;
  }

  @keyframes hintFadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .hint-text {
    font-size: 12px;
    color: rgba(100, 180, 255, 0.9);
  }

  .hint-dismiss {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 3px;
    color: rgba(100, 180, 255, 0.7);
    cursor: pointer;
    flex-shrink: 0;
  }

  .hint-dismiss:hover {
    background: rgba(55, 148, 255, 0.2);
    color: rgba(100, 180, 255, 1);
  }

  .hint-dismiss .codicon {
    font-size: 11px;
  }
</style>
