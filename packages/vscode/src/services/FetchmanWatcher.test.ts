import { FetchmanWatcher } from './FetchmanWatcher';

// Timer control
jest.useFakeTimers();

describe('FetchmanWatcher', () => {
  let watcher: FetchmanWatcher;
  let mockFileWatcher: any;
  let changeHandlers: Function[];
  let createHandlers: Function[];
  let deleteHandlers: Function[];

  beforeEach(() => {
    changeHandlers = [];
    createHandlers = [];
    deleteHandlers = [];

    mockFileWatcher = {
      onDidChange: jest.fn((handler: Function) => changeHandlers.push(handler)),
      onDidCreate: jest.fn((handler: Function) => createHandlers.push(handler)),
      onDidDelete: jest.fn((handler: Function) => deleteHandlers.push(handler)),
      dispose: jest.fn(),
    };

    // Mock vscode.workspace.createFileSystemWatcher
    const vscode = require('vscode');
    vscode.workspace.createFileSystemWatcher = jest.fn(() => mockFileWatcher);

    watcher = new FetchmanWatcher('/mock/workspace');
    watcher.start();
  });

  afterEach(() => {
    watcher.dispose();
    jest.clearAllTimers();
  });

  describe('basic change events', () => {
    it('should fire onDidChange after debounce period', () => {
      const listener = jest.fn();
      watcher.onDidChange(listener);

      // Simulate a file change
      const uri = { fsPath: '/mock/workspace/.hivefetch/collections/test.json' };
      changeHandlers[0](uri);

      // Not fired yet (debouncing)
      expect(listener).not.toHaveBeenCalled();

      // Advance past debounce
      jest.advanceTimersByTime(500);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith([uri]);
    });

    it('should coalesce rapid changes into single event', () => {
      const listener = jest.fn();
      watcher.onDidChange(listener);

      const uri1 = { fsPath: '/mock/file1.json' };
      const uri2 = { fsPath: '/mock/file2.json' };
      const uri3 = { fsPath: '/mock/file3.json' };

      changeHandlers[0](uri1);
      changeHandlers[0](uri2);
      createHandlers[0](uri3);

      jest.advanceTimersByTime(500);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith([uri1, uri2, uri3]);
    });

    it('should handle create and delete events', () => {
      const listener = jest.fn();
      watcher.onDidChange(listener);

      const createUri = { fsPath: '/mock/created.json' };
      const deleteUri = { fsPath: '/mock/deleted.json' };

      createHandlers[0](createUri);
      deleteHandlers[0](deleteUri);

      jest.advanceTimersByTime(500);

      expect(listener).toHaveBeenCalledWith([createUri, deleteUri]);
    });
  });

  describe('suppressChanges', () => {
    it('should suppress events during async write', async () => {
      const listener = jest.fn();
      watcher.onDidChange(listener);

      const uri = { fsPath: '/mock/file.json' };

      const writePromise = watcher.suppressChanges(async () => {
        // Simulate a file change triggered by our own write
        changeHandlers[0](uri);
      });

      await writePromise;

      // Advance past debounce - event should NOT fire
      jest.advanceTimersByTime(500);
      expect(listener).not.toHaveBeenCalled();

      // Advance past the 1000ms re-enable delay
      jest.advanceTimersByTime(1000);

      // Now changes should be detected again
      const newUri = { fsPath: '/mock/new-file.json' };
      changeHandlers[0](newUri);
      jest.advanceTimersByTime(500);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith([newUri]);
    });

    it('should handle concurrent suppressed writes (reference counting)', async () => {
      const listener = jest.fn();
      watcher.onDidChange(listener);

      const uri = { fsPath: '/mock/file.json' };

      // Start two concurrent suppressed writes
      let resolve1!: () => void;
      let resolve2!: () => void;
      const p1 = new Promise<void>(r => { resolve1 = r; });
      const p2 = new Promise<void>(r => { resolve2 = r; });

      const write1 = watcher.suppressChanges(() => p1);
      const write2 = watcher.suppressChanges(() => p2);

      // Complete first write
      resolve1();
      await write1;

      // Still suppressed because write2 is still in progress
      changeHandlers[0](uri);
      jest.advanceTimersByTime(500);
      expect(listener).not.toHaveBeenCalled();

      // Complete second write
      resolve2();
      await write2;

      // Still suppressed during 1000ms delay
      changeHandlers[0](uri);
      jest.advanceTimersByTime(1000);

      // Both delays expired, first write's delay already passed
      jest.advanceTimersByTime(1000);

      // Now suppressCount should be 0
      const freshUri = { fsPath: '/mock/fresh.json' };
      changeHandlers[0](freshUri);
      jest.advanceTimersByTime(500);

      expect(listener).toHaveBeenCalledWith([freshUri]);
    });

    it('should re-enable on error', async () => {
      const listener = jest.fn();
      watcher.onDidChange(listener);

      try {
        await watcher.suppressChanges(async () => {
          throw new Error('write failed');
        });
      } catch {
        // expected
      }

      // Advance past 1000ms delay
      jest.advanceTimersByTime(1000);

      // Should detect changes again
      const uri = { fsPath: '/mock/file.json' };
      changeHandlers[0](uri);
      jest.advanceTimersByTime(500);

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('dispose', () => {
    it('should dispose file watcher', () => {
      watcher.dispose();
      expect(mockFileWatcher.dispose).toHaveBeenCalled();
    });

    it('should clear pending debounce timer', () => {
      const listener = jest.fn();
      watcher.onDidChange(listener);

      changeHandlers[0]({ fsPath: '/mock/file.json' });

      // Dispose before debounce fires
      watcher.dispose();
      jest.advanceTimersByTime(500);

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
