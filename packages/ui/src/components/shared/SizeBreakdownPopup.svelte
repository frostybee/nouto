<script lang="ts">
  import type { SizeBreakdown } from '../../stores/response.svelte';
  import { formatSize } from '@hivefetch/core';

  interface Props {
    totalSize: number;
    breakdown?: SizeBreakdown;
  }
  let { totalSize, breakdown }: Props = $props();

  let visible = $state(false);
  let ready = $state(false);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let wrapperEl = $state<HTMLSpanElement>(undefined!);
  let popupEl = $state<HTMLDivElement>(undefined!);
  let pos = $state({ top: 0, left: 0 });

  const responseTotal = $derived(
    breakdown ? breakdown.responseHeadersSize + breakdown.responseBodySize : totalSize
  );
  const requestTotal = $derived(
    breakdown ? breakdown.requestHeadersSize + breakdown.requestBodySize : 0
  );

  function show() {
    if (!breakdown) return;
    timeoutId = setTimeout(() => {
      visible = true;
      ready = false;
      requestAnimationFrame(() => {
        if (!popupEl || !wrapperEl) return;
        const wr = wrapperEl.getBoundingClientRect();
        const pr = popupEl.getBoundingClientRect();
        const pad = 8;

        let left = wr.left + wr.width / 2 - pr.width / 2;
        if (left < pad) left = pad;
        if (left + pr.width > window.innerWidth - pad) {
          left = window.innerWidth - pad - pr.width;
        }
        const top = wr.bottom + 8;

        pos = { top, left };
        ready = true;
      });
    }, 200);
  }

  function hide() {
    clearTimeout(timeoutId);
    visible = false;
    ready = false;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span
  class="size-trigger"
  bind:this={wrapperEl}
  onmouseenter={show}
  onmouseleave={hide}
>
  {formatSize(totalSize)}
  {#if breakdown}<i class="codicon codicon-info size-info-icon"></i>{/if}
  {#if visible && breakdown}
    <div
      class="size-popup"
      class:ready
      bind:this={popupEl}
      style="left: {pos.left}px; top: {pos.top}px;"
    >
      <div class="section">
        <div class="section-header">
          <span class="section-icon codicon codicon-arrow-down"></span>
          Response Size
          <span class="section-total">{formatSize(responseTotal)}</span>
        </div>
        <div class="row">
          <span class="row-label">Headers</span>
          <span class="row-value">{formatSize(breakdown.responseHeadersSize)}</span>
        </div>
        <div class="row">
          <span class="row-label">Body</span>
          <span class="row-value">{formatSize(breakdown.responseBodySize)}</span>
        </div>
      </div>
      <div class="section">
        <div class="section-header">
          <span class="section-icon codicon codicon-arrow-up"></span>
          Request Size
          <span class="section-total">{formatSize(requestTotal)}</span>
        </div>
        <div class="row">
          <span class="row-label">Headers</span>
          <span class="row-value">{formatSize(breakdown.requestHeadersSize)}</span>
        </div>
        <div class="row">
          <span class="row-label">Body</span>
          <span class="row-value">{formatSize(breakdown.requestBodySize)}</span>
        </div>
      </div>
    </div>
  {/if}
</span>

<style>
  .size-trigger {
    position: relative;
    cursor: default;
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .size-info-icon {
    font-size: 11px;
    opacity: 0.45;
    transition: opacity 0.15s;
  }

  .size-trigger:hover .size-info-icon {
    opacity: 0.9;
  }

  .size-popup {
    position: fixed;
    z-index: 10000;
    min-width: 220px;
    padding: 8px 0;
    border-radius: 4px;
    font-size: 12px;
    line-height: 1.4;
    pointer-events: none;
    opacity: 0;
    background: var(--vscode-editorHoverWidget-background, var(--hf-menu-background, #2d2d30));
    color: var(--vscode-editorHoverWidget-foreground, var(--hf-foreground, #cccccc));
    border: 1px solid var(--vscode-editorHoverWidget-border, var(--hf-panel-border, #454545));
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }

  .size-popup.ready {
    opacity: 1;
    animation: popup-fade-in 0.1s ease-out;
  }

  .section {
    padding: 4px 12px;
  }

  .section + .section {
    border-top: 1px solid var(--hf-panel-border);
    margin-top: 4px;
    padding-top: 8px;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    font-size: 11px;
    margin-bottom: 4px;
    color: var(--hf-foreground);
  }

  .section-icon {
    font-size: 12px;
    opacity: 0.7;
  }

  .section-total {
    margin-left: auto;
    font-family: var(--hf-editor-font-family, Consolas, Monaco, monospace);
    font-weight: 700;
  }

  .row {
    display: flex;
    justify-content: space-between;
    padding: 2px 0 2px 20px;
    font-size: 11px;
  }

  .row-label {
    color: var(--hf-descriptionForeground);
  }

  .row-value {
    font-family: var(--hf-editor-font-family, Consolas, Monaco, monospace);
    font-weight: 600;
  }

  @keyframes popup-fade-in {
    from { opacity: 0; transform: translateY(2px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
