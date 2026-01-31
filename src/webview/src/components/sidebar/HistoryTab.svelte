<script lang="ts">
  // Placeholder for history functionality
  // Will be implemented in Phase 5
</script>

<div class="history-tab">
  <div class="toolbar">
    <button class="toolbar-button" title="Clear History">
      <span class="codicon">&#128465;</span>
      Clear
    </button>
  </div>

  <div class="empty-state">
    <div class="empty-icon">&#128337;</div>
    <p class="empty-title">No History</p>
    <p class="empty-description">
      Your request history will appear here
    </p>
  </div>
</div>

<style>
  .history-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .toolbar {
    display: flex;
    justify-content: flex-end;
    padding: 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .toolbar-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: transparent;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    color: var(--vscode-foreground);
    cursor: pointer;
    font-size: 12px;
    opacity: 0.7;
    transition: opacity 0.15s, background 0.15s;
  }

  .toolbar-button:hover {
    opacity: 1;
    background: var(--vscode-list-hoverBackground);
  }

  .codicon {
    font-size: 14px;
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 20px;
    text-align: center;
  }

  .empty-icon {
    font-size: 48px;
    margin-bottom: 12px;
    opacity: 0.5;
  }

  .empty-title {
    margin: 0 0 8px;
    font-size: 14px;
    font-weight: 500;
    color: var(--vscode-foreground);
  }

  .empty-description {
    margin: 0;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    max-width: 200px;
  }
</style>
