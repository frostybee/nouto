/**
 * Public barrel for the OpenAPI subsystem, re-exported wholesale by
 * `services/index.ts`. Deep imports (`@nouto/core/services/openapi/<module>`)
 * remain first-class — the desktop app uses them to keep Node-only modules
 * out of its webview bundle.
 */
export { OpenApiImportService } from './OpenApiImportService';
export {
  OpenApiConversionError,
  getAdditionalOperations,
  OPENAPI_OPERATION_METHODS,
  OPENAPI_FIXED_METHOD_NAMES,
} from './types';
export type {
  OpenApiFormat,
  OpenApiVersion,
  OpenApiDiagnostic,
  OpenApiOperationSummary,
  OpenApiAnalysis,
  OpenApiImportResult,
  OpenApiOperationConversion,
  NormalizedParam,
  NormalizedBody,
  NormalizedResponseGroup,
  NormalizedSecurity,
  NormalizedOperation,
  OpenApiExportOptions,
  OpenApiExportResult,
} from './types';
export { OpenApiExportService } from './OpenApiExportService';
export { analyzeOpenApi, listOpenApiOperations, detectOpenApiVersion, resolveOpenApiVersion } from './analyze';
export type { ResolvedOpenApiVersion } from './analyze';
export { inferJsonSchema, inferJsonSchemaFromSamples } from './schemaInference';
export type { SchemaInferenceDialect, SchemaInferenceOptions } from './schemaInference';
export { deriveSchemaName, classifyPathSegment } from './specNaming';
export type { PathSegmentClass } from './specNaming';
// External $ref resolution across local workspace files (FileResolver seam)
export {
  splitExternalRef,
  resolveExternalRefUri,
  analyzeOpenApiWithExternalRefs,
  bundleExternalRefs,
  parseExternalFileContent,
} from './externalRefs';
export type {
  FileResolver,
  ExternalRefEntry,
  ExternalAnalysisResult,
  ResolvedFileMap,
} from './externalRefs';
export { bundleAnalyzedSpecForRender } from './bundleForRender';
export { runLintRules, ALL_LINT_RULES, DEFAULT_DISABLED_RULES, LINT_RULES_CATALOG } from './lint/registry';
export type { LintRuleCatalogEntry } from './lint/registry';
export type { LintRule, LintOptions, LintSeverity, LintFinding } from './lint/types';
// OpenAPI schema-aware completion + hover (curated tables + pointer classifier)
export {
  getCompletions,
  getPropertyDocs,
  getEnumValues,
  getDynamicKeyCandidates,
  classifyPointer,
  ALL_NODE_KIND_TABLES,
} from './completion/registry';
export type {
  OpenApiNodeKind,
  PropertyCompletionEntry,
  NodeKindTable,
  EnumValueEntry,
  NodeKindClassification,
} from './completion/types';
export {
  COMPONENT_SECTION_FOR_KIND,
  ALL_REF_SECTIONS,
  enumerateRefTargets,
} from './completion/refTargets';
// Host-agnostic completion-context detection + suggestion-building helpers
export { detectJsonContext, detectYamlContext, isInsideQuotes } from './completion/context';
export type { DetectedContext } from './completion/context';
export { keySnippet, detailFor, visibleInVersion, siblingKeys } from './completion/suggest';
export { parsePartialRefValue, typedRefValue } from './completion/externalRefValue';
export type { PartialRefValue } from './completion/externalRefValue';
export { resolveHoverDocs } from './completion/hover';
export type { HoverDocsResult } from './completion/hover';
export {
  getOpenApiMetaSchema,
  validateOpenApiMetaSchema,
  openapi30MetaSchema,
  openapi31MetaSchema,
  openapi31MetaSchemaEditor,
  openapi32MetaSchema,
  openapi32MetaSchemaEditor,
} from './schemas';
export {
  buildPointer as buildJsonPointer,
  parsePointer as parseJsonPointer,
  escapePointerSegment as escapeJsonPointerSegment,
  getByPointer as getByJsonPointer,
  internalRefToPointer,
} from './pointer';
// OpenAPI outline tree (shared by the VS Code tree view and the desktop outline)
export { buildOutlineTree, relativeLabel } from './outline';
export type { OutlineNode, OutlineBuildResult, BuildOutlineOptions } from './outline';
// Pure syntax diagnostics + offset-based pointer map (hosts convert offsets to ranges)
export { buildSyntaxDiagnostics } from './syntax';
export {
  buildPointerMap,
  pointerToOffsetRange,
  pointerToAnchorOffsetRange,
  offsetToPointer,
} from './pointerMap';
export type { OpenApiPointerMap, OffsetRange } from './pointerMap';
// OpenAPI spec-edit planners (text/offset-based; hosts convert to their edit types)
export {
  planDeleteAtPointer,
  planInsertObjectMember,
  planInsertArrayItem,
  planSetScalarAtPointer,
} from './specEdit';
export type { SpecTextEdit, SpecDocument, SpecEditPlan } from './specEdit';
export { uniqueName, uniqueMemberKey } from './specNaming';
export { asString, fileLabel } from './quickFixUtils';
export {
  OPENAPI_DOCUMENT_SKELETON,
  OPERATION_SKELETON,
  PATH_PARAMETER_SKELETON,
  serverSkeleton,
  tagSkeleton,
  securityRequirementSkeleton,
  SECURITY_SCHEME_PRESETS,
  COMPONENT_TITLES,
  COMPONENT_PLACEHOLDERS,
  COMPONENT_PRESETS,
} from './specSkeletons';
