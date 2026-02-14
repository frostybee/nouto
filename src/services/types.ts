// Re-export all shared types from @hivefetch/core
export * from '@hivefetch/core';

// Extension-only types

export interface DraftEntry {
  id: string;              // panelId
  requestId: string | null;
  collectionId: string | null;
  request: import('@hivefetch/core').SavedRequest;
  updatedAt: string;
}
