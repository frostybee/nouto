<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { BodyState } from '../../stores/request.svelte';
  import { request, setMethod } from '../../stores/request.svelte';
  import type { BodyType, AuthState, KeyValue } from '../../types';
  import { setRequestTab } from '../../stores/ui.svelte';
  import { parseFormData, stringifyFormData, type FormDataItem } from '../../lib/form-helpers';
  import KeyValueEditor from './KeyValueEditor.svelte';
  import FormDataEditor from './FormDataEditor.svelte';
  import BinaryBodyEditor from './BinaryBodyEditor.svelte';
  import GraphQLEditor from './GraphQLEditor.svelte';
  import CodeMirrorEditor from './CodeMirrorEditor.svelte';
  import CopyButton from './CopyButton.svelte';
  import Tooltip from './Tooltip.svelte';


  interface Props {
    body?: BodyState;
    onchange?: (body: BodyState) => void;
    url?: string;
    headers?: KeyValue[];
    auth?: AuthState;
    zoom?: number;
    zoomMin?: number;
    zoomMax?: number;
    onZoomIn?: () => void;
    onZoomOut?: () => void;
    onZoomReset?: () => void;
  }
  let { body = { type: 'none', content: '' }, onchange, url, headers, auth, zoom = 0, zoomMin = -2, zoomMax = 24, onZoomIn, onZoomOut, onZoomReset }: Props = $props();

  // Cache body content per type so switching away and back restores previous content
  const bodyCache = new Map<BodyType, BodyState>();

  const bodyTypes: { id: BodyType; label: string }[] = [
    { id: 'none', label: 'None' },
    { id: 'json', label: 'JSON' },
    { id: 'text', label: 'Text' },
    { id: 'xml', label: 'XML' },
    { id: 'form-data', label: 'Form Data' },
    { id: 'x-www-form-urlencoded', label: 'URL Encoded' },
    { id: 'binary', label: 'Binary' },
    { id: 'graphql', label: 'GraphQL' },
  ];

  const formData = $derived((body.type === 'form-data' || body.type === 'x-www-form-urlencoded')
    ? parseFormData(body.content)
    : []);

  function updateBody(newBody: BodyState) {
    body = newBody;
    onchange?.(body);
  }

  function setBodyType(type: BodyType) {
    if (type === body.type) return;

    // Stash current body before switching
    if (body.type !== 'none') {
      bodyCache.set(body.type, { ...body });
    }

    const cached = bodyCache.get(type);

    if (type === 'none') {
      updateBody({ type: 'none', content: '' });
    } else if (type === 'json') {
      updateBody({ type: 'json', content: cached?.content ?? (body.type === 'text' ? body.content : '') });
    } else if (type === 'text') {
      updateBody({ type: 'text', content: cached?.content ?? (body.type === 'json' ? body.content : '') });
    } else if (type === 'xml') {
      updateBody({ type: 'xml', content: cached?.content ?? '' });
    } else if (type === 'form-data' || type === 'x-www-form-urlencoded') {
      const fallback = (body.type === 'form-data' || body.type === 'x-www-form-urlencoded') ? body.content : '[]';
      updateBody({ type, content: cached?.content ?? fallback });
    } else if (type === 'binary') {
      updateBody(cached ?? { type: 'binary', content: '', fileName: undefined, fileSize: undefined, fileMimeType: undefined });
    } else if (type === 'graphql') {
      updateBody(cached ?? { type: 'graphql', content: '', graphqlVariables: body.graphqlVariables, graphqlOperationName: body.graphqlOperationName });
      // Auto-switch GET to POST for GraphQL (standard convention)
      if (request.method === 'GET') {
        setMethod('POST');
      }
      setRequestTab('body');
    }
  }

  // Auto-format state
  const AUTO_FORMAT_KEY = 'nouto-json-autoformat';
  let autoFormat = $state(localStorage.getItem(AUTO_FORMAT_KEY) !== 'false');
  let autoFormatTimer: ReturnType<typeof setTimeout> | null = null;
  let formattedByAutoFormat = false;
  let skipNextAutoFormat = false;

  // Word wrap state
  const WORD_WRAP_KEY = 'nouto-body-wordwrap';
  let wordWrap = $state(localStorage.getItem(WORD_WRAP_KEY) !== 'false');

  function toggleWordWrap() {
    wordWrap = !wordWrap;
    localStorage.setItem(WORD_WRAP_KEY, String(wordWrap));
  }

  function toggleAutoFormat() {
    autoFormat = !autoFormat;
    localStorage.setItem(AUTO_FORMAT_KEY, String(autoFormat));
  }

  function performAutoFormat() {
    if (body.type !== 'json' || !body.content.trim()) return;
    if (body.content.length > 1_000_000) return;
    try {
      const parsed = JSON.parse(body.content);
      const formatted = JSON.stringify(parsed, null, 2);
      if (formatted !== body.content) {
        formattedByAutoFormat = true;
        updateContent(formatted);
      }
    } catch {
      // Invalid JSON, don't format
    }
  }

  function scheduleAutoFormat(delayMs = 1000) {
    if (autoFormatTimer) clearTimeout(autoFormatTimer);
    autoFormatTimer = setTimeout(() => {
      autoFormatTimer = null;
      performAutoFormat();
    }, delayMs);
  }

  function handlePaste() {
    if (!autoFormat) return;
    scheduleAutoFormat(300);
  }

  onDestroy(() => {
    if (autoFormatTimer) clearTimeout(autoFormatTimer);
  });

  function updateContent(content: string) {
    updateBody({ ...body, content });
    if (autoFormat && body.type === 'json' && !formattedByAutoFormat && !skipNextAutoFormat) {
      scheduleAutoFormat();
    }
    formattedByAutoFormat = false;
    skipNextAutoFormat = false;
  }

  function handleFormDataChange(items: Array<{ key: string; value: string; enabled: boolean }>) {
    updateContent(stringifyFormData(items));
  }

  function handleFormDataEditorChange(items: FormDataItem[]) {
    updateContent(stringifyFormData(items));
  }

  function formatJson() {
    if (body.type !== 'json' || !body.content.trim()) return;
    try {
      const parsed = JSON.parse(body.content);
      updateContent(JSON.stringify(parsed, null, 2));
    } catch {
      // Invalid JSON, don't format
    }
  }

  function minifyJson() {
    if (body.type !== 'json' || !body.content.trim()) return;
    try {
      const parsed = JSON.parse(body.content);
      skipNextAutoFormat = true;
      updateContent(JSON.stringify(parsed));
    } catch {
      // Invalid JSON, don't minify
    }
  }

  // XML formatting
  function formatXml() {
    if (body.type !== 'xml' || !body.content.trim()) return;
    try {
      const xml = body.content.trim();
      let formatted = '';
      let indent = 0;
      // Split on tags but keep them
      const tokens = xml.replace(/>\s*</g, '><').split(/(<[^>]+>)/g).filter(Boolean);
      for (const token of tokens) {
        if (token.startsWith('</')) {
          indent--;
          formatted += '  '.repeat(Math.max(indent, 0)) + token + '\n';
        } else if (token.startsWith('<') && token.endsWith('/>')) {
          formatted += '  '.repeat(indent) + token + '\n';
        } else if (token.startsWith('<?') || token.startsWith('<!')) {
          formatted += '  '.repeat(indent) + token + '\n';
        } else if (token.startsWith('<')) {
          formatted += '  '.repeat(indent) + token + '\n';
          indent++;
        } else {
          // Text content
          const trimmed = token.trim();
          if (trimmed) {
            formatted += '  '.repeat(indent) + trimmed + '\n';
          }
        }
      }
      updateContent(formatted.trimEnd());
    } catch {
      // Can't format, leave as-is
    }
  }

  function minifyXml() {
    if (body.type !== 'xml' || !body.content.trim()) return;
    updateContent(body.content.replace(/>\s+</g, '><').trim());
  }

  // Capture JSON parse error message (null = valid)
  const jsonError = $derived((() => {
    if (body.type !== 'json' || !body.content.trim()) return null;
    try {
      JSON.parse(body.content);
      return null;
    } catch (e) {
      return (e as SyntaxError).message;
    }
  })());
</script>

<div class="body-editor">
  <div class="body-type-selector">
    <div class="body-types">
      {#each bodyTypes as bodyType}
        <button
          class="body-type-btn"
          class:active={body.type === bodyType.id}
          onclick={() => setBodyType(bodyType.id)}
        >
          {bodyType.label}
        </button>
      {/each}
      <Tooltip text="Only the active body type is sent with the request" position="bottom">
        <span class="body-info-icon codicon codicon-question"></span>
      </Tooltip>
    </div>
  </div>

  <div class="body-content">
    {#if body.type === 'none'}
      <div class="empty-state">
        <p>This request does not have a body.</p>
      </div>
    {:else if body.type === 'json'}
      <div class="editor-toolbar">
        <Tooltip text="Auto-format JSON after typing">
          <label class="auto-format-toggle">
            <input type="checkbox" checked={autoFormat} onchange={toggleAutoFormat} />
            <span class="toggle-slider"></span>
            <span class="toggle-label">Auto-format</span>
          </label>
        </Tooltip>
        <Tooltip text="Format JSON">
          <button class="toolbar-btn" onclick={formatJson}>
            <span class="codicon codicon-list-flat"></span> Format
          </button>
        </Tooltip>
        <Tooltip text="Minify JSON">
          <button class="toolbar-btn" onclick={minifyJson}>
            <span class="codicon codicon-fold"></span> Minify
          </button>
        </Tooltip>
        <CopyButton text={body.content ?? ''} />
        <Tooltip text="Toggle word wrap">
          <button class="toolbar-btn" class:active={wordWrap} onclick={toggleWordWrap}>
            <span class="codicon codicon-word-wrap"></span> Wrap
          </button>
        </Tooltip>
        {#if onZoomIn}
          <div class="zoom-controls">
            <Tooltip text="Decrease font size (double-click to reset)" position="bottom">
              <button class="toolbar-btn zoom-btn" onclick={onZoomOut} ondblclick={onZoomReset} disabled={zoom <= zoomMin} aria-label="Decrease font size">
                <i class="codicon codicon-zoom-out"></i>
              </button>
            </Tooltip>
            {#if zoom !== 0}
              <Tooltip text="Reset zoom" position="bottom">
                <button class="zoom-badge" onclick={onZoomReset} aria-label="Reset zoom">
                  {zoom > 0 ? '+' : ''}{zoom}
                </button>
              </Tooltip>
            {/if}
            <Tooltip text="Increase font size" position="bottom">
              <button class="toolbar-btn zoom-btn" onclick={onZoomIn} disabled={zoom >= zoomMax} aria-label="Increase font size">
                <i class="codicon codicon-zoom-in"></i>
              </button>
            </Tooltip>
          </div>
        {/if}
      </div>
      {#if jsonError}
        <div class="json-error-banner">
          <span class="codicon codicon-error error-icon"></span>
          <span class="error-text">{jsonError}</span>
        </div>
      {/if}
      <CodeMirrorEditor
        content={body.content}
        language="json"
        placeholder={'{"key": "value"}'}
        onchange={updateContent}
        onpaste={handlePaste}
        enableLint={true}
        {wordWrap}
      />
    {:else if body.type === 'text'}
      <div class="editor-toolbar">
        <CopyButton text={body.content ?? ''} />
        <Tooltip text="Toggle word wrap">
          <button class="toolbar-btn" class:active={wordWrap} onclick={toggleWordWrap}>
            <span class="codicon codicon-word-wrap"></span> Wrap
          </button>
        </Tooltip>
      </div>
      <CodeMirrorEditor
        content={body.content}
        language="text"
        placeholder="Enter request body..."
        onchange={updateContent}
        {wordWrap}
      />
    {:else if body.type === 'xml'}
      <div class="editor-toolbar">
        <Tooltip text="Format XML">
          <button class="toolbar-btn" onclick={formatXml}>
            <span class="codicon codicon-list-flat"></span> Format
          </button>
        </Tooltip>
        <Tooltip text="Minify XML">
          <button class="toolbar-btn" onclick={minifyXml}>
            <span class="codicon codicon-fold"></span> Minify
          </button>
        </Tooltip>
        <CopyButton text={body.content ?? ''} />
        <Tooltip text="Toggle word wrap">
          <button class="toolbar-btn" class:active={wordWrap} onclick={toggleWordWrap}>
            <span class="codicon codicon-word-wrap"></span> Wrap
          </button>
        </Tooltip>
      </div>
      <CodeMirrorEditor
        content={body.content}
        language="xml"
        placeholder="<root></root>"
        onchange={updateContent}
        {wordWrap}
      />
    {:else if body.type === 'form-data'}
      <div class="form-editor">
        <p class="form-hint">Form data will be sent with Content-Type: multipart/form-data</p>
        <FormDataEditor
          items={formData}
          onchange={handleFormDataEditorChange}
        />
      </div>
    {:else if body.type === 'x-www-form-urlencoded'}
      <div class="form-editor">
        <p class="form-hint">Data will be URL-encoded in the request body</p>
        <KeyValueEditor
          items={formData}
          keyPlaceholder="Field name"
          valuePlaceholder="Value"
          onchange={handleFormDataChange}
        />
      </div>
    {:else if body.type === 'binary'}
      <BinaryBodyEditor
        {body}
        onchange={(newBody) => updateBody(newBody)}
      />
    {:else if body.type === 'graphql'}
      <GraphQLEditor
        {body}
        onchange={(newBody) => updateBody(newBody)}
        {url}
        {headers}
        {auth}
      />
    {/if}
  </div>
</div>

<style>
  .body-editor {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
  }

  .body-types {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    align-items: center;
  }

  .body-info-icon {
    font-size: 14px;
    opacity: 0.4;
    cursor: help;
    margin-left: 4px;
    transition: opacity 0.15s;
  }

  .body-info-icon:hover {
    opacity: 0.8;
  }

  .body-type-btn {
    padding: 6px 12px;
    background: transparent;
    color: var(--hf-foreground);
    border: 1px solid var(--hf-panel-border);
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    transition: all 0.15s;
    opacity: 0.7;
  }

  .body-type-btn:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
  }

  .body-type-btn.active {
    opacity: 1;
    background: var(--hf-list-activeSelectionBackground);
    color: var(--hf-list-activeSelectionForeground);
    border-color: var(--hf-focusBorder);
  }

  .body-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 100px;
    color: var(--hf-descriptionForeground);
  }

  .empty-state p {
    margin: 0;
    font-size: 13px;
    font-style: italic;
  }

  .editor-toolbar {
    display: flex;
    gap: 8px;
    padding: 4px 0;
    align-items: center;
  }

  .toolbar-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: transparent;
    color: var(--hf-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
    transition: background 0.15s, border-color 0.15s;
  }

  .toolbar-btn .codicon {
    font-size: 12px;
  }

  .toolbar-btn:hover {
    background: var(--hf-list-hoverBackground);
    border-color: var(--hf-focusBorder);
  }

  .toolbar-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .zoom-controls {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: auto;
  }

  .zoom-btn {
    padding: 4px 5px;
    border-color: transparent;
  }

  .zoom-btn .codicon {
    font-size: 16px;
  }

  .zoom-badge {
    font-size: 10px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    padding: 1px 4px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    border: none;
    border-radius: 8px;
    cursor: pointer;
    line-height: 14px;
  }

  .zoom-badge:hover {
    opacity: 0.8;
  }

  .toolbar-btn.active {
    background: var(--hf-list-activeSelectionBackground);
    color: var(--hf-list-activeSelectionForeground);
    border-color: var(--hf-focusBorder);
  }

  .json-error-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: var(--hf-inputValidation-errorBackground, rgba(255, 0, 0, 0.1));
    border: 1px solid var(--hf-inputValidation-errorBorder, var(--hf-errorForeground));
    border-radius: 4px;
    font-size: 12px;
    color: var(--hf-foreground);
  }

  .json-error-banner .error-icon {
    color: var(--hf-errorForeground);
    font-size: 14px;
    flex-shrink: 0;
  }

  .json-error-banner .error-text {
    font-family: var(--hf-editor-font-family, monospace);
    font-size: 12px;
    word-break: break-word;
  }

  .form-editor {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .form-hint {
    margin: 0;
    padding: 8px 12px;
    background: var(--hf-textBlockQuote-background);
    border-left: 3px solid var(--hf-textBlockQuote-border);
    font-size: 11px;
    color: var(--hf-descriptionForeground);
    border-radius: 0 4px 4px 0;
  }

  .auto-format-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-size: 11px;
    color: var(--hf-descriptionForeground);
    user-select: none;
  }

  .auto-format-toggle input[type="checkbox"] {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-slider {
    position: relative;
    display: inline-block;
    width: 28px;
    height: 14px;
    background: var(--hf-input-background);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 7px;
    transition: background 0.2s, border-color 0.2s;
  }

  .toggle-slider::after {
    content: '';
    position: absolute;
    top: 1px;
    left: 1px;
    width: 10px;
    height: 10px;
    background: var(--hf-foreground);
    border-radius: 50%;
    transition: transform 0.2s;
    opacity: 0.5;
  }

  .auto-format-toggle input:checked + .toggle-slider {
    background: var(--hf-focusBorder);
    border-color: var(--hf-focusBorder);
  }

  .auto-format-toggle input:checked + .toggle-slider::after {
    transform: translateX(14px);
    opacity: 1;
    background: var(--hf-editor-background);
  }

  .toggle-label {
    opacity: 0.8;
  }
</style>
