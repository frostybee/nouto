/**
 * The spec skeleton constants moved to `@nouto/core`
 * (services/openapi/specSkeletons.ts) so the desktop app can share them. This
 * module re-exports them unchanged for the existing VS Code consumers.
 */
export {
  OPERATION_SKELETON,
  PATH_PARAMETER_SKELETON,
  serverSkeleton,
  tagSkeleton,
  securityRequirementSkeleton,
  SECURITY_SCHEME_PRESETS,
  COMPONENT_TITLES,
  COMPONENT_PLACEHOLDERS,
  COMPONENT_PRESETS,
} from '@nouto/core/services';
