/**
 * The outline tree builder moved to `@nouto/core` (services/openapi/outline.ts)
 * so the desktop app can share it. This module re-exports it unchanged for the
 * existing VS Code consumers.
 */
export { buildOutlineTree, relativeLabel } from '@nouto/core/services';
export type { BuildOutlineOptions } from '@nouto/core/services';
