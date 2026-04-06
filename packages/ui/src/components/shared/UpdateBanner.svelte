<script lang="ts">
  import Tooltip from './Tooltip.svelte';

  interface Props {
    show: boolean;
    version: string;
    isDownloading: boolean;
    progress: number;
    preDownloaded: boolean;
    oninstall: () => void;
    ondismiss: () => void;
  }

  let { show, version, isDownloading, progress, preDownloaded, oninstall, ondismiss }: Props = $props();
</script>

{#if show && !isDownloading}
  <div class="update-banner">
    <span class="update-icon codicon codicon-cloud-download"></span>
    <span class="update-text">
      {#if preDownloaded}
        Update ready: <strong>v{version}</strong>
      {:else}
        Update available: <strong>v{version}</strong>
      {/if}
    </span>
    <button class="update-install" onclick={oninstall}>
      {preDownloaded ? 'Install and Restart' : 'Download and Restart'}
    </button>
    <Tooltip text="Dismiss" position="top">
      <button class="update-dismiss" onclick={ondismiss} aria-label="Dismiss update">
        <span class="codicon codicon-close"></span>
      </button>
    </Tooltip>
  </div>
{:else if isDownloading}
  <div class="update-banner downloading">
    <span class="update-icon codicon codicon-sync codicon-modifier-spin"></span>
    <span class="update-text">Downloading update...</span>
    <div class="update-progress-bar">
      <div class="update-progress-fill" style="width: {Math.min(100, progress)}%"></div>
    </div>
  </div>
{/if}

<style>
  .update-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--hf-editorWidget-background);
    border-left: 3px solid var(--hf-terminal-ansiGreen, #4caf50);
    border-bottom: 1px solid var(--hf-panel-border);
    animation: bannerSlideIn 0.2s ease-out;
  }

  .update-banner.downloading {
    border-left-color: var(--hf-textLink-foreground, #3794ff);
  }

  @keyframes bannerSlideIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .update-icon {
    color: var(--hf-terminal-ansiGreen, #4caf50);
    font-size: 14px;
    flex-shrink: 0;
  }

  .downloading .update-icon {
    color: var(--hf-textLink-foreground, #3794ff);
  }

  .update-text {
    font-size: 12px;
    color: var(--hf-foreground);
    flex: 1;
  }

  .update-text strong {
    font-weight: 600;
  }

  .update-install {
    padding: 3px 10px;
    font-size: 11px;
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    border-radius: 3px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .update-install:hover {
    background: var(--hf-button-hoverBackground);
  }

  .update-dismiss {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--hf-foreground);
    cursor: pointer;
    opacity: 0.6;
    flex-shrink: 0;
  }

  .update-dismiss:hover {
    opacity: 1;
    background: var(--hf-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
  }

  .update-dismiss .codicon {
    font-size: 12px;
  }

  .update-progress-bar {
    flex: 1;
    height: 4px;
    background: var(--hf-panel-border);
    border-radius: 2px;
    overflow: hidden;
  }

  .update-progress-fill {
    height: 100%;
    background: var(--hf-textLink-foreground, #3794ff);
    border-radius: 2px;
    transition: width 0.3s ease;
  }
</style>
