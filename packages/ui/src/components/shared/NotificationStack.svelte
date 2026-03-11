<script lang="ts">
  import { onDestroy } from 'svelte';
  import { notifications, dismissNotification, forceRefreshNotifications, type Notification } from '../../stores/notifications.svelte';

  // Track hiding state and timers outside of reactive state to avoid $effect loops
  const hidingSet = new Set<string>();
  const timerMap = new Map<string, ReturnType<typeof setTimeout>>();

  // Use $derived to render directly from the store (no separate $state needed)
  let visibleItems = $derived(notifications());

  // Set up auto-dismiss timers whenever notifications change
  $effect(() => {
    const current = notifications();
    for (const notif of current) {
      if (!timerMap.has(notif.id)) {
        timerMap.set(notif.id, setTimeout(() => dismiss(notif.id), notif.duration));
      }
    }
  });

  onDestroy(() => {
    for (const timer of timerMap.values()) clearTimeout(timer);
    timerMap.clear();
  });

  function dismiss(id: string) {
    const timer = timerMap.get(id);
    if (timer) clearTimeout(timer);
    timerMap.delete(id);
    hidingSet.add(id);

    // Trigger a re-render by dismissing from the store after fade-out
    setTimeout(() => {
      hidingSet.delete(id);
      dismissNotification(id);
    }, 200);

    // Force Svelte to see the hiding change
    forceRefreshNotifications();
  }

  function isHiding(id: string): boolean {
    return hidingSet.has(id);
  }

  function getIcon(level: string): string {
    switch (level) {
      case 'error':
        return 'codicon-error';
      case 'warning':
        return 'codicon-warning';
      default:
        return 'codicon-info';
    }
  }
</script>

{#if visibleItems.length > 0}
  <div class="notification-stack">
    {#each visibleItems as notif (notif.id)}
      <div
        class="notification {notif.level}"
        class:hiding={isHiding(notif.id)}
        role="alert"
      >
        <span class="notification-icon codicon {getIcon(notif.level)}"></span>
        <span class="notification-message">{notif.message}</span>
        <button
          class="notification-close codicon codicon-close"
          onclick={() => dismiss(notif.id)}
          aria-label="Dismiss"
        ></button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .notification-stack {
    position: fixed;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10001;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 400px;
    pointer-events: none;
  }

  .notification {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 12px;
    background: var(--hf-notifications-background, var(--hf-editorWidget-background, var(--hf-editor-background)));
    color: var(--hf-notifications-foreground, var(--hf-foreground));
    border: 1px solid var(--hf-notifications-border, var(--hf-panel-border));
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    font-size: 13px;
    line-height: 1.4;
    pointer-events: auto;
    animation: slideIn 0.2s ease-out;
    transition: opacity 0.2s, transform 0.2s;
  }

  .notification.hiding {
    opacity: 0;
    transform: translateY(20px);
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .notification-icon {
    font-size: 16px;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .notification.info .notification-icon {
    color: var(--hf-editorInfo-foreground, #3794ff);
  }

  .notification.warning .notification-icon {
    color: var(--hf-editorWarning-foreground, #cca700);
  }

  .notification.error .notification-icon {
    color: var(--hf-errorForeground, #f14c4c);
  }

  .notification-message {
    flex: 1;
    min-width: 0;
    word-wrap: break-word;
  }

  .notification-close {
    flex-shrink: 0;
    background: none;
    border: none;
    color: var(--hf-foreground);
    opacity: 0.5;
    cursor: pointer;
    padding: 0;
    font-size: 14px;
    line-height: 1;
    margin-top: 1px;
  }

  .notification-close:hover {
    opacity: 1;
  }
</style>
