import { writable } from 'svelte/store';
import type { ConnectionMode } from '../types';

export type SidebarTab = 'collections' | 'history';
export type RequestTab = 'query' | 'headers' | 'auth' | 'body' | 'tests' | 'scripts';
export type ResponseTab = 'body' | 'headers' | 'cookies' | 'timing' | 'timeline' | 'scripts';

export type PanelLayout = 'vertical' | 'horizontal';

interface UIState {
  sidebarTab: SidebarTab;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  requestTab: RequestTab;
  responseTab: ResponseTab;
  connectionMode: ConnectionMode;
  panelLayout: PanelLayout;
  panelSplitRatio: number;
}

const initialState: UIState = {
  sidebarTab: 'collections',
  sidebarCollapsed: false,
  sidebarWidth: 280,
  requestTab: 'query',
  responseTab: 'body',
  connectionMode: 'http',
  panelLayout: 'vertical',
  panelSplitRatio: 0.5,
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
