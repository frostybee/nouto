import type { Collection, Folder, ScriptConfig } from './types';
import { getItemPath } from './InheritanceService';

interface ResolvedScriptSource {
  source: string;
  level: string; // collection name, folder name, or request name
}

export interface ResolvedScripts {
  preRequestScripts: ResolvedScriptSource[];
  postResponseScripts: ResolvedScriptSource[];
}

/**
 * Resolve the script chain for a request: collection → folder(s) → request.
 * Scripts are executed in ancestor order (collection first, request last).
 */
export function resolveScriptsForRequest(
  collection: Collection,
  requestId: string
): ResolvedScripts {
  const preRequestScripts: ResolvedScriptSource[] = [];
  const postResponseScripts: ResolvedScriptSource[] = [];

  const ancestors = getItemPath(collection, requestId);

  for (const ancestor of ancestors) {
    const scripts = getScripts(ancestor);
    const name = ancestor.name;

    if (scripts?.preRequest?.trim()) {
      preRequestScripts.push({ source: scripts.preRequest, level: name });
    }
    if (scripts?.postResponse?.trim()) {
      postResponseScripts.push({ source: scripts.postResponse, level: name });
    }
  }

  return { preRequestScripts, postResponseScripts };
}

function getScripts(item: Collection | Folder): ScriptConfig | undefined {
  return item.scripts;
}
