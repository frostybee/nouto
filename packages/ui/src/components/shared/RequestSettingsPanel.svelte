<script lang="ts">
  import type { SslConfig } from '../../types';
  import { postMessage, onMessage } from '../../lib/vscode';

  interface Props {
    ssl?: SslConfig;
    onchange?: (ssl: SslConfig) => void;
  }
  let { ssl = {}, onchange }: Props = $props();

  function update(patch: Partial<SslConfig>) {
    const updated = { ...ssl, ...patch };
    onchange?.(updated);
  }

  function pickFile(field: 'cert' | 'key') {
    postMessage({ type: 'pickSslFile', data: { field } });
  }

  $effect(() => {
    const cleanup = onMessage((msg: any) => {
      if (msg.type === 'sslFilePicked') {
        const { field, path } = msg.data as { field: 'cert' | 'key'; path: string };
        if (field === 'cert') update({ certPath: path });
        else if (field === 'key') update({ keyPath: path });
      }
    });
    return cleanup;
  });
</script>

<div class="settings-panel">
  <section class="settings-section">
    <h3 class="section-title">SSL / TLS</h3>

    <label class="toggle-row">
      <span class="toggle-label">Verify SSL certificate</span>
      <span class="toggle-hint">Disable to accept self-signed or invalid certificates</span>
      <input
        type="checkbox"
        checked={ssl.rejectUnauthorized !== false}
        onchange={(e) => update({ rejectUnauthorized: e.currentTarget.checked })}
      />
    </label>
  </section>

  <section class="settings-section">
    <h3 class="section-title">Client Certificate (mTLS)</h3>

    <div class="file-field">
      <label class="file-label">Certificate file <span class="optional">(.pem, .crt)</span></label>
      <div class="file-row">
        <span class="file-path" class:empty={!ssl.certPath}>{ssl.certPath || 'No file selected'}</span>
        <button class="pick-btn" onclick={() => pickFile('cert')}>Browse…</button>
        {#if ssl.certPath}
          <button class="clear-btn" onclick={() => update({ certPath: undefined })} title="Clear">✕</button>
        {/if}
      </div>
    </div>

    <div class="file-field">
      <label class="file-label">Key file <span class="optional">(.pem, .key)</span></label>
      <div class="file-row">
        <span class="file-path" class:empty={!ssl.keyPath}>{ssl.keyPath || 'No file selected'}</span>
        <button class="pick-btn" onclick={() => pickFile('key')}>Browse…</button>
        {#if ssl.keyPath}
          <button class="clear-btn" onclick={() => update({ keyPath: undefined })} title="Clear">✕</button>
        {/if}
      </div>
    </div>

    <div class="text-field">
      <label for="ssl-passphrase" class="file-label">Passphrase <span class="optional">(if key is encrypted)</span></label>
      <input
        id="ssl-passphrase"
        type="password"
        placeholder="Enter passphrase"
        value={ssl.passphrase || ''}
        oninput={(e) => update({ passphrase: e.currentTarget.value || undefined })}
      />
    </div>
  </section>
</div>

<style>
  .settings-panel {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .settings-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    background: var(--hf-input-background);
    border: 1px solid var(--hf-panel-border);
    border-radius: 6px;
  }

  .section-title {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--hf-descriptionForeground);
  }

  .toggle-row {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    gap: 2px 8px;
    align-items: start;
    cursor: pointer;
  }

  .toggle-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--hf-foreground);
    grid-column: 1;
    grid-row: 1;
  }

  .toggle-hint {
    font-size: 11px;
    color: var(--hf-descriptionForeground);
    grid-column: 1;
    grid-row: 2;
  }

  .toggle-row input[type="checkbox"] {
    grid-column: 2;
    grid-row: 1 / 3;
    align-self: center;
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  .file-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .file-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--hf-foreground);
  }

  .optional {
    font-weight: 400;
    opacity: 0.6;
    font-size: 11px;
  }

  .file-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .file-path {
    flex: 1;
    padding: 6px 10px;
    background: var(--hf-editor-background);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    font-size: 12px;
    font-family: var(--hf-editor-font-family), monospace;
    color: var(--hf-input-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .file-path.empty {
    color: var(--hf-input-placeholderForeground);
    font-style: italic;
  }

  .pick-btn {
    padding: 5px 12px;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .pick-btn:hover {
    background: var(--hf-button-secondaryHoverBackground);
  }

  .clear-btn {
    padding: 4px 8px;
    background: transparent;
    color: var(--hf-foreground);
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    opacity: 0.6;
    flex-shrink: 0;
  }

  .clear-btn:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
  }

  .text-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .text-field input {
    padding: 7px 10px;
    background: var(--hf-editor-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    font-size: 13px;
  }

  .text-field input:focus {
    outline: none;
    border-color: var(--hf-focusBorder);
  }

  .text-field input::placeholder {
    color: var(--hf-input-placeholderForeground);
  }
</style>
