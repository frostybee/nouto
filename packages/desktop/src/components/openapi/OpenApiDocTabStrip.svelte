<script lang="ts">
  import { tick } from 'svelte';
  import {
    sessionList,
    activeSessionId,
    setActiveSessionId,
    closeSession,
  } from '../../lib/openapi/session.svelte';
  import { confirmDiscardIfDirty, sessionLabel } from '../../lib/openapi/documentAdapter';

  /**
   * Document tab strip for the OpenAPI editor (Phase 5 multi-doc). Reads the
   * session registry directly (TabBar.svelte's store-direct idiom); the one
   * callback exists because the Monaco model lives behind the editor surface
   * in the parent view — closing a tab must dispose it there.
   *
   * Deliberate deviation from TabBar: middle-click close also runs the dirty
   * confirmation — silently discarding unsaved spec edits is worse than an
   * extra prompt. v1 omits pinning, drag-reorder, and scroll arrows.
   */
  interface Props {
    ondisposesession?: (id: string) => void;
  }
  let { ondisposesession }: Props = $props();

  const docs = $derived(sessionList());
  const currentId = $derived(activeSessionId());

  let stripEl = $state<HTMLDivElement>();

  async function handleClose(id: string): Promise<void> {
    const session = docs.find((s) => s.id === id);
    if (!session) return;
    if (!(await confirmDiscardIfDirty(sessionLabel(session), id))) return;
    closeSession(id);
    ondisposesession?.(id);
  }

  function handleMiddleClick(event: MouseEvent, id: string): void {
    if (event.button !== 1) return;
    event.preventDefault();
    void handleClose(id);
  }

  function handleCloseClick(event: MouseEvent, id: string): void {
    event.stopPropagation();
    void handleClose(id);
  }

  /** ARIA Tabs pattern: roving tabindex, arrow keys move focus AND activate. */
  async function handleKeydown(event: KeyboardEvent, index: number): Promise<void> {
    let target: number;
    if (event.key === 'ArrowRight') target = (index + 1) % docs.length;
    else if (event.key === 'ArrowLeft') target = (index - 1 + docs.length) % docs.length;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = docs.length - 1;
    else return;
    event.preventDefault();
    const next = docs[target];
    if (!next) return;
    setActiveSessionId(next.id);
    await tick();
    stripEl?.querySelector<HTMLElement>(`[data-session-id="${next.id}"]`)?.focus();
  }
</script>

{#if docs.length > 0}
  <div class="doc-tab-strip" role="tablist" aria-label="Open OpenAPI documents" bind:this={stripEl}>
    {#each docs as session, index (session.id)}
      <button
        class="tab"
        class:active={session.id === currentId}
        role="tab"
        aria-selected={session.id === currentId}
        aria-controls="openapi-doc-panel"
        tabindex={session.id === currentId ? 0 : -1}
        data-session-id={session.id}
        title={session.documentUri ?? 'Unsaved document'}
        onclick={() => setActiveSessionId(session.id)}
        onauxclick={(e) => handleMiddleClick(e, session.id)}
        onkeydown={(e) => handleKeydown(e, index)}
      >
        <span class="tab-label">{sessionLabel(session)}</span>
        <span
          class="tab-action"
          class:dirty={session.dirty}
          role="button"
          tabindex="-1"
          onclick={(e) => handleCloseClick(e, session.id)}
          onkeydown={(e) => {
            if (e.key === 'Enter') {
              e.stopPropagation();
              void handleClose(session.id);
            }
          }}
          aria-label={session.dirty ? 'Unsaved changes, close document' : 'Close document'}
        >
          {#if session.dirty}
            <span class="dirty-dot"></span>
          {/if}
          <span class="codicon codicon-close close-icon"></span>
        </span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .doc-tab-strip {
    display: flex;
    align-items: stretch;
    background: var(--hf-editorGroupHeader-tabsBackground);
    height: 2.308rem;
    min-height: 2.308rem;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    user-select: none;
    flex-shrink: 0;
    border-bottom: 1px solid var(--hf-editorGroupHeader-tabsBorder, var(--hf-panel-border));
  }

  .doc-tab-strip::-webkit-scrollbar {
    display: none;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 0.462rem;
    padding: 0 0.769rem;
    border: none;
    background: var(--hf-tab-inactiveBackground);
    color: var(--hf-tab-inactiveForeground);
    font-size: 0.923rem;
    cursor: pointer;
    white-space: nowrap;
    min-width: 0;
    max-width: 15.385rem;
    flex-shrink: 0;
    box-sizing: border-box;
    border-top: 0.154rem solid transparent;
    border-right: 1px solid var(--hf-tab-border);
  }

  .tab:hover {
    background: var(--hf-tab-hoverBackground);
  }

  .tab.active {
    background: var(--hf-tab-activeBackground);
    color: var(--hf-tab-activeForeground);
    border-top-color: var(--hf-tab-activeBorderTop, var(--hf-focusBorder));
  }

  .tab-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tab-action {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.538rem;
    height: 1.538rem;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    border-radius: 0.231rem;
    flex-shrink: 0;
    padding: 0;
    position: relative;
  }

  .tab-action:hover {
    background: var(--hf-toolbar-hoverBackground);
  }

  .tab-action .close-icon {
    font-size: 0.923rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tab-action .dirty-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--hf-editorWarning-foreground, #cca700);
    position: absolute;
  }

  /* Clean tabs: close icon appears on hover. Dirty tabs: dot swaps to close on hover. */
  .tab-action:not(.dirty) .close-icon {
    opacity: 0;
  }

  .tab:hover .tab-action:not(.dirty) .close-icon,
  .tab-action:not(.dirty):hover .close-icon {
    opacity: 1;
  }

  .tab-action.dirty .close-icon {
    opacity: 0;
  }

  .tab-action.dirty:hover .dirty-dot {
    opacity: 0;
  }

  .tab-action.dirty:hover .close-icon {
    opacity: 1;
  }
</style>
