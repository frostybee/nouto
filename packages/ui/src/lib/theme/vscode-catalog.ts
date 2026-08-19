// Lazy access to the vendored VS Code theme catalog: the generated index
// carries everything the browse dialog renders (names, modes, swatches); a
// theme's JSON is fetched and converted only when it is installed. Ported
// from the author's sarde-studio project (src/lib/theme/vscode-catalog.js).

import { VSCODE_CATALOG, type VsCodeCatalogEntry } from './vscode-catalog-index';
import { convertVsCodeTheme, type ConvertResult } from './vscode-import';

const modules = import.meta.glob('./vscode-themes/*.json');

export function listCatalogThemes(): VsCodeCatalogEntry[] {
  return VSCODE_CATALOG;
}

export async function loadCatalogTheme(id: string): Promise<ConvertResult> {
  const entry = VSCODE_CATALOG.find((e) => e.id === id);
  if (!entry) return { error: 'Unknown catalog theme.' };
  const loader = modules[`./vscode-themes/${entry.file}`];
  if (!loader) return { error: 'Theme file is missing from the bundle.' };
  try {
    const mod = (await loader()) as { default?: unknown };
    return convertVsCodeTheme(mod.default ?? mod, { fileName: entry.file });
  } catch {
    return { error: 'Could not load the theme file.' };
  }
}
