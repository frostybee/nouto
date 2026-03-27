// Components
export { default as JsonExplorerPanel } from './components/JsonExplorerPanel.svelte';

// Store
export {
  initJsonExplorer,
  restorePersistedState,
  type JsonExplorerInitData,
  type FlatNode,
  type PathSegment,
  type SearchMatch,
} from './stores/jsonExplorer.svelte';

// Utilities (for standalone consumers)
export { flattenJson, DEFAULT_PAGE_SIZE } from './lib/flatten';
export { searchJson } from './lib/search';
export { fuzzySearchJson } from './lib/fuzzy-search';
export { computeStructuralDiff } from './lib/diff';
export { parseQuery, evaluateQuery, filterByQuery } from './lib/query-parser';
export { generateTypes, type TargetLanguage } from './lib/type-generators';
export { inferSchema } from './lib/schema-inference';
export {
  toFormattedJson, toMinifiedJson, toYaml, toCsv,
  toTypeScriptType, toPythonDict, toPhpArray, toMarkdownTable,
} from './lib/copy-formats';
export { appendPath, pathToSegments, getParentPath, getValueAtPath } from './lib/path-utils';
