<script lang="ts">
  import CodegenButton from '../shared/CodegenButton.svelte';
  import CollectionSaveButton from '../shared/CollectionSaveButton.svelte';
  import CookieJarSelector from '../shared/CookieJarSelector.svelte';
  import EnvironmentSelector from '../shared/EnvironmentSelector.svelte';
  import Tooltip from '../shared/Tooltip.svelte';
  import { resolvedShortcuts } from '../../stores/settings.svelte';
  import { bindingToDisplayString } from '../../lib/shortcuts';
  import { postMessage as vsCodePostMessage } from '../../lib/vscode';
  import type { Collection } from '../../types';
  import type { OutgoingMessage } from '@hivefetch/transport/messages';

  interface Props {
    collectionId: string | null;
    collectionName: string | null;
    collections: Collection[];
    onSaveToCollection: () => void;
    onSaveRequest: () => void;
    onRevertRequest: () => void;
    postMessage?: (message: OutgoingMessage) => void;
  }

  let {
    collectionId,
    collectionName,
    collections,
    onSaveToCollection,
    onSaveRequest,
    onRevertRequest,
    postMessage
  }: Props = $props();

  const messageBus = $derived(postMessage || vsCodePostMessage);

  const shortcuts = $derived(resolvedShortcuts());

  const searchTooltip = $derived.by(() => {
    const binding = shortcuts.get('openCommandPalette');
    return binding ? `Search requests (${bindingToDisplayString(binding)})` : 'Search requests';
  });
</script>

<div class="action-bar">
  <div class="action-bar-left">
    <CodegenButton />
    <CollectionSaveButton {collectionId} {collectionName} {collections} {onSaveToCollection} {onSaveRequest} {onRevertRequest} />
  </div>
  <div class="action-bar-right">
    <Tooltip text={searchTooltip}>
      <button
        class="action-bar-btn"
        onclick={() => messageBus({ type: 'openCommandPalette' } as any)}
        type="button"
        aria-label="Search requests"
      >
        <span class="codicon codicon-search"></span>
      </button>
    </Tooltip>
    <CookieJarSelector />
    <EnvironmentSelector />
  </div>
</div>

<style>
  .action-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 16px 4px 12px;
    background: var(--hf-editor-background);
    border-bottom: 1px solid var(--hf-panel-border);
    min-height: 32px;
    gap: 8px;
  }

  .action-bar-left,
  .action-bar-right {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .action-bar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: 1px solid var(--hf-input-border);
    border-radius: 4px;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s, border-color 0.15s;
  }

  .action-bar-btn:hover {
    background: var(--hf-list-hoverBackground);
    border-color: var(--hf-focusBorder);
  }

  .action-bar-btn .codicon {
    font-size: 14px;
  }
</style>
