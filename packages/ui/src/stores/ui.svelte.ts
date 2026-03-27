import type { ConnectionMode } from '../types';

export type SidebarTab = 'collections' | 'history' | 'trash';
export type RequestTab = 'query' | 'path' | 'headers' | 'auth' | 'body' | 'tests' | 'scripts' | 'notes' | 'settings' | 'examples';
export type ResponseTab = 'body' | 'headers' | 'cookies' | 'timing' | 'timeline' | 'tests' | 'scripts';

export type PanelLayout = 'vertical' | 'horizontal';
export type CollectionSortOrder = 'manual' | 'name-asc' | 'name-desc' | 'method' | 'created-desc' | 'created-asc' | 'modified-desc' | 'modified-asc';

interface UIState {
  sidebarTab: SidebarTab;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  sidebarSplitRatio: number;  // For desktop app sidebar resizing
  requestTab: RequestTab;
  responseTab: ResponseTab;
  connectionMode: ConnectionMode;
  panelLayout: PanelLayout;
  panelSplitRatio: number;
  historyDrawerOpen: boolean;
  historyDrawerHeight: number;
  collectionSortOrder: CollectionSortOrder;
  responseWordWrap: boolean;
}

const initialState: UIState = {
  sidebarTab: 'collections',
  sidebarCollapsed: false,
  sidebarWidth: 280,
  sidebarSplitRatio: 0.2,  // Default 20% for sidebar
  requestTab: 'query',
  responseTab: 'body',
  connectionMode: 'http',
  panelLayout: 'horizontal',
  panelSplitRatio: 0.5,
  historyDrawerOpen: false,
  historyDrawerHeight: 300,
  collectionSortOrder: 'manual',
  responseWordWrap: typeof localStorage !== 'undefined' ? localStorage.getItem('nouto-response-wordwrap') !== 'false' : true,
};

export let ui = $state<UIState>({ ...initialState });

// Convenience functions
export function setSidebarTab(tab: SidebarTab) {
  ui.sidebarTab = tab;
}

export function toggleSidebar() {
  ui.sidebarCollapsed = !ui.sidebarCollapsed;
}

export function setSidebarWidth(width: number) {
  ui.sidebarWidth = width;
}

export function setRequestTab(tab: RequestTab) {
  ui.requestTab = tab;
}

export function setResponseTab(tab: ResponseTab) {
  ui.responseTab = tab;
}

export function setConnectionMode(mode: ConnectionMode) {
  ui.connectionMode = mode;
}

export function togglePanelLayout() {
  ui.panelLayout = ui.panelLayout === 'vertical' ? 'horizontal' : 'vertical';
}

export function setPanelLayout(layout: PanelLayout) {
  ui.panelLayout = layout;
}

export function setPanelSplitRatio(ratio: number) {
  ui.panelSplitRatio = Math.max(0.15, Math.min(0.85, ratio));
}

export function setSidebarSplitRatio(ratio: number) {
  ui.sidebarSplitRatio = Math.max(0.15, Math.min(0.5, ratio)); // Sidebar: 15% to 50%
}

export function toggleHistoryDrawer() {
  ui.historyDrawerOpen = !ui.historyDrawerOpen;
}

export function setHistoryDrawerOpen(open: boolean) {
  ui.historyDrawerOpen = open;
}

export function setHistoryDrawerHeight(height: number) {
  ui.historyDrawerHeight = Math.max(120, height);
}

export function setCollectionSortOrder(order: CollectionSortOrder) {
  ui.collectionSortOrder = order;
}

export function toggleResponseWordWrap() {
  ui.responseWordWrap = !ui.responseWordWrap;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('nouto-response-wordwrap', String(ui.responseWordWrap));
  }
}

export function resetUI() {
  Object.assign(ui, initialState);
}


// Bulk restore per-tab UI state for tab switching
export function bulkSetPerTabUI(data: { requestTab?: string; responseTab?: string; connectionMode?: ConnectionMode }) {
  ui.requestTab = (data.requestTab || 'query') as RequestTab;
  ui.responseTab = (data.responseTab || 'body') as ResponseTab;
  ui.connectionMode = data.connectionMode || 'http';
}
