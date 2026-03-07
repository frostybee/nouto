<script lang="ts">
  import type { SslConfig, ProxyConfig } from '../../types';
  import { postMessage, onMessage } from '../../lib/vscode';

  interface Props {
    ssl?: SslConfig;
    proxy?: ProxyConfig;
    timeout?: number;
    followRedirects?: boolean;
    maxRedirects?: number;
    onSslChange?: (ssl: SslConfig) => void;
    onProxyChange?: (proxy: ProxyConfig | undefined) => void;
    onTimeoutChange?: (timeout: number | undefined) => void;
    onRedirectsChange?: (followRedirects: boolean | undefined, maxRedirects: number | undefined) => void;
    /** @deprecated Use onSslChange instead */
    onchange?: (ssl: SslConfig) => void;
  }
  let { ssl = {}, proxy, timeout, followRedirects, maxRedirects, onSslChange, onProxyChange, onTimeoutChange, onRedirectsChange, onchange }: Props = $props();

  function update(patch: Partial<SslConfig>) {
    const updated = { ...ssl, ...patch };
    (onSslChange ?? onchange)?.(updated);
  }

  const defaultProxy: ProxyConfig = { enabled: false, protocol: 'http', host: '', port: 8080 };
  const currentProxy = $derived(proxy ?? defaultProxy);

  function updateProxy(patch: Partial<ProxyConfig>) {
    const updated = { ...currentProxy, ...patch };
    onProxyChange?.(updated.enabled || updated.host ? updated : undefined);
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
      <span class="file-label">Certificate file <span class="optional">(.pem, .crt)</span></span>
      <div class="file-row">
        <span class="file-path" class:empty={!ssl.certPath}>{ssl.certPath || 'No file selected'}</span>
        <button class="pick-btn" onclick={() => pickFile('cert')}>Browse…</button>
        {#if ssl.certPath}
          <button class="clear-btn" onclick={() => update({ certPath: undefined })} title="Clear">✕</button>
        {/if}
      </div>
    </div>

    <div class="file-field">
      <span class="file-label">Key file <span class="optional">(.pem, .key)</span></span>
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

  <section class="settings-section">
    <h3 class="section-title">Proxy</h3>

    <label class="toggle-row">
      <span class="toggle-label">Enable proxy for this request</span>
      <span class="toggle-hint">Overrides the global proxy setting</span>
      <input
        type="checkbox"
        checked={currentProxy.enabled}
        onchange={(e) => updateProxy({ enabled: e.currentTarget.checked })}
      />
    </label>

    {#if currentProxy.enabled}
      <div class="proxy-grid">
        <div class="text-field proxy-protocol">
          <label for="proxy-protocol" class="file-label">Protocol</label>
          <select
            id="proxy-protocol"
            value={currentProxy.protocol}
            onchange={(e) => updateProxy({ protocol: e.currentTarget.value as ProxyConfig['protocol'] })}
          >
            <option value="http">HTTP</option>
            <option value="https">HTTPS</option>
            <option value="socks5">SOCKS5</option>
          </select>
        </div>

        <div class="text-field proxy-host">
          <label for="proxy-host" class="file-label">Host</label>
          <input
            id="proxy-host"
            type="text"
            placeholder="127.0.0.1"
            value={currentProxy.host}
            oninput={(e) => updateProxy({ host: e.currentTarget.value })}
          />
        </div>

        <div class="text-field proxy-port">
          <label for="proxy-port" class="file-label">Port</label>
          <input
            id="proxy-port"
            type="number"
            placeholder="8080"
            value={currentProxy.port}
            oninput={(e) => updateProxy({ port: parseInt(e.currentTarget.value, 10) || 0 })}
          />
        </div>
      </div>

      <div class="proxy-grid proxy-auth">
        <div class="text-field">
          <label for="proxy-username" class="file-label">Username <span class="optional">(optional)</span></label>
          <input
            id="proxy-username"
            type="text"
            placeholder="Username"
            value={currentProxy.username || ''}
            oninput={(e) => updateProxy({ username: e.currentTarget.value || undefined })}
          />
        </div>

        <div class="text-field">
          <label for="proxy-password" class="file-label">Password <span class="optional">(optional)</span></label>
          <input
            id="proxy-password"
            type="password"
            placeholder="Password"
            value={currentProxy.password || ''}
            oninput={(e) => updateProxy({ password: e.currentTarget.value || undefined })}
          />
        </div>
      </div>

      <div class="text-field">
        <label for="proxy-noproxy" class="file-label">No proxy <span class="optional">(comma-separated hostnames to bypass)</span></label>
        <input
          id="proxy-noproxy"
          type="text"
          placeholder="localhost, 127.0.0.1, *.internal.corp"
          value={currentProxy.noProxy || ''}
          oninput={(e) => updateProxy({ noProxy: e.currentTarget.value || undefined })}
        />
      </div>
    {/if}
  </section>

  <section class="settings-section">
    <h3 class="section-title">Timeout</h3>

    <div class="text-field">
      <label for="req-timeout" class="file-label">Request timeout <span class="optional">(milliseconds)</span></label>
      <input
        id="req-timeout"
        type="number"
        placeholder="30000 (default)"
        min="0"
        max="600000"
        value={timeout ?? ''}
        oninput={(e) => {
          const val = e.currentTarget.value;
          onTimeoutChange?.(val === '' ? undefined : Math.max(0, Math.min(600000, parseInt(val, 10) || 0)));
        }}
      />
      <span class="field-hint">0 = no timeout. Leave empty for default (30s).</span>
    </div>
  </section>

  <section class="settings-section">
    <h3 class="section-title">Redirects</h3>

    <label class="toggle-row">
      <span class="toggle-label">Follow redirects</span>
      <span class="toggle-hint">Automatically follow HTTP 3xx redirects</span>
      <input
        type="checkbox"
        checked={followRedirects !== false}
        onchange={(e) => {
          const follow = e.currentTarget.checked;
          onRedirectsChange?.(follow ? undefined : false, follow ? maxRedirects : undefined);
        }}
      />
    </label>

    {#if followRedirects !== false}
      <div class="text-field">
        <label for="max-redirects" class="file-label">Max redirects</label>
        <input
          id="max-redirects"
          type="number"
          placeholder="10 (default)"
          min="1"
          max="100"
          value={maxRedirects ?? ''}
          oninput={(e) => {
            const val = e.currentTarget.value;
            onRedirectsChange?.(followRedirects, val === '' ? undefined : Math.max(1, Math.min(100, parseInt(val, 10) || 1)));
          }}
        />
      </div>
    {/if}
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

  .text-field select {
    padding: 7px 10px;
    background: var(--hf-editor-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
  }

  .text-field select:focus {
    outline: none;
    border-color: var(--hf-focusBorder);
  }

  .proxy-grid {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 8px;
  }

  .proxy-auth {
    grid-template-columns: 1fr 1fr;
  }

  .proxy-port input {
    width: 80px;
  }

  .field-hint {
    font-size: 11px;
    color: var(--hf-descriptionForeground);
  }
</style>
