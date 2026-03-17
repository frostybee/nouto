// Re-export all shared types from @nouto/core
// This includes: all domain types, ResponseData, TimingData, ContentCategory, etc.
export * from '@nouto/core';

// UI-only types (webview-specific, not shared with extension)

export type SidebarTab = 'collections' | 'history';
export type RequestTab = 'query' | 'path' | 'headers' | 'auth' | 'body' | 'tests' | 'scripts' | 'notes' | 'settings';
export type ResponseTab = 'body' | 'headers' | 'cookies' | 'timing' | 'timeline' | 'tests' | 'scripts';
