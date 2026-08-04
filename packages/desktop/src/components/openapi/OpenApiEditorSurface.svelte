<script lang="ts">
  import { onMount } from 'svelte';
  import type { OpenApiFormat, OpenApiVersion } from '@nouto/core/services/openapi/types';

  /**
   * Widget-swap boundary: everything above this component speaks text content
   * plus offset-based edits, so the editor widget can change without touching
   * the session store or view. Also the lazy-chunk boundary — the dynamic
   * import below keeps Monaco (and its workers) out of the app's startup
   * bundle; it downloads only when the OpenAPI view first renders.
   */
  export interface EditorSurfaceProps {
    content: string;
    format: OpenApiFormat;
    /** Drives monaco-yaml's meta-schema association; undefined until analysis detects one. */
    schemaVersion?: OpenApiVersion;
    readonly?: boolean;
    onchange?: (value: string) => void;
    onsave?: () => void;
    /** Incremental UTF-16 edit batch (transport OpenApiEditChange shape). Unconsumed until Phase 4. */
    onedits?: (changes: { from: number; to: number; insert: string }[]) => void;
    /** Unconsumed until Phase 2 (outline cursor sync). */
    oncursorchange?: (info: { line: number; column: number; offset: number }) => void;
    /** Unconsumed until Phase 2 (merged diagnostics). */
    ondiagnosticschange?: (diagnostics: unknown[]) => void;
  }

  const props: EditorSurfaceProps = $props();

  let MonacoOpenApiEditor = $state<typeof import('./MonacoOpenApiEditor.svelte').default>();

  onMount(async () => {
    MonacoOpenApiEditor = (await import('./MonacoOpenApiEditor.svelte')).default;
  });
</script>

{#if MonacoOpenApiEditor}
  <MonacoOpenApiEditor {...props} />
{:else}
  <div class="openapi-editor-loading">Loading editor…</div>
{/if}

<style>
  .openapi-editor-loading {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    color: var(--hf-descriptionForeground);
  }
</style>
