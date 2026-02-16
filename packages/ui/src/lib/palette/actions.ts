// Command Palette Actions Registry

export interface PaletteAction {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  category: 'create' | 'import' | 'export' | 'edit' | 'run' | 'settings';
  keybinding?: string;
}

export const PALETTE_ACTIONS: PaletteAction[] = [
  // Create actions
  {
    id: 'create-http',
    label: 'Create HTTP Request',
    description: 'Create a new HTTP/REST request',
    icon: 'globe',
    category: 'create',
    keybinding: 'Ctrl+N',
  },
  {
    id: 'create-graphql',
    label: 'Create GraphQL Request',
    description: 'Create a new GraphQL query or mutation',
    icon: 'symbol-structure',
    category: 'create',
  },
  {
    id: 'create-websocket',
    label: 'Create WebSocket Request',
    description: 'Create a new WebSocket connection',
    icon: 'plug',
    category: 'create',
  },
  {
    id: 'create-sse',
    label: 'Create SSE Request',
    description: 'Create a new Server-Sent Events connection',
    icon: 'broadcast',
    category: 'create',
  },
  {
    id: 'create-folder',
    label: 'Create Folder',
    description: 'Create a new folder in collection',
    icon: 'folder',
    category: 'create',
  },
  {
    id: 'create-collection',
    label: 'Create Collection',
    description: 'Create a new request collection',
    icon: 'folder-library',
    category: 'create',
  },
  {
    id: 'create-env',
    label: 'Create Environment',
    description: 'Create a new environment with variables',
    icon: 'add',
    category: 'create',
  },

  // Import actions
  {
    id: 'import-openapi',
    label: 'Import from OpenAPI',
    description: 'Import requests from OpenAPI v3 specification',
    icon: 'file-code',
    category: 'import',
  },
  {
    id: 'import-postman',
    label: 'Import from Postman',
    description: 'Import Postman collection (v2.1)',
    icon: 'cloud-download',
    category: 'import',
  },
  {
    id: 'import-insomnia',
    label: 'Import from Insomnia',
    description: 'Import Insomnia workspace',
    icon: 'cloud-download',
    category: 'import',
  },
  {
    id: 'import-hoppscotch',
    label: 'Import from Hoppscotch',
    description: 'Import Hoppscotch collection',
    icon: 'cloud-download',
    category: 'import',
  },
  {
    id: 'import-curl',
    label: 'Import from cURL',
    description: 'Paste a cURL command to create request',
    icon: 'terminal',
    category: 'import',
    keybinding: 'Ctrl+U',
  },
  {
    id: 'import-url',
    label: 'Import from URL',
    description: 'Import collection from remote URL',
    icon: 'link',
    category: 'import',
  },

  // Export actions
  {
    id: 'export-collection',
    label: 'Export Collection',
    description: 'Export collection to JSON file',
    icon: 'save',
    category: 'export',
  },
  {
    id: 'export-all',
    label: 'Export All Collections',
    description: 'Export all collections to JSON file',
    icon: 'save-all',
    category: 'export',
  },

  // Edit actions
  {
    id: 'copy-curl',
    label: 'Copy as cURL',
    description: 'Copy current request as cURL command',
    icon: 'copy',
    category: 'edit',
  },
  {
    id: 'copy-code',
    label: 'Generate Code',
    description: 'Generate code snippet in various languages',
    icon: 'code',
    category: 'edit',
  },
  {
    id: 'duplicate-request',
    label: 'Duplicate Request',
    description: 'Create a copy of the current request',
    icon: 'files',
    category: 'edit',
  },
  {
    id: 'delete-request',
    label: 'Delete Request',
    description: 'Delete the current request',
    icon: 'trash',
    category: 'edit',
  },
  {
    id: 'rename-request',
    label: 'Rename Request',
    description: 'Rename the current request',
    icon: 'edit',
    category: 'edit',
  },

  // Run actions
  {
    id: 'run-collection',
    label: 'Run Collection',
    description: 'Execute all requests in a collection',
    icon: 'play-circle',
    category: 'run',
  },
  {
    id: 'run-folder',
    label: 'Run Folder',
    description: 'Execute all requests in a folder',
    icon: 'play',
    category: 'run',
  },
  {
    id: 'start-mock-server',
    label: 'Start Mock Server',
    description: 'Start a mock server for testing',
    icon: 'server',
    category: 'run',
  },
  {
    id: 'benchmark-request',
    label: 'Benchmark Request',
    description: 'Run performance benchmark on request',
    icon: 'dashboard',
    category: 'run',
  },

  // Settings actions
  {
    id: 'open-settings',
    label: 'Open Settings',
    description: 'Open HiveFetch settings',
    icon: 'settings-gear',
    category: 'settings',
  },
  {
    id: 'switch-storage-mode',
    label: 'Switch Storage Mode',
    description: 'Toggle between monolithic and git-friendly storage',
    icon: 'database',
    category: 'settings',
  },
  {
    id: 'clear-history',
    label: 'Clear Request History',
    description: 'Delete all request history',
    icon: 'clear-all',
    category: 'settings',
  },
];

/**
 * Get actions filtered by category
 */
export function getActionsByCategory(category: PaletteAction['category']): PaletteAction[] {
  return PALETTE_ACTIONS.filter(action => action.category === category);
}

/**
 * Get action by ID
 */
export function getActionById(id: string): PaletteAction | undefined {
  return PALETTE_ACTIONS.find(action => action.id === id);
}

/**
 * Search actions by label or description
 */
export function searchActions(query: string): PaletteAction[] {
  const lowerQuery = query.toLowerCase();
  return PALETTE_ACTIONS.filter(action =>
    action.label.toLowerCase().includes(lowerQuery) ||
    action.description?.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Get context-aware actions based on current selection
 */
export function getContextActions(context: {
  hasActiveRequest?: boolean;
  hasActiveCollection?: boolean;
  hasActiveFolder?: boolean;
}): PaletteAction[] {
  const actions: PaletteAction[] = [];

  // Always available actions
  actions.push(...getActionsByCategory('create'));
  actions.push(...getActionsByCategory('import'));

  // Request-specific actions
  if (context.hasActiveRequest) {
    actions.push(
      ...PALETTE_ACTIONS.filter(a =>
        ['copy-curl', 'copy-code', 'duplicate-request', 'delete-request', 'rename-request', 'benchmark-request'].includes(a.id)
      )
    );
  }

  // Collection-specific actions
  if (context.hasActiveCollection) {
    actions.push(
      ...PALETTE_ACTIONS.filter(a =>
        ['export-collection', 'run-collection'].includes(a.id)
      )
    );
  }

  // Folder-specific actions
  if (context.hasActiveFolder) {
    actions.push(
      ...PALETTE_ACTIONS.filter(a =>
        ['run-folder'].includes(a.id)
      )
    );
  }

  return actions;
}
