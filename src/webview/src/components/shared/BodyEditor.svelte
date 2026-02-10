<script lang="ts">
  import type { BodyState } from '../../stores/request';
  import type { BodyType, AuthState, KeyValue } from '../../types';
  import { parseFormData, stringifyFormData, type FormDataItem } from '../../lib/form-helpers';
  import KeyValueEditor from './KeyValueEditor.svelte';
  import FormDataEditor from './FormDataEditor.svelte';
  import BinaryBodyEditor from './BinaryBodyEditor.svelte';
  import GraphQLEditor from './GraphQLEditor.svelte';
  import CodeMirrorEditor from './CodeMirrorEditor.svelte';

  interface Props {
    body?: BodyState;
    onchange?: (body: BodyState) => void;
    url?: string;
    headers?: KeyValue[];
    auth?: AuthState;
  }
  let { body = { type: 'none', content: '' }, onchange, url, headers, auth }: Props = $props();

  const bodyTypes: { id: BodyType; label: string }[] = [
    { id: 'none', label: 'None' },
    { id: 'json', label: 'JSON' },
    { id: 'text', label: 'Text' },
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
    if (type === 'none') {
      updateBody({ type: 'none', content: '' });
    } else if (type === 'json') {
      updateBody({ type: 'json', content: body.type === 'text' ? body.content : '' });
    } else if (type === 'text') {
      updateBody({ type: 'text', content: body.type === 'json' ? body.content : '' });
    } else if (type === 'form-data' || type === 'x-www-form-urlencoded') {
      const currentFormData = (body.type === 'form-data' || body.type === 'x-www-form-urlencoded')
        ? body.content
        : '[]';
      updateBody({ type, content: currentFormData });
    } else if (type === 'binary') {
      updateBody({ type: 'binary', content: '', fileName: undefined, fileSize: undefined, fileMimeType: undefined });
    } else if (type === 'graphql') {
      updateBody({ type: 'graphql', content: body.type === 'graphql' ? body.content : '', graphqlVariables: body.graphqlVariables, graphqlOperationName: body.graphqlOperationName });
    }
  }

  function updateContent(content: string) {
    updateBody({ ...body, content });
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
      updateContent(JSON.stringify(parsed));
    } catch {
      // Invalid JSON, don't minify
    }
  }

  // Check if JSON is valid
  const isValidJson = $derived((() => {
    if (body.type !== 'json' || !body.content.trim()) return true;
    try {
      JSON.parse(body.content);
      return true;
    } catch {
      return false;
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
    </div>
  </div>

  <div class="body-content">
    {#if body.type === 'none'}
      <div class="empty-state">
        <p>This request does not have a body.</p>
      </div>
    {:else if body.type === 'json'}
      <div class="editor-toolbar">
        <button class="toolbar-btn" onclick={formatJson} title="Format JSON">
          Format
        </button>
        <button class="toolbar-btn" onclick={minifyJson} title="Minify JSON">
          Minify
        </button>
        {#if !isValidJson}
          <span class="json-error">Invalid JSON</span>
        {/if}
      </div>
      <CodeMirrorEditor
        content={body.content}
        language="json"
        placeholder={'{"key": "value"}'}
        onchange={updateContent}
      />
    {:else if body.type === 'text'}
      <CodeMirrorEditor
        content={body.content}
        language="text"
        placeholder="Enter request body..."
        onchange={updateContent}
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
  }

  .body-type-btn {
    padding: 6px 12px;
    background: transparent;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    transition: all 0.15s;
    opacity: 0.7;
  }

  .body-type-btn:hover {
    opacity: 1;
    background: var(--vscode-list-hoverBackground);
  }

  .body-type-btn.active {
    opacity: 1;
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
    border-color: var(--vscode-focusBorder);
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
    color: var(--vscode-descriptionForeground);
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
    padding: 4px 8px;
    background: transparent;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
    transition: background 0.15s, border-color 0.15s;
  }

  .toolbar-btn:hover {
    background: var(--vscode-list-hoverBackground);
    border-color: var(--vscode-focusBorder);
  }

  .json-error {
    color: var(--vscode-errorForeground);
    font-size: 11px;
    margin-left: auto;
  }

  .form-editor {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .form-hint {
    margin: 0;
    padding: 8px 12px;
    background: var(--vscode-textBlockQuote-background);
    border-left: 3px solid var(--vscode-textBlockQuote-border);
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    border-radius: 0 4px 4px 0;
  }
</style>
