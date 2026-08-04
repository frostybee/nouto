import type { OpenApiFormat } from '@nouto/core/services/openapi/types';

/**
 * Document formatting for the OpenAPI editor (Phase 5). Prettier's YAML
 * printer is comment- and anchor-preserving — the reason Prettier over a
 * plain yaml re-stringify. Everything is dynamically imported so the Prettier
 * chunks stay out of the app bundle until the Format action first fires
 * (same lazy-load discipline as Monaco). Never wired to save.
 */
export async function formatDocument(content: string, format: OpenApiFormat): Promise<string> {
  const { format: prettierFormat } = await import('prettier/standalone');
  if (format === 'yaml') {
    const yamlPlugin = (await import('prettier/plugins/yaml')).default;
    return prettierFormat(content, { parser: 'yaml', plugins: [yamlPlugin] });
  }
  // Prettier v3 ships the JSON parser in the babel plugin; estree is its printer.
  const [babelPlugin, estreePlugin] = await Promise.all([
    import('prettier/plugins/babel').then((m) => m.default),
    import('prettier/plugins/estree').then((m) => m.default),
  ]);
  return prettierFormat(content, { parser: 'json', plugins: [babelPlugin, estreePlugin] });
}
