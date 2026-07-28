import * as vscode from 'vscode';
import type { FileResolver, OpenApiFormat } from '@nouto/core/services';
import { OpenApiCodeActionProvider } from './OpenApiCodeActionProvider';
import {
  buildPointerMap,
  clearOpenApiDocumentState,
  getOpenApiAnalysisWithExternalRefs,
  pointerToRange,
} from '../services/openapi';
import { createFakeTextDocument } from '../test/helpers/fakeTextDocument';

function fakeContext(settings?: Record<string, unknown>): vscode.ExtensionContext {
  return {
    globalState: {
      get: (key: string) => (key === 'nouto.settings' ? settings : undefined),
    },
  } as unknown as vscode.ExtensionContext;
}

function makeResolver(
  files: Record<string, { content: string; format: OpenApiFormat }>
): FileResolver {
  return {
    resolve: (fromUri, refPath) => new URL(refPath, fromUri).toString(),
    load: async (uri) => files[uri],
  };
}

const COMMON = 'components:\n  schemas:\n    Item:\n      type: string\n';

function rootSpec(ref: string): string {
  return [
    'openapi: 3.1.0',
    'info:',
    '  title: T',
    '  version: 1.0.0',
    'paths: {}',
    'components:',
    '  schemas:',
    '    Local:',
    `      $ref: '${ref}'`,
    '',
  ].join('\n');
}

describe('OpenApiCodeActionProvider external-ref fixes', () => {
  let counter = 0;
  const documents: vscode.TextDocument[] = [];
  const openTextDocument = vscode.workspace.openTextDocument as jest.Mock;

  afterEach(() => {
    for (const document of documents) clearOpenApiDocumentState(document.uri);
    documents.length = 0;
    jest.clearAllMocks();
  });

  function makeDocument(content: string): vscode.TextDocument {
    counter += 1;
    const document = createFakeTextDocument({
      content,
      languageId: 'yaml',
      path: `/external-fix-${counter}/api.yaml`,
    });
    documents.push(document);
    return document;
  }

  /**
   * Runs the tier-2 analysis (as the diagnostics manager would), converts its
   * first diagnostic with `code` into a reported vscode.Diagnostic, and asks
   * the provider for actions on it.
   */
  async function offerExternalFix(
    document: vscode.TextDocument,
    resolver: FileResolver,
    code: string,
    settings?: Record<string, unknown>
  ): Promise<vscode.CodeAction[]> {
    const external = await getOpenApiAnalysisWithExternalRefs(document, resolver);
    const diagnostic = external.diagnostics.find((entry) => entry.code === code);
    if (!diagnostic) return [];
    const range = pointerToRange(buildPointerMap(document), diagnostic.pointer ?? '')!;
    const reported = new vscode.Diagnostic(range, diagnostic.message, vscode.DiagnosticSeverity.Error);
    reported.source = 'nouto-openapi';
    reported.code = code;
    const context = {
      diagnostics: [reported],
      triggerKind: 1,
      only: undefined,
    } as unknown as vscode.CodeActionContext;
    const provider = new OpenApiCodeActionProvider(fakeContext(settings), resolver);
    return provider.provideCodeActions(document, range, context);
  }

  it('scaffolds a missing component in the referenced file (edit targets that file)', async () => {
    const document = makeDocument(rootSpec('./common.yaml#/components/schemas/Missing'));
    const commonUri = `file:///external-fix-${counter}/common.yaml`;
    const resolver = makeResolver({ [commonUri]: { content: COMMON, format: 'yaml' } });
    openTextDocument.mockImplementation(async (uri: vscode.Uri) =>
      createFakeTextDocument({ content: COMMON, path: uri.path })
    );

    const actions = await offerExternalFix(document, resolver, 'external-pointer-not-found');

    expect(actions).toHaveLength(1);
    expect(actions[0].title).toBe('Create missing component "Missing" in common.yaml');
    expect(actions[0].command).toBeUndefined();
    const edit = actions[0].edit as unknown as {
      get(uri: { toString(): string }): unknown[];
    };
    expect(edit.get({ toString: () => commonUri }).length).toBeGreaterThan(0);
    expect(edit.get(document.uri)).toHaveLength(0);
  });

  it('offers no component fix for a pointer outside /components/<section>/<name>', async () => {
    const document = makeDocument(rootSpec('./common.yaml#/Missing'));
    const commonUri = `file:///external-fix-${counter}/common.yaml`;
    const resolver = makeResolver({ [commonUri]: { content: COMMON, format: 'yaml' } });

    const actions = await offerExternalFix(document, resolver, 'external-pointer-not-found');

    expect(actions).toEqual([]);
  });

  it('offers a command-based fix that creates a missing file with the expected pointer', async () => {
    const document = makeDocument(rootSpec('./missing.yaml#/components/schemas/Pet'));
    const resolver = makeResolver({});

    const actions = await offerExternalFix(document, resolver, 'external-file-not-found');

    expect(actions).toHaveLength(1);
    expect(actions[0].title).toBe('Create missing file "missing.yaml"');
    expect(actions[0].edit).toBeUndefined();
    expect(actions[0].command).toMatchObject({
      command: 'nouto.openApiCodeAction.createExternalFile',
      arguments: [
        {
          targetUri: `file:///external-fix-${counter}/missing.yaml`,
          targetPointer: '/components/schemas/Pet',
        },
      ],
    });
  });

  it('offers no external fixes when externalRefsEnabled is off', async () => {
    const document = makeDocument(rootSpec('./missing.yaml#/components/schemas/Pet'));
    const resolver = makeResolver({});

    const actions = await offerExternalFix(document, resolver, 'external-file-not-found', {
      openApiExternalRefsEnabled: false,
    });

    expect(actions).toEqual([]);
  });
});
