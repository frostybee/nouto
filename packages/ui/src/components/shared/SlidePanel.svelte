<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import type { Snippet } from 'svelte';

  interface Props {
    open: boolean;
    title: string;
    width?: number;
    onclose: () => void;
    children?: Snippet;
    footer?: Snippet;
  }

  let { open, title, width = 300, onclose, children, footer }: Props = $props();
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="slide-backdrop" onclick={onclose}></div>
  <div
    class="slide-panel"
    style="width: {width}px"
    transition:fly={{ x: width, duration: 220, easing: cubicOut }}
  >
    <div class="slide-header">
      <span class="slide-title">{title}</span>
      <button class="slide-close-btn" onclick={onclose} title="Close">
        <i class="codicon codicon-close"></i>
      </button>
    </div>

    <div class="slide-body">
      {@render children?.()}
    </div>

    {#if footer}
      <div class="slide-footer">
        {@render footer()}
      </div>
    {/if}
  </div>
{/if}

<style>
  /* Requires parent to have position: relative; overflow: hidden */

  .slide-backdrop {
    position: absolute;
    inset: 0;
    z-index: 9;
  }

  .slide-panel {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    background: var(--hf-editor-background);
    border-left: 1px solid var(--hf-panel-border);
    box-shadow: -4px 0 16px rgba(0, 0, 0, 0.25);
  }

  .slide-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid var(--hf-panel-border);
    background: var(--hf-sideBarSectionHeader-background);
    flex-shrink: 0;
  }

  .slide-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--hf-foreground);
    letter-spacing: 0.3px;
  }

  .slide-close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    background: transparent;
    border: none;
    color: var(--hf-foreground);
    opacity: 0.6;
    cursor: pointer;
    border-radius: 3px;
    font-size: 14px;
  }

  .slide-close-btn:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
  }

  .slide-body {
    flex: 1;
    overflow-y: auto;
    padding: 8px 14px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .slide-footer {
    flex-shrink: 0;
    padding: 10px 14px;
    border-top: 1px solid var(--hf-panel-border);
  }
</style>
