<script lang="ts">
  import Tooltip from './Tooltip.svelte';
  import { inferJsonSchema } from '@nouto/core';
  import { copyToClipboard } from '../../lib/clipboard';
  import { postMessage } from '../../lib/vscode';
  import { hostCapabilities } from '../../stores/hostCapabilities.svelte';

  interface Props {
    /** Parsed JSON response body. */
    data: unknown;
    requestUrl?: string;
  }
  let { data, requestUrl }: Props = $props();

  let open = $state(false);
  let copied = $state(false);
  let dropdownRef = $state<HTMLDivElement>(undefined!);

  /** `isJson` holds for JSON-typed string bodies too — parse those first. */
  function parsedBody(): unknown {
    const body = $state.snapshot(data);
    if (typeof body !== 'string') return body;
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }

  async function copyAsJsonSchema() {
    const schema = inferJsonSchema(parsedBody(), { dialect: 'standalone' });
    const ok = await copyToClipboard(JSON.stringify(schema, null, 2));
    if (ok) {
      copied = true;
      setTimeout(() => { copied = false; }, 1500);
    }
    open = false;
  }

  function addAsComponentSchema() {
    // The raw body is sent, not a schema: only the host knows the target
    // document's OpenAPI version (nullable vs type-array encoding).
    postMessage({
      type: 'addResponseSchemaToSpec',
      data: { body: parsedBody(), requestUrl: requestUrl || '' },
    });
    open = false;
  }

  $effect(() => {
    if (open) {
      const handleClickOutside = (e: MouseEvent) => {
        if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
          open = false;
        }
      };
      document.addEventListener('click', handleClickOutside, true);
      return () => document.removeEventListener('click', handleClickOutside, true);
    }
  });
</script>

<div class="dropdown-container" bind:this={dropdownRef}>
  <Tooltip text="JSON Schema actions">
    <button
      class="toolbar-btn"
      onclick={() => { open = !open; }}
      aria-label="JSON Schema actions"
    >
      <span class="codicon codicon-symbol-structure"></span>
      <span class="codicon codicon-chevron-down chevron" class:open></span>
    </button>
  </Tooltip>
  {#if open}
    <div class="dropdown-menu">
      <button class="menu-item" onclick={copyAsJsonSchema}>
        <span class="codicon {copied ? 'codicon-check' : 'codicon-copy'}"></span>
        Copy as JSON Schema
      </button>
      {#if hostCapabilities.canEditOpenApiSpec}
        <button class="menu-item" onclick={addAsComponentSchema}>
          <span class="codicon codicon-add"></span>
          Add as component schema
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .dropdown-container {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .toolbar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.154rem;
    padding: 0.308rem 0.462rem;
    background: transparent;
    color: var(--hf-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 0.308rem;
    cursor: pointer;
    font-size: 1.077rem;
    transition: background 0.15s;
  }

  .toolbar-btn:hover {
    background: var(--hf-list-hoverBackground);
  }

  .chevron {
    font-size: 0.769rem;
    transition: transform 0.15s;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 13.077rem;
    background: var(--hf-editorWidget-background, #252526);
    border: 1px solid var(--hf-editorWidget-border, #454545);
    border-radius: 0.308rem;
    padding: 0.308rem 0;
    z-index: 100;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 0.462rem;
    width: 100%;
    padding: 0.385rem 0.923rem;
    background: transparent;
    color: var(--hf-foreground);
    border: none;
    cursor: pointer;
    font-size: 0.923rem;
    text-align: left;
    white-space: nowrap;
    transition: background 0.1s;
  }

  .menu-item:hover {
    background: var(--hf-list-hoverBackground, rgba(128, 128, 128, 0.12));
  }
</style>
