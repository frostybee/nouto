<script lang="ts">
  import { request, setBody } from '../../stores/request.svelte';
  import { gqlSubStatus, gqlSubEvents, gqlSubError, gqlSubEventCount, clearGqlSubEvents } from '../../stores/graphqlSubscription.svelte';
  import GraphQLEditor from './GraphQLEditor.svelte';
  import GqlSubEventRow from './GqlSubEventRow.svelte';
  import Tooltip from './Tooltip.svelte';
  import type { BodyState } from '../../types';

  const status = $derived(gqlSubStatus());
  const events = $derived(gqlSubEvents());
  const error = $derived(gqlSubError());
  const count = $derived(gqlSubEventCount());
  let eventLogEl = $state<HTMLDivElement>(undefined!);
  let userScrolledUp = $state(false);

  function handleBodyChange(body: BodyState) {
    setBody(body);
  }

  function handleWheel(e: WheelEvent) {
    if (!eventLogEl) return;
    if (e.deltaY < 0) {
      userScrolledUp = true;
    } else {
      const { scrollTop, scrollHeight, clientHeight } = eventLogEl;
      if (scrollHeight - scrollTop - clientHeight < 50) {
        userScrolledUp = false;
      }
    }
  }

  $effect(() => {
    if (events.length > 0 && !userScrolledUp && eventLogEl) {
      eventLogEl.scrollTop = eventLogEl.scrollHeight;
    }
  });

  function getStatusColor(s: string): string {
    switch (s) {
      case 'subscribed': return '#49cc90';
      case 'connected': return '#61affe';
      case 'connecting': return '#fca130';
      case 'error': return '#f93e3e';
      default: return 'var(--hf-descriptionForeground)';
    }
  }
</script>

<div class="gql-sub-panel">
  <div class="editor-section">
    <GraphQLEditor
      body={request.body}
      onchange={handleBodyChange}
      url={request.url}
      headers={request.headers}
      auth={request.auth}
    />
  </div>

  <div class="events-section">
    <div class="events-toolbar">
      <span class="status-dot" style="background: {getStatusColor(status)}"></span>
      <span class="status-text">{status}</span>
      {#if error}
        <span class="error-text">{error}</span>
      {/if}
      <span class="event-count">{count} events</span>
      <Tooltip text="Clear events" position="top">
        <button class="clear-btn" onclick={() => clearGqlSubEvents()} aria-label="Clear events">Clear</button>
      </Tooltip>
    </div>

    <div class="event-log" bind:this={eventLogEl} onwheel={handleWheel}>
      {#if events.length === 0}
        <p class="placeholder">No events yet. Subscribe to a GraphQL endpoint to start receiving data.</p>
      {:else}
        {#each events as evt (evt.id)}
          <GqlSubEventRow event={evt} />
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .gql-sub-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .editor-section {
    flex: 1;
    min-height: 200px;
    overflow: auto;
    padding: 8px 12px;
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .events-section {
    flex: 1;
    min-height: 120px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .events-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--hf-panel-border);
    font-size: 12px;
    flex-shrink: 0;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-text {
    font-weight: 600;
    color: var(--hf-foreground);
    text-transform: capitalize;
  }

  .error-text {
    color: #f93e3e;
    font-size: 11px;
  }

  .event-count {
    margin-left: auto;
    color: var(--hf-descriptionForeground);
    font-size: 11px;
  }

  .clear-btn {
    padding: 3px 10px;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: none;
    border-radius: 3px;
    font-size: 11px;
    cursor: pointer;
    font-weight: 600;
  }

  .event-log {
    flex: 1;
    overflow-y: auto;
    padding: 4px;
  }

  .placeholder {
    color: var(--hf-descriptionForeground);
    font-style: italic;
    font-size: 13px;
    padding: 12px;
  }
</style>
