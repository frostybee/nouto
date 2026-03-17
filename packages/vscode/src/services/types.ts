// Re-export all shared types from @nouto/core
export * from '@nouto/core';

// Extension-only types

export interface DraftEntry {
  id: string;              // panelId
  requestId: string | null;
  collectionId: string | null;
  request: import('@nouto/core').SavedRequest;
  updatedAt: string;
}
