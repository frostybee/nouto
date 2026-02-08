import { writable } from 'svelte/store';
import type { ConnectionMode } from '../types';

export type SidebarTab = 'collections' | 'history';
export type RequestTab = 'query' | 'headers' | 'auth' | 'body' | 'tests' | 'scripts';
export type ResponseTab = 'body' | 'headers' | 'cookies' | 'timing' | 'timeline' | 'scripts';

interface UIState {
  sidebarTab: SidebarTab;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  requestTab: RequestTab;
  responseTab: ResponseTab;
  connectionMode: ConnectionMode;
}

const initialState: UIState = {
  sidebarTab: 'collections',
  sidebarCollapsed: false,
  sidebarWidth: 280,
  requestTab: 'query',
  responseTab: 'body',
  connectionMode: 'http',
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
