import { UIService } from './UIService';

describe('UIService', () => {
  let uiService: UIService;
  let mockPostMessage: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPostMessage = jest.fn();
    uiService = new UIService(mockPostMessage);
  });

  afterEach(() => {
    uiService.dispose();
  });

  describe('showNotification', () => {
    it('should post info notification message', () => {
      uiService.showInfo('Hello');
      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'showNotification',
        data: { level: 'info', message: 'Hello' },
      });
    });

    it('should post warning notification message', () => {
      uiService.showWarning('Careful');
      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'showNotification',
        data: { level: 'warning', message: 'Careful' },
      });
    });

    it('should post error notification message', () => {
      uiService.showError('Oops');
      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'showNotification',
        data: { level: 'error', message: 'Oops' },
      });
    });
  });

  describe('handleResponseMessage', () => {
    it('should return false for non-UI response messages', () => {
      const result = uiService.handleResponseMessage({ type: 'someOtherType', data: {} });
      expect(result).toBe(false);
    });

    it('should return true for inputBoxResult messages', () => {
      const result = uiService.handleResponseMessage({
        type: 'inputBoxResult',
        data: { requestId: 'unknown', value: 'test' },
      });
      expect(result).toBe(true);
    });

    it('should return true for quickPickResult messages', () => {
      const result = uiService.handleResponseMessage({
        type: 'quickPickResult',
        data: { requestId: 'unknown', value: 'test' },
      });
      expect(result).toBe(true);
    });

    it('should return true for confirmResult messages', () => {
      const result = uiService.handleResponseMessage({
        type: 'confirmResult',
        data: { requestId: 'unknown', confirmed: true },
      });
      expect(result).toBe(true);
    });

    it('should return true for createItemDialogResult messages', () => {
      const result = uiService.handleResponseMessage({
        type: 'createItemDialogResult',
        data: { requestId: 'unknown', value: null },
      });
      expect(result).toBe(true);
    });
  });

  describe('showInputBox', () => {
    it('should post showInputBox message and resolve with value', async () => {
      const promise = uiService.showInputBox({ prompt: 'Enter name', placeholder: 'Name' });

      // Get the requestId from the posted message
      expect(mockPostMessage).toHaveBeenCalledTimes(1);
      const postedMsg = mockPostMessage.mock.calls[0][0];
      expect(postedMsg.type).toBe('showInputBox');
      expect(postedMsg.data.prompt).toBe('Enter name');
      expect(postedMsg.data.placeholder).toBe('Name');

      const requestId = postedMsg.data.requestId;

      // Simulate response
      uiService.handleResponseMessage({
        type: 'inputBoxResult',
        data: { requestId, value: 'MyValue' },
      });

      const result = await promise;
      expect(result).toBe('MyValue');
    });

    it('should resolve with null when user cancels', async () => {
      const promise = uiService.showInputBox({ prompt: 'Enter name' });

      const requestId = mockPostMessage.mock.calls[0][0].data.requestId;

      uiService.handleResponseMessage({
        type: 'inputBoxResult',
        data: { requestId, value: null },
      });

      const result = await promise;
      expect(result).toBeNull();
    });
  });

  describe('showQuickPick', () => {
    it('should post showQuickPick message and resolve with selected value', async () => {
      const items = [
        { label: 'Option A', value: 'a' },
        { label: 'Option B', value: 'b' },
      ];
      const promise = uiService.showQuickPick({ title: 'Pick one', items });

      const postedMsg = mockPostMessage.mock.calls[0][0];
      expect(postedMsg.type).toBe('showQuickPick');
      expect(postedMsg.data.title).toBe('Pick one');
      expect(postedMsg.data.items).toEqual(items);

      const requestId = postedMsg.data.requestId;

      uiService.handleResponseMessage({
        type: 'quickPickResult',
        data: { requestId, value: 'a' },
      });

      const result = await promise;
      expect(result).toBe('a');
    });
  });

  describe('confirm', () => {
    it('should post showConfirm message and resolve with confirmed value', async () => {
      const promise = uiService.confirm('Delete this?', 'Delete', 'danger');

      const postedMsg = mockPostMessage.mock.calls[0][0];
      expect(postedMsg.type).toBe('showConfirm');
      expect(postedMsg.data.message).toBe('Delete this?');
      expect(postedMsg.data.confirmLabel).toBe('Delete');
      expect(postedMsg.data.variant).toBe('danger');

      const requestId = postedMsg.data.requestId;

      uiService.handleResponseMessage({
        type: 'confirmResult',
        data: { requestId, confirmed: true },
      });

      const result = await promise;
      expect(result).toBe(true);
    });

    it('should resolve with false when user denies', async () => {
      const promise = uiService.confirm('Delete?');

      const requestId = mockPostMessage.mock.calls[0][0].data.requestId;

      uiService.handleResponseMessage({
        type: 'confirmResult',
        data: { requestId, confirmed: false },
      });

      const result = await promise;
      expect(result).toBe(false);
    });
  });

  describe('showCreateItemDialog', () => {
    it('should post showCreateItemDialog message and resolve with result', async () => {
      const promise = uiService.showCreateItemDialog('collection');

      const postedMsg = mockPostMessage.mock.calls[0][0];
      expect(postedMsg.type).toBe('showCreateItemDialog');
      expect(postedMsg.data.mode).toBe('collection');

      const requestId = postedMsg.data.requestId;

      uiService.handleResponseMessage({
        type: 'createItemDialogResult',
        data: { requestId, value: { name: 'Test', color: '#ff0000' } },
      });

      const result = await promise;
      expect(result).toEqual({ name: 'Test', color: '#ff0000' });
    });

    it('should resolve with null when user cancels', async () => {
      const promise = uiService.showCreateItemDialog('folder');

      const requestId = mockPostMessage.mock.calls[0][0].data.requestId;

      uiService.handleResponseMessage({
        type: 'createItemDialogResult',
        data: { requestId, value: null },
      });

      const result = await promise;
      expect(result).toBeNull();
    });
  });

  describe('timeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should resolve with null on timeout', async () => {
      const promise = uiService.showInputBox({ prompt: 'Enter name' });

      // Fast-forward past the timeout (120 seconds)
      jest.advanceTimersByTime(120001);

      const result = await promise;
      expect(result).toBeNull();
    });
  });

  describe('dispose', () => {
    it('should clear all pending response handlers', () => {
      // Start a request (creates a handler)
      uiService.showInputBox({ prompt: 'test' });
      uiService.dispose();

      // Subsequent response should still return true (message type matches)
      // but handler was cleared so nothing resolves
      const requestId = mockPostMessage.mock.calls[0][0].data.requestId;
      const handled = uiService.handleResponseMessage({
        type: 'inputBoxResult',
        data: { requestId, value: 'test' },
      });
      // The message type matches so it returns true, but handler is gone
      expect(handled).toBe(true);
    });
  });
});
