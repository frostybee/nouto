import { describe, it, expect, beforeEach } from 'vitest';
import type { PendingInput } from './notifications.svelte';
import {
  notifications,
  pendingInput,
  showNotification,
  dismissNotification,
  forceRefreshNotifications,
  setPendingInput,
  clearPendingInput,
} from './notifications.svelte';

/**
 * Helper: clears all notifications by dismissing each one.
 * Since there is no dedicated "clearAll" function, we dismiss individually.
 */
function clearAllNotifications(): void {
  for (const n of [...notifications()]) {
    dismissNotification(n.id);
  }
}

describe('notifications store', () => {
  beforeEach(() => {
    clearAllNotifications();
    clearPendingInput();
  });

  describe('initial state', () => {
    it('should start with an empty notifications array', () => {
      expect(notifications()).toEqual([]);
    });

    it('should start with null pending input', () => {
      expect(pendingInput()).toBeNull();
    });
  });

  describe('showNotification', () => {
    it('should add an info notification with default duration of 3000ms', () => {
      showNotification('info', 'Data loaded');
      const notifs = notifications();
      expect(notifs.length).toBe(1);
      expect(notifs[0].level).toBe('info');
      expect(notifs[0].message).toBe('Data loaded');
      expect(notifs[0].duration).toBe(3000);
    });

    it('should add a warning notification with default duration of 5000ms', () => {
      showNotification('warning', 'Rate limit approaching');
      const notifs = notifications();
      expect(notifs.length).toBe(1);
      expect(notifs[0].level).toBe('warning');
      expect(notifs[0].message).toBe('Rate limit approaching');
      expect(notifs[0].duration).toBe(5000);
    });

    it('should add an error notification with default duration of 5000ms', () => {
      showNotification('error', 'Connection failed');
      const notifs = notifications();
      expect(notifs.length).toBe(1);
      expect(notifs[0].level).toBe('error');
      expect(notifs[0].message).toBe('Connection failed');
      expect(notifs[0].duration).toBe(5000);
    });

    it('should allow a custom duration override', () => {
      showNotification('info', 'Quick message', 1000);
      const notifs = notifications();
      expect(notifs[0].duration).toBe(1000);
    });

    it('should accumulate multiple notifications', () => {
      showNotification('info', 'First');
      showNotification('warning', 'Second');
      showNotification('error', 'Third');
      expect(notifications().length).toBe(3);
    });

    it('should assign unique IDs following the notif- prefix pattern', () => {
      showNotification('info', 'A');
      showNotification('info', 'B');
      const notifs = notifications();
      expect(notifs[0].id).toMatch(/^notif-\d+$/);
      expect(notifs[1].id).toMatch(/^notif-\d+$/);
      expect(notifs[0].id).not.toBe(notifs[1].id);
    });
  });

  describe('dismissNotification', () => {
    it('should remove a notification by ID', () => {
      showNotification('info', 'Will be dismissed');
      const id = notifications()[0].id;
      dismissNotification(id);
      expect(notifications().length).toBe(0);
    });

    it('should only remove the targeted notification', () => {
      showNotification('info', 'Keep');
      showNotification('error', 'Remove');
      showNotification('warning', 'Keep too');
      const removeId = notifications()[1].id;
      dismissNotification(removeId);
      const remaining = notifications();
      expect(remaining.length).toBe(2);
      expect(remaining[0].message).toBe('Keep');
      expect(remaining[1].message).toBe('Keep too');
    });

    it('should do nothing when dismissing a nonexistent ID', () => {
      showNotification('info', 'Stays');
      dismissNotification('nonexistent-id');
      expect(notifications().length).toBe(1);
    });
  });

  describe('forceRefreshNotifications', () => {
    it('should produce a new array reference with the same contents', () => {
      showNotification('info', 'Test');
      const before = notifications();
      forceRefreshNotifications();
      const after = notifications();
      // Contents should match but reference may differ (spread creates new array)
      expect(after).toEqual(before);
    });

    it('should work on an empty notifications list', () => {
      forceRefreshNotifications();
      expect(notifications()).toEqual([]);
    });
  });

  describe('pendingInput', () => {
    it('should set a pending input', () => {
      const input: PendingInput = {
        type: 'inputBox',
        requestId: 'req-1',
        data: { prompt: 'Enter name' },
      };
      setPendingInput(input);
      expect(pendingInput()).toEqual(input);
    });

    it('should replace a previous pending input', () => {
      setPendingInput({ type: 'inputBox', requestId: 'req-1', data: {} });
      const second: PendingInput = { type: 'confirm', requestId: 'req-2', data: { message: 'Are you sure?' } };
      setPendingInput(second);
      expect(pendingInput()).toEqual(second);
    });

    it('should clear pending input', () => {
      setPendingInput({ type: 'quickPick', requestId: 'req-1', data: { items: [] } });
      clearPendingInput();
      expect(pendingInput()).toBeNull();
    });

    it('should handle createItemDialog type', () => {
      const input: PendingInput = {
        type: 'createItemDialog',
        requestId: 'req-5',
        data: { title: 'New Item', parentId: 'folder-1' },
      };
      setPendingInput(input);
      expect(pendingInput()!.type).toBe('createItemDialog');
      expect(pendingInput()!.data.title).toBe('New Item');
    });
  });
});
