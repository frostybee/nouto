import type { Extension } from '@codemirror/state';
import { json } from '@codemirror/lang-json';
import { xml } from '@codemirror/lang-xml';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { yaml } from '@codemirror/lang-yaml';
import { markdown } from '@codemirror/lang-markdown';

export type LanguageId = 'json' | 'xml' | 'html' | 'css' | 'javascript' | 'yaml' | 'markdown' | 'text';

/**
 * Map a MIME content-type string to a CodeMirror language identifier.
 */
export function resolveLanguageFromContentType(contentType: string): LanguageId {
  const ct = contentType.toLowerCase();

  if (ct.includes('application/json') || ct.includes('+json')) return 'json';
  if (ct.includes('text/xml') || ct.includes('application/xml') || ct.includes('+xml')) return 'xml';
  if (ct.includes('text/html')) return 'html';
  if (ct.includes('text/css')) return 'css';
  if (ct.includes('application/javascript') || ct.includes('text/javascript') || ct.includes('application/x-javascript') || ct.includes('application/ecmascript')) return 'javascript';
  if (ct.includes('text/yaml') || ct.includes('text/x-yaml') || ct.includes('application/yaml') || ct.includes('application/x-yaml')) return 'yaml';
  if (ct.includes('text/markdown') || ct.includes('text/x-markdown')) return 'markdown';

  return 'text';
}

/**
 * Get the CodeMirror language extension for a given language ID.
 * Returns null for plain text (no highlighting).
 */
export function getLanguageExtension(lang: LanguageId): Extension | null {
  switch (lang) {
    case 'json': return json();
    case 'xml': return xml();
    case 'html': return html();
    case 'css': return css();
    case 'javascript': return javascript({ typescript: true, jsx: true });
    case 'yaml': return yaml();
    case 'markdown': return markdown();
    case 'text':
    default: return null;
  }
}

/** Map language IDs to file extensions for downloads. */
export const languageFileExtensions: Record<LanguageId, string> = {
  json: 'json',
  xml: 'xml',
  html: 'html',
  css: 'css',
  javascript: 'js',
  yaml: 'yaml',
  markdown: 'md',
  text: 'txt',
};
