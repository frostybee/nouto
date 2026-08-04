/**
 * The outline node model moved to `@nouto/core` (services/openapi/outline.ts)
 * so the desktop app can share it. This module re-exports the types unchanged
 * for the existing VS Code consumers.
 */
export type { OutlineNode, OutlineBuildResult } from '@nouto/core/services';
