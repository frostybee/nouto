import { writable } from 'svelte/store';
import type { ConnectionMode } from '../types';

export type SidebarTab = 'collections' | 'history' | 'environments';
export type RequestTab = 'query' | 'path' | 'headers' | 'auth' | 'body' | 'tests' | 'scripts' | 'notes';
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
};

export const ui = writable<UIState>(initialState);

// Convenience functions
export function setSidebarTab(tab: SidebarTab) {
  ui.update((state) => ({ ...state, sidebarTab: tab }));
}

export function toggleSidebar() {
  ui.update((state) => ({ ...state, sidebarCollapsed: !state.sidebarCollapsed }));
}

export function setSidebarWidth(width: number) {
  ui.update((state) => ({ ...state, sidebarWidth: width }));
}

export function setRequestTab(tab: RequestTab) {
  ui.update((state) => ({ ...state, requestTab: tab }));
}

export function setResponseTab(tab: ResponseTab) {
  ui.update((state) => ({ ...state, responseTab: tab }));
}

export function setConnectionMode(mode: ConnectionMode) {
  ui.update((state) => ({ ...state, connectionMode: mode }));
}

export function togglePanelLayout() {
  ui.update((state) => ({
    ...state,
    panelLayout: state.panelLayout === 'vertical' ? 'horizontal' : 'vertical',
  }));
}

export function setPanelLayout(layout: PanelLayout) {
  ui.update((state) => ({ ...state, panelLayout: layout }));
}

export function setPanelSplitRatio(ratio: number) {
  ui.update((state) => ({
    ...state,
    panelSplitRatio: Math.max(0.15, Math.min(0.85, ratio)),
  }));
}

export function setSidebarSplitRatio(ratio: number) {
  ui.update((state) => ({
    ...state,
    sidebarSplitRatio: Math.max(0.15, Math.min(0.5, ratio)), // Sidebar: 15% to 50%
  }));
}

export function toggleHistoryDrawer() {
  ui.update((state) => ({ ...state, historyDrawerOpen: !state.historyDrawerOpen }));
}

export function setHistoryDrawerOpen(open: boolean) {
  ui.update((state) => ({ ...state, historyDrawerOpen: open }));
}

export function setHistoryDrawerHeight(height: number) {
  ui.update((state) => ({
    ...state,
    historyDrawerHeight: Math.max(120, height),
  }));
}

export function setCollectionSortOrder(order: CollectionSortOrder) {
  ui.update((state) => ({ ...state, collectionSortOrder: order }));
}
