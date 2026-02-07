<script lang="ts">
  interface Props {
    path: string;
  }
  let { path }: Props = $props();

  let copied = $state(false);
  let copyTimeout: ReturnType<typeof setTimeout>;

  async function handleCopy() {
    if (!path) return;
    try {
      await navigator.clipboard.writeText(path);
      copied = true;
      clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => { copied = false; }, 1500);
    } catch (err) {
      console.error('Failed to copy path:', err);
    }
  }
</script>

{#if path}
  <button class="json-path-bar" onclick={handleCopy} title="Click to copy path">
    <span class="path-text">{path}</span>
    {#if copied}
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
    background: var(--vscode-textCodeBlock-background, rgba(128, 128, 128, 0.08));
    border: none;
    border-top: 1px solid var(--vscode-panel-border, rgba(128, 128, 128, 0.2));
    color: var(--vscode-descriptionForeground, #888);
    font-family: var(--vscode-editor-font-family, Consolas, Monaco, monospace);
    font-size: 11px;
    cursor: pointer;
    flex-shrink: 0;
    text-align: left;
    width: 100%;
    transition: background 0.15s;
  }

  .json-path-bar:hover {
    background: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.12));
  }

  .path-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .copied-badge {
    color: var(--vscode-testing-iconPassed, #73c991);
    font-size: 10px;
    flex-shrink: 0;
  }
</style>
