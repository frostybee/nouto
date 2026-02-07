import { writable } from 'svelte/store';

export type SidebarTab = 'collections' | 'history';
export type RequestTab = 'query' | 'headers' | 'auth' | 'body';
export type ResponseTab = 'body' | 'headers' | 'cookies' | 'timing' | 'timeline';

interface UIState {
  sidebarTab: SidebarTab;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  requestTab: RequestTab;
  responseTab: ResponseTab;
}

const initialState: UIState = {
  sidebarTab: 'collections',
  sidebarCollapsed: false,
  sidebarWidth: 280,
  requestTab: 'query',
  responseTab: 'body',
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
