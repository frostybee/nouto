<script lang="ts">
  import { scriptOutput } from '../../stores/scripts';
  import type { ScriptResult } from '../../types';

  const preResult = $derived($scriptOutput.preRequest);
  const postResult = $derived($scriptOutput.postResponse);

  function formatTime(ms: number): string {
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
  }

  function getLevelClass(level: string): string {
    switch (level) {
      case 'warn': return 'log-warn';
      case 'error': return 'log-error';
      case 'info': return 'log-info';
      default: return 'log-log';
    }
  }
</script>

<div class="script-output">
  {#if !preResult && !postResult}
    <p class="placeholder">No script results yet. Add scripts in the Scripts request tab and send a request.</p>
  {:else}
    {#if preResult}
      <div class="section">
        <div class="section-header">
          <span class="section-title">Pre-request Script</span>
          <span class="duration">{formatTime(preResult.duration)}</span>
          {#if preResult.success}
            <span class="badge success">OK</span>
          {:else}
            <span class="badge error">Error</span>
          {/if}
        </div>

        {#if preResult.error}
          <div class="error-message">{preResult.error}</div>
        {/if}

        {#if preResult.logs.length > 0}
          <div class="console-output">
            {#each preResult.logs as log}
              <div class="log-entry {getLevelClass(log.level)}">
                <span class="log-level">[{log.level}]</span>
                <span class="log-text">{log.args.join(' ')}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    {#if postResult}
      <div class="section">
        <div class="section-header">
          <span class="section-title">Post-response Script</span>
          <span class="duration">{formatTime(postResult.duration)}</span>
          {#if postResult.success}
            <span class="badge success">OK</span>
          {:else}
            <span class="badge error">Error</span>
          {/if}
        </div>

        {#if postResult.error}
          <div class="error-message">{postResult.error}</div>
        {/if}

        {#if postResult.logs.length > 0}
          <div class="console-output">
            {#each postResult.logs as log}
              <div class="log-entry {getLevelClass(log.level)}">
                <span class="log-level">[{log.level}]</span>
                <span class="log-text">{log.args.join(' ')}</span>
              </div>
            {/each}
          </div>
        {/if}

        {#if postResult.testResults.length > 0}
          <div class="test-results">
            <div class="test-header">
              Tests: {postResult.testResults.filter(t => t.passed).length}/{postResult.testResults.length} passed
            </div>
            {#each postResult.testResults as test}
              <div class="test-entry" class:passed={test.passed} class:failed={!test.passed}>
                <span class="test-icon">{test.passed ? '\u2713' : '\u2717'}</span>
                <span class="test-name">{test.name}</span>
                {#if test.error}
                  <span class="test-error">{test.error}</span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .script-output {
    padding: 4px;
    font-size: 12px;
  }

  .placeholder {
    color: var(--hf-descriptionForeground);
    font-style: italic;
    font-size: 13px;
  }

  .section {
    margin-bottom: 12px;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid var(--hf-panel-border);
    margin-bottom: 6px;
  }

  .section-title {
    font-weight: 600;
    color: var(--hf-foreground);
  }

  .duration {
    font-size: 11px;
    color: var(--hf-descriptionForeground);
  }

  .badge {
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .badge.success {
    background: rgba(73, 204, 144, 0.15);
    color: #49cc90;
  }

  .badge.error {
    background: rgba(249, 62, 62, 0.15);
    color: #f93e3e;
  }

  .error-message {
    padding: 6px 8px;
    background: rgba(249, 62, 62, 0.1);
    border: 1px solid rgba(249, 62, 62, 0.3);
    border-radius: 3px;
    color: #f93e3e;
    font-family: var(--hf-editor-font-family, monospace);
    font-size: 12px;
    margin-bottom: 6px;
  }

  .console-output {
    background: var(--hf-terminal-background, var(--hf-editor-background));
    border: 1px solid var(--hf-panel-border);
    border-radius: 3px;
    padding: 4px;
    margin-bottom: 6px;
    max-height: 200px;
    overflow-y: auto;
  }

  .log-entry {
    padding: 2px 4px;
    font-family: var(--hf-editor-font-family, monospace);
    font-size: 11px;
    display: flex;
    gap: 6px;
  }

  .log-level {
    opacity: 0.6;
    min-width: 40px;
  }

  .log-log { color: var(--hf-terminal-foreground, var(--hf-foreground)); }
  .log-warn { color: var(--hf-terminal-ansiYellow, #e5c07b); }
  .log-error { color: var(--hf-terminal-ansiRed, #f93e3e); }
  .log-info { color: var(--hf-terminal-ansiBlue, #61affe); }

  .test-results {
    border: 1px solid var(--hf-panel-border);
    border-radius: 3px;
    overflow: hidden;
  }

  .test-header {
    padding: 4px 8px;
    background: var(--hf-editor-background);
    border-bottom: 1px solid var(--hf-panel-border);
    font-weight: 600;
    font-size: 11px;
  }

  .test-entry {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    font-size: 12px;
  }

  .test-entry.passed .test-icon { color: #49cc90; }
  .test-entry.failed .test-icon { color: #f93e3e; }

  .test-name {
    color: var(--hf-foreground);
  }

  .test-error {
    color: var(--hf-descriptionForeground);
    font-size: 11px;
    margin-left: auto;
  }
</style>
