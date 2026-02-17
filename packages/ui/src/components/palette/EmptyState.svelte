<script lang="ts">
  interface Props {
    query: string;
    loading?: boolean;
  }

  let { query, loading = false }: Props = $props();
</script>

<div class="empty-state">
  {#if loading}
    <div class="spinner-container">
      <div class="spinner"></div>
      <p>Searching...</p>
    </div>
  {:else if query}
    <div class="no-results">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
        <path
          d="M21 21L16.65 16.65M19 11C19 15.4183 15.4183 19 11 19C6.58172 19 3 15.4183 3 11C3 6.58172 6.58172 3 11 3C15.4183 3 19 6.58172 19 11Z"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M8 11H14"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
      </svg>
      <h3>No matches found</h3>
      <p>Try a different search term or filter</p>
    </div>
  {:else}
    <div class="hints">
      <h3>Quick Tips</h3>
      <ul>
        <li>
          <code>GET</code> — Filter by HTTP method (implicit)
        </li>
        <li>
          <code>m:POST</code> — Filter by method
        </li>
        <li>
          <code>c:Auth</code> — Filter by collection
        </li>
        <li>
          <code>b:stripe</code> — Search in request bodies
        </li>
        <li>
          <code>h:auth</code> — Search in headers
        </li>
        <li>
          <code>p:userId</code> — Search in query parameters
        </li>
      </ul>
    </div>
  {/if}
</div>

<style>
  .empty-state {
    padding: 2rem;
    text-align: center;
    color: var(--vscode-descriptionForeground);
  }

  .spinner-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--vscode-progressBar-background);
    border-top-color: var(--vscode-focusBorder);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .no-results svg {
    color: var(--vscode-descriptionForeground);
    opacity: 0.5;
    margin-bottom: 1rem;
  }

  .no-results h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    font-weight: 500;
    color: var(--vscode-foreground);
  }

  .no-results p {
    margin: 0;
    font-size: 0.9rem;
  }

  .hints {
    text-align: left;
    max-width: 400px;
    margin: 0 auto;
  }

  .hints h3 {
    margin: 0 0 1rem;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--vscode-foreground);
    text-align: center;
  }

  .hints ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .hints li {
    font-size: 0.85rem;
    line-height: 1.4;
  }

  .hints code {
    background: var(--vscode-textCodeBlock-background);
    color: var(--vscode-textPreformat-foreground);
    padding: 0.2rem 0.4rem;
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family);
    font-size: 0.85em;
  }
</style>
