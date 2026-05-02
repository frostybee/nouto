<script lang="ts">
  interface Props {
    message: string;
    icon?: string;
    duration?: number;
    onDismiss: () => void;
  }
  let { message, icon = 'codicon-check', duration = 2000, onDismiss }: Props = $props();

  let visible = $state(true);

  $effect(() => {
    const timer = setTimeout(() => {
      visible = false;
      setTimeout(onDismiss, 200); // Wait for fade-out animation
    }, duration);
    return () => clearTimeout(timer);
  });
</script>

<div class="toast" class:visible class:hidden={!visible}>
  <i class="codicon {icon}"></i>
  <span>{message}</span>
</div>

<style>
  .toast {
    position: fixed;
    bottom: 50%;
    left: 50%;
    transform: translate(-50%, 50%);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: var(--hf-notifications-background, var(--hf-editor-background));
    color: var(--hf-notifications-foreground, var(--hf-foreground));
    border: 1px solid var(--hf-notifications-border, var(--hf-panel-border));
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    font-size: 13px;
    z-index: 10000;
    opacity: 1;
    transition: opacity 0.2s, transform 0.2s;
    pointer-events: none;
  }

  .toast.hidden {
    opacity: 0;
    transform: translate(-50%, calc(50% + 8px));
  }

  .toast .codicon {
    font-size: 14px;
    color: var(--hf-notificationsInfoIcon-foreground, #75beff);
  }
</style>
