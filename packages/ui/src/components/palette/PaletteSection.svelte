<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    count?: number;
    children: Snippet;
  }

  let { title, count, children }: Props = $props();
</script>

<section class="palette-section">
  <h3 class="section-header">
    <span class="section-title">{title}</span>
    {#if count !== undefined}
      <span class="section-count">{count}</span>
    {/if}
  </h3>
  <div class="section-content">
    {@render children()}
  </div>
</section>

<style>
  .palette-section {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0;
    padding: 0.5rem 1rem;
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--vscode-descriptionForeground);
    background: var(--vscode-sideBar-background);
    border-bottom: 1px solid var(--vscode-sideBar-border);
  }

  .section-title {
    flex: 1;
  }

  .section-count {
    font-variant-numeric: tabular-nums;
    opacity: 0.6;
  }

  .section-content {
    display: flex;
    flex-direction: column;
  }
</style>
