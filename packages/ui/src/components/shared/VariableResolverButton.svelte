<script lang="ts">
  import VariableResolverPopup from './VariableResolverPopup.svelte';

  interface Props {
    oninsert: (text: string) => void;
  }
  let { oninsert }: Props = $props();

  let open = $state(false);
  let buttonRef = $state<HTMLButtonElement | null>(null);
  let popupRef = $state<HTMLDivElement | null>(null);
  let popupStyle = $state('');

  function toggle() {
    if (!open && buttonRef) {
      const rect = buttonRef.getBoundingClientRect();
      const popupWidth = 340;
      const popupMaxHeight = 320;

      let top = rect.bottom + 4;
      let left = rect.right - popupWidth;

      // Flip upward if near bottom
      if (top + popupMaxHeight > window.innerHeight) {
        top = rect.top - popupMaxHeight - 4;
      }
      // Clamp left edge
      if (left < 4) left = 4;

      popupStyle = `position:fixed;top:${top}px;left:${left}px;z-index:10000;`;
    }
    open = !open;
  }

  $effect(() => {
    if (open) {
      function handleClickOutside(e: MouseEvent) {
        const target = e.target as Node;
        if (
          buttonRef && !buttonRef.contains(target) &&
          popupRef && !popupRef.contains(target)
        ) {
          open = false;
        }
      }
      document.addEventListener('click', handleClickOutside, true);
      return () => document.removeEventListener('click', handleClickOutside, true);
    }
  });
</script>

<div class="resolver-wrapper">
  <button
    bind:this={buttonRef}
    class="resolver-trigger"
    title="Insert variable or value"
    onclick={toggle}
  >
    <span class="trigger-label">{'{x}'}</span>
  </button>

  {#if open}
    <div bind:this={popupRef} style={popupStyle}>
      <VariableResolverPopup
        oninsert={(text) => { oninsert(text); open = false; }}
        onclose={() => open = false}
      />
    </div>
  {/if}
</div>

<style>
  .resolver-wrapper {
    flex-shrink: 0;
  }

  .resolver-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    background: transparent;
    color: var(--hf-descriptionForeground);
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    font-family: var(--hf-editor-font-family), monospace;
    opacity: 0.6;
    transition: opacity 0.15s, background 0.15s, border-color 0.15s;
  }

  .resolver-trigger:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
    border-color: var(--hf-panel-border);
  }

  .trigger-label {
    line-height: 1;
  }
</style>
