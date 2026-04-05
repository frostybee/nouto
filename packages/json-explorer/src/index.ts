// Components
export { default as JsonExplorerPanel } from './components/JsonExplorerPanel.svelte';

// Store
export {
  initJsonExplorer,
  updateJsonData,
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
export { toFormattedJson, toMinifiedJson, toYaml } from './lib/copy-formats';
export { appendPath, pathToSegments, getParentPath, getValueAtPath } from './lib/path-utils';
