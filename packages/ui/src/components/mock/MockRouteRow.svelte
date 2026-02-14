<script lang="ts">
  import type { MockRoute, HttpMethod } from '../../types';

  let { route, onUpdate, onRemove }: {
    route: MockRoute;
    onUpdate: (updates: Partial<MockRoute>) => void;
    onRemove: () => void;
  } = $props();

  let expanded = $state(false);

  const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
</script>

<div class="route-row" class:disabled={!route.enabled}>
  <div class="route-summary">
    <input
      type="checkbox"
      checked={route.enabled}
      onchange={() => onUpdate({ enabled: !route.enabled })}
      title="Enable/disable route"
    />
    <select
      class="method-select method-{route.method.toLowerCase()}"
      value={route.method}
      onchange={(e) => onUpdate({ method: (e.target as HTMLSelectElement).value as HttpMethod })}
    >
      {#each methods as m}
        <option value={m}>{m}</option>
      {/each}
    </select>
    <input
      class="path-input"
      type="text"
      value={route.path}
      placeholder="/api/endpoint/:id"
      onchange={(e) => onUpdate({ path: (e.target as HTMLInputElement).value })}
    />
    <input
      class="status-input"
      type="number"
      min="100"
      max="599"
      value={route.statusCode}
      onchange={(e) => onUpdate({ statusCode: parseInt((e.target as HTMLInputElement).value) || 200 })}
    />
    <button class="expand-btn" onclick={() => expanded = !expanded}>
      {expanded ? '\u25B2' : '\u25BC'}
    </button>
    <button class="remove-btn" onclick={onRemove} title="Remove route">\u00D7</button>
  </div>

  {#if expanded}
    <div class="route-details">
      <div class="detail-row">
        <label for="desc-{route.id}">Description</label>
        <input
          id="desc-{route.id}"
          type="text"
          value={route.description || ''}
          placeholder="Optional description"
          onchange={(e) => onUpdate({ description: (e.target as HTMLInputElement).value })}
        />
      </div>
      <div class="detail-row">
        <label for="body-{route.id}">Response Body</label>
        <textarea
          id="body-{route.id}"
          rows="5"
          value={route.responseBody}
          placeholder={'{"key": "value"}'}
          onchange={(e) => onUpdate({ responseBody: (e.target as HTMLTextAreaElement).value })}
        ></textarea>
      </div>
      <div class="detail-row latency">
        <label for="latency-min-{route.id}">Latency (ms)</label>
        <div class="latency-inputs">
          <input
            id="latency-min-{route.id}"
            type="number"
            min="0"
            value={route.latencyMin}
            placeholder="Min"
            onchange={(e) => onUpdate({ latencyMin: parseInt((e.target as HTMLInputElement).value) || 0 })}
          />
          <span>to</span>
          <input
            type="number"
            min="0"
            value={route.latencyMax}
            placeholder="Max"
            onchange={(e) => onUpdate({ latencyMax: parseInt((e.target as HTMLInputElement).value) || 0 })}
          />
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .route-row {
    border: 1px solid var(--hf-panel-border);
    border-radius: 4px;
    overflow: hidden;
  }

  .route-row.disabled {
    opacity: 0.5;
  }

  .route-summary {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    background: var(--hf-editor-background);
  }

  .method-select {
    width: 80px;
    padding: 3px 4px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border);
    border-radius: 2px;
    font-size: 11px;
    font-weight: 700;
  }

  .method-select.method-get { color: #61affe; }
  .method-select.method-post { color: #49cc90; }
  .method-select.method-put { color: #fca130; }
  .method-select.method-delete { color: #f93e3e; }
  .method-select.method-patch { color: #50e3c2; }

  .path-input {
    flex: 1;
    padding: 3px 6px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border);
    border-radius: 2px;
    font-size: 12px;
    font-family: var(--hf-editor-font-family);
  }

  .status-input {
    width: 55px;
    padding: 3px 4px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border);
    border-radius: 2px;
    font-size: 12px;
    text-align: center;
  }

  .expand-btn, .remove-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 12px;
    padding: 2px 6px;
    color: var(--hf-descriptionForeground);
  }

  .expand-btn:hover, .remove-btn:hover {
    color: var(--hf-foreground);
  }

  .remove-btn {
    font-size: 16px;
    color: var(--hf-errorForeground);
  }

  .route-details {
    padding: 10px 8px;
    border-top: 1px solid var(--hf-panel-border);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .detail-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .detail-row label {
    font-size: 11px;
    color: var(--hf-descriptionForeground);
    font-weight: 600;
  }

  .detail-row input,
  .detail-row textarea {
    padding: 4px 8px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border);
    border-radius: 2px;
    font-size: 12px;
    font-family: var(--hf-editor-font-family);
    resize: vertical;
  }

  .latency-inputs {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .latency-inputs input {
    width: 80px;
  }

  .latency-inputs span {
    font-size: 12px;
    color: var(--hf-descriptionForeground);
  }
</style>
