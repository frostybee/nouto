import { describe, it, expect, beforeEach } from 'vitest';
import {
  ui,
  setSidebarTab,
  toggleSidebar,
  setSidebarWidth,
  setRequestTab,
  setResponseTab,
  setConnectionMode,
  togglePanelLayout,
  setPanelLayout,
  setPanelSplitRatio,
  setSidebarSplitRatio,
  toggleHistoryDrawer,
  setHistoryDrawerOpen,
  setHistoryDrawerHeight,
  setCollectionSortOrder,
  toggleResponseWordWrap,
  resetUI,
} from './ui.svelte';

describe('ui store', () => {
  beforeEach(() => {
    resetUI();
  });

  describe('initial state', () => {
    it('should have default sidebar tab', () => {
      expect(ui.sidebarTab).toBe('collections');
    });

    it('should have sidebar not collapsed', () => {
      expect(ui.sidebarCollapsed).toBe(false);
    });

    it('should have default sidebar width', () => {
      expect(ui.sidebarWidth).toBe(280);
    });

    it('should have default request tab', () => {
      expect(ui.requestTab).toBe('query');
    });

    it('should have default response tab', () => {
      expect(ui.responseTab).toBe('body');
    });

    it('should have http connection mode', () => {
      expect(ui.connectionMode).toBe('http');
    });

    it('should have horizontal panel layout', () => {
      expect(ui.panelLayout).toBe('horizontal');
    });

    it('should have 0.5 panel split ratio', () => {
      expect(ui.panelSplitRatio).toBe(0.5);
    });

    it('should have history drawer closed', () => {
      expect(ui.historyDrawerOpen).toBe(false);
    });

    it('should have default history drawer height', () => {
      expect(ui.historyDrawerHeight).toBe(300);
    });

    it('should have manual collection sort order', () => {
      expect(ui.collectionSortOrder).toBe('manual');
    });
  });

  describe('setSidebarTab', () => {
    it('should set sidebar tab to history', () => {
      setSidebarTab('history');
      expect(ui.sidebarTab).toBe('history');
    });

    it('should set sidebar tab to collections', () => {
      setSidebarTab('history');
      setSidebarTab('collections');
      expect(ui.sidebarTab).toBe('collections');
    });
  });

  describe('toggleSidebar', () => {
    it('should toggle sidebar collapsed state', () => {
      expect(ui.sidebarCollapsed).toBe(false);
      toggleSidebar();
      expect(ui.sidebarCollapsed).toBe(true);
      toggleSidebar();
      expect(ui.sidebarCollapsed).toBe(false);
    });
  });

  describe('setSidebarWidth', () => {
    it('should set sidebar width', () => {
      setSidebarWidth(350);
      expect(ui.sidebarWidth).toBe(350);
    });
  });

  describe('setRequestTab', () => {
    it('should set request tab', () => {
      setRequestTab('body');
      expect(ui.requestTab).toBe('body');
    });

    it('should set to headers tab', () => {
      setRequestTab('headers');
      expect(ui.requestTab).toBe('headers');
    });
  });

  describe('setResponseTab', () => {
    it('should set response tab', () => {
      setResponseTab('headers');
      expect(ui.responseTab).toBe('headers');
    });

    it('should set to timing tab', () => {
      setResponseTab('timing');
      expect(ui.responseTab).toBe('timing');
    });
  });

  describe('setConnectionMode', () => {
    it('should set connection mode', () => {
      setConnectionMode('websocket');
      expect(ui.connectionMode).toBe('websocket');
    });
  });

  describe('togglePanelLayout', () => {
    it('should toggle from horizontal to vertical', () => {
      expect(ui.panelLayout).toBe('horizontal');
      togglePanelLayout();
      expect(ui.panelLayout).toBe('vertical');
    });

    it('should toggle from vertical to horizontal', () => {
      setPanelLayout('vertical');
      togglePanelLayout();
      expect(ui.panelLayout).toBe('horizontal');
    });
  });

  describe('setPanelLayout', () => {
    it('should set panel layout', () => {
      setPanelLayout('vertical');
      expect(ui.panelLayout).toBe('vertical');
    });
  });

  describe('setPanelSplitRatio', () => {
    it('should set panel split ratio', () => {
      setPanelSplitRatio(0.6);
      expect(ui.panelSplitRatio).toBe(0.6);
    });

    it('should clamp to minimum of 0.15', () => {
      setPanelSplitRatio(0.05);
      expect(ui.panelSplitRatio).toBe(0.15);
    });

    it('should clamp to maximum of 0.85', () => {
      setPanelSplitRatio(0.95);
      expect(ui.panelSplitRatio).toBe(0.85);
    });

    it('should allow boundary value 0.15', () => {
      setPanelSplitRatio(0.15);
      expect(ui.panelSplitRatio).toBe(0.15);
    });

    it('should allow boundary value 0.85', () => {
      setPanelSplitRatio(0.85);
      expect(ui.panelSplitRatio).toBe(0.85);
    });
  });

  describe('setSidebarSplitRatio', () => {
    it('should set sidebar split ratio', () => {
      setSidebarSplitRatio(0.3);
      expect(ui.sidebarSplitRatio).toBe(0.3);
    });

    it('should clamp to minimum of 0.15', () => {
      setSidebarSplitRatio(0.05);
      expect(ui.sidebarSplitRatio).toBe(0.15);
    });

    it('should clamp to maximum of 0.5', () => {
      setSidebarSplitRatio(0.8);
      expect(ui.sidebarSplitRatio).toBe(0.5);
    });

    it('should allow boundary value 0.15', () => {
      setSidebarSplitRatio(0.15);
      expect(ui.sidebarSplitRatio).toBe(0.15);
    });

    it('should allow boundary value 0.5', () => {
      setSidebarSplitRatio(0.5);
      expect(ui.sidebarSplitRatio).toBe(0.5);
    });
  });

  describe('toggleHistoryDrawer', () => {
    it('should toggle history drawer open state', () => {
      expect(ui.historyDrawerOpen).toBe(false);
      toggleHistoryDrawer();
      expect(ui.historyDrawerOpen).toBe(true);
      toggleHistoryDrawer();
      expect(ui.historyDrawerOpen).toBe(false);
    });
  });

  describe('setHistoryDrawerOpen', () => {
    it('should set history drawer open to true', () => {
      setHistoryDrawerOpen(true);
      expect(ui.historyDrawerOpen).toBe(true);
    });

    it('should set history drawer open to false', () => {
      setHistoryDrawerOpen(true);
      setHistoryDrawerOpen(false);
      expect(ui.historyDrawerOpen).toBe(false);
    });
  });

  describe('setHistoryDrawerHeight', () => {
    it('should set history drawer height', () => {
      setHistoryDrawerHeight(400);
      expect(ui.historyDrawerHeight).toBe(400);
    });

    it('should clamp to minimum of 120', () => {
      setHistoryDrawerHeight(50);
      expect(ui.historyDrawerHeight).toBe(120);
    });

    it('should allow boundary value 120', () => {
      setHistoryDrawerHeight(120);
      expect(ui.historyDrawerHeight).toBe(120);
    });
  });

  describe('setCollectionSortOrder', () => {
    it('should set collection sort order', () => {
      setCollectionSortOrder('name-asc');
      expect(ui.collectionSortOrder).toBe('name-asc');
    });

    it('should set to method sort', () => {
      setCollectionSortOrder('method');
      expect(ui.collectionSortOrder).toBe('method');
    });
  });

  describe('toggleResponseWordWrap', () => {
    it('should toggle response word wrap', () => {
      const initial = ui.responseWordWrap;
      toggleResponseWordWrap();
      expect(ui.responseWordWrap).toBe(!initial);
      toggleResponseWordWrap();
      expect(ui.responseWordWrap).toBe(initial);
    });
  });

  describe('resetUI', () => {
    it('should reset all values to defaults', () => {
      setSidebarTab('history');
      toggleSidebar();
      setSidebarWidth(500);
      setRequestTab('body');
      setResponseTab('headers');
      setPanelLayout('vertical');
      setPanelSplitRatio(0.7);
      setHistoryDrawerOpen(true);
      setHistoryDrawerHeight(500);
      setCollectionSortOrder('name-desc');

      resetUI();

      expect(ui.sidebarTab).toBe('collections');
      expect(ui.sidebarCollapsed).toBe(false);
      expect(ui.sidebarWidth).toBe(280);
      expect(ui.requestTab).toBe('query');
      expect(ui.responseTab).toBe('body');
      expect(ui.panelLayout).toBe('horizontal');
      expect(ui.panelSplitRatio).toBe(0.5);
      expect(ui.historyDrawerOpen).toBe(false);
      expect(ui.historyDrawerHeight).toBe(300);
      expect(ui.collectionSortOrder).toBe('manual');
    });
  });
});
