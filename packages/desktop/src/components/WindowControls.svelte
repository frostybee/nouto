<script lang="ts">
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { isMacOS } from '../lib/platform';

  const WINDOW_CONTROLS_WIDTH = '138px';

  let maximized = $state(false);
  const appWindow = getCurrentWindow();

  async function handleMinimize() {
    await appWindow.minimize();
  }

  async function handleToggleMaximize() {
    const isMax = await appWindow.isMaximized();
    if (isMax) {
      await appWindow.unmaximize();
      maximized = false;
    } else {
      await appWindow.maximize();
      maximized = true;
    }
  }

  async function handleClose() {
    await appWindow.close();
  }
</script>

{#if !isMacOS()}
  <div class="window-controls" style="width: {WINDOW_CONTROLS_WIDTH}" data-tauri-drag-region>
    <button class="control-btn" onclick={handleMinimize} title="Minimize">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
        <path fill="currentColor" d="M14 8v1H3V8z" />
      </svg>
    </button>

    <button class="control-btn" onclick={handleToggleMaximize} title={maximized ? 'Restore' : 'Maximize'}>
      {#if maximized}
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
          <g fill="currentColor">
            <path d="M3 5v9h9V5zm8 8H4V6h7z" />
            <path fill-rule="evenodd" d="M5 5h1V4h7v7h-1v1h2V3H5z" clip-rule="evenodd" />
          </g>
        </svg>
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
          <path fill="currentColor" d="M3 3v10h10V3zm9 9H4V4h8z" />
        </svg>
      {/if}
    </button>

    <button class="control-btn close-btn" onclick={handleClose} title="Close">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
        <path
          fill="currentColor"
          fill-rule="evenodd"
          d="m7.116 8l-4.558 4.558l.884.884L8 8.884l4.558 4.558l.884-.884L8.884 8l4.558-4.558l-.884-.884L8 7.116L3.442 2.558l-.884.884z"
          clip-rule="evenodd"
        />
      </svg>
    </button>
  </div>
{/if}

<style>
  .window-controls {
    display: flex;
    align-items: stretch;
    height: 100%;
    margin-left: 12px;
    flex-shrink: 0;
  }

  .control-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 100%;
    background: transparent;
    border: none;
    color: var(--hf-titleBar-activeForeground, var(--hf-editor-foreground));
    cursor: pointer;
    padding: 0;
    transition: background 0.1s;
  }

  .control-btn:hover {
    background: rgba(127, 127, 127, 0.2);
  }

  .control-btn:active {
    background: rgba(127, 127, 127, 0.3);
  }

  .close-btn:hover {
    background: #c42b1c;
    color: #fff;
  }

  .close-btn:active {
    background: #b22a1c;
    color: #fff;
  }
</style>
