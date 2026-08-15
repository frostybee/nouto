/**
 * Key/value completion-context detection for OpenAPI documents. The full
 * implementation was promoted to `@nouto/core` (it is pure text+offset logic
 * shared with the VS Code provider); this module re-exports it so desktop
 * consumers keep their existing import path.
 */
export {
  detectJsonContext,
  detectYamlContext,
  isInsideQuotes,
} from '@nouto/core/services/openapi/completion/context';
export type { DetectedContext } from '@nouto/core/services/openapi/completion/context';
