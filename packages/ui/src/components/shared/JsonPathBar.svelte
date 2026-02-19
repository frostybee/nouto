<script lang="ts">
  import { copyToClipboard } from '../../lib/clipboard';

  interface Props {
    path: string;
  }
  let { path }: Props = $props();

  let copied = $state(false);
  let copyFailed = $state(false);
  let copyTimeout: ReturnType<typeof setTimeout>;

  async function handleCopy() {
    if (!path) return;
    const success = await copyToClipboard(path);
    if (success) {
      copied = true;
      copyFailed = false;
      clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => { copied = false; }, 1500);
    } else {
      copyFailed = true;
      clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => { copyFailed = false; }, 2000);
    }
  }
</script>

{#if path}
  <button class="json-path-bar" onclick={handleCopy} title="Click to copy path">
    <span class="path-text">{path}</span>
    {#if copyFailed}
      <span class="failed-badge">Copy failed</span>
    {:else if copied}
      <span class="copied-badge">{'\u2713'} Copied</span>
    {/if}
  </button>
{/if}

<style>
  .json-path-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px;
    background: var(--hf-textCodeBlock-background, rgba(128, 128, 128, 0.08));
    border: none;
    border-top: 1px solid var(--hf-panel-border, rgba(128, 128, 128, 0.2));
    color: var(--hf-descriptionForeground, #888);
    font-family: var(--hf-editor-font-family, Consolas, Monaco, monospace);
    font-size: 11px;
    cursor: pointer;
    flex-shrink: 0;
    text-align: left;
    width: 100%;
    transition: background 0.15s;
  }

  .json-path-bar:hover {
    background: var(--hf-list-hoverBackground, rgba(128, 128, 128, 0.12));
  }

  .path-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .copied-badge {
    color: var(--hf-testing-iconPassed, #73c991);
    font-size: 10px;
    flex-shrink: 0;
  }

  .failed-badge {
    color: var(--hf-errorForeground, #f44336);
    font-size: 10px;
    flex-shrink: 0;
  }
</style>
