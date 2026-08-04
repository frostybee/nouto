<script lang="ts">
  import { onMount } from 'svelte';
  import type { OpenApiDiagnostic, OpenApiFormat, OpenApiVersion } from '@nouto/core/services/openapi/types';
  import type { OpenApiPointerMap } from '@nouto/core/services/openapi/pointerMap';

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
    /**
     * Merged 5-source diagnostics; the widget owns 100% of its markers
     * (monaco-yaml's own validation is off) and converts pointers to ranges
     * via pointerMap.
     */
    diagnostics?: OpenApiDiagnostic[];
    pointerMap?: OpenApiPointerMap;
    onchange?: (value: string) => void;
    onsave?: () => void;
    /** Incremental UTF-16 edit batch (transport OpenApiEditChange shape). Unconsumed until Phase 4. */
    onedits?: (changes: { from: number; to: number; insert: string }[]) => void;
    /** Cursor movements, offset-based — the outline sync input. */
    oncursorchange?: (info: { line: number; column: number; offset: number }) => void;
  }

  const props: EditorSurfaceProps = $props();

  let MonacoOpenApiEditor = $state<typeof import('./MonacoOpenApiEditor.svelte').default>();
  let monacoRef = $state<{ revealOffset(offset: number): void }>();

  /** Scrolls to and selects the position at a UTF-16 offset (outline reveal). */
  export function revealOffset(offset: number): void {
    monacoRef?.revealOffset(offset);
  }

  onMount(async () => {
    MonacoOpenApiEditor = (await import('./MonacoOpenApiEditor.svelte')).default;
  });
</script>

{#if MonacoOpenApiEditor}
  <MonacoOpenApiEditor bind:this={monacoRef} {...props} />
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
