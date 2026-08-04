<script lang="ts">
  import OpenApiPreview from '@nouto/ui/components/openapi/OpenApiPreview.svelte';
  import { createPreviewAdapter } from '../../lib/openapi/previewAdapter.svelte';
  import { openApiSession } from '../../lib/openapi/session.svelte';

  const adapter = createPreviewAdapter();

  // Push-on-change: these fields already sit behind the session's 300ms
  // analysis debounce, so no second debounce layer is needed (VS Code's
  // separate preview debounce exists only for its per-keystroke
  // TextDocument events).
  $effect(() => {
    void openApiSession.lastValidSpec;
    void openApiSession.version;
    void openApiSession.previewStale;
    void openApiSession.contentRevision;
    adapter.pushPreviewData();
  });
</script>

<div class="preview-pane">
  <OpenApiPreview vscode={adapter} sourceUri={openApiSession.documentUri ?? 'untitled'} />
</div>

<style>
  .preview-pane {
    height: 100%;
    min-width: 0;
    overflow: hidden;
  }
</style>
