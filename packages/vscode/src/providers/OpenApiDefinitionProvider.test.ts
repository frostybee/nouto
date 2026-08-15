import * as vscode from 'vscode';
import { OpenApiDefinitionProvider } from './OpenApiDefinitionProvider';
import { VscodeFileResolver } from '../services/openapi/vscodeFileResolver';
import { createFakeTextDocument } from '../test/helpers/fakeTextDocument';
import { clearOpenApiDocumentState } from '../services/openapi';

function fakeContext(settings?: Record<string, unknown>): vscode.ExtensionContext {
  return {
    globalState: {
      get: (key: string) => (key === 'nouto.settings' ? settings : undefined),
    },
  } as unknown as vscode.ExtensionContext;
}

function positionOfRefValue(content: string, ref: string): { content: string; offset: number } {
  const index = content.indexOf(ref);
  if (index < 0) throw new Error(`fixture does not contain ${ref}`);
  return { content, offset: index + 2 };
}

function provide(
  document: vscode.TextDocument,
  offset: number,
  options: { cancel?: boolean; settings?: Record<string, unknown> } = {}
) {
  const provider = new OpenApiDefinitionProvider(new VscodeFileResolver(), fakeContext(options.settings));
  return provider.provideDefinition(
    document,
    document.positionAt(offset),
    { isCancellationRequested: options.cancel ?? false } as vscode.CancellationToken
  );
}

const YAML_SPEC = `openapi: 3.1.0
info:
  title: Refs
  version: 1.0.0
paths:
  /pets:
    get:
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Pet'
components:
  schemas:
    Pet:
      type: object
      properties:
        name:
          type: string
`;

describe('OpenApiDefinitionProvider', () => {
  let documentPath = 0;

  function makeDocument(content: string, languageId = 'yaml'): vscode.TextDocument {
    documentPath += 1;
    const extension = languageId === 'yaml' ? 'yaml' : 'json';
    return createFakeTextDocument({
      content,
      languageId,
      path: `/definition-${documentPath}.${extension}`,
    });
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('resolves an internal $ref in YAML to the referenced node', async () => {
    const document = makeDocument(YAML_SPEC);
    const { offset } = positionOfRefValue(YAML_SPEC, "'#/components/schemas/Pet'");

    const result = (await provide(document, offset)) as vscode.LocationLink[] | undefined;

    expect(result).toHaveLength(1);
    const targetOffset = document.offsetAt(result![0].targetRange.start);
    // The target range starts inside the Pet schema definition.
    expect(YAML_SPEC.slice(targetOffset).startsWith('type: object')).toBe(true);
  });

  it('underlines the whole ref value without quotes on the origin side', async () => {
    const document = makeDocument(YAML_SPEC);
    const { offset } = positionOfRefValue(YAML_SPEC, "'#/components/schemas/Pet'");

    const result = (await provide(document, offset)) as vscode.LocationLink[] | undefined;

    const origin = result![0].originSelectionRange!;
    const originText = YAML_SPEC.slice(
      document.offsetAt(origin.start),
      document.offsetAt(origin.end)
    );
    expect(originText).toBe('#/components/schemas/Pet');
  });

  it('resolves an internal $ref in JSON', async () => {
    const json = JSON.stringify(
      {
        openapi: '3.0.3',
        info: { title: 'Refs', version: '1.0.0' },
        paths: { '/pets': { get: { responses: { '200': { description: 'ok' } } } } },
        components: {
          schemas: {
            Pet: { type: 'object' },
            PetList: { type: 'array', items: { $ref: '#/components/schemas/Pet' } },
          },
        },
      },
      null,
      2
    );
    const document = makeDocument(json, 'json');
    const offset = json.indexOf('"#/components/schemas/Pet"') + 2;

    const result = (await provide(document, offset)) as vscode.LocationLink[] | undefined;

    expect(result).toHaveLength(1);
    const origin = result![0].originSelectionRange!;
    expect(
      json.slice(document.offsetAt(origin.start), document.offsetAt(origin.end))
    ).toBe('#/components/schemas/Pet');
  });

  it('resolves references with escaped RFC 6901 segments', async () => {
    const content = `openapi: 3.1.0
info:
  title: Escaped
  version: 1.0.0
paths:
  /a:
    get:
      parameters:
        - $ref: '#/components/parameters/we~1ird'
components:
  parameters:
    we/ird:
      name: weird
      in: query
`;
    const document = makeDocument(content);
    const offset = content.indexOf("'#/components/parameters/we~1ird'") + 2;

    expect(await provide(document, offset)).toBeDefined();
  });

  it('resolves a reference that targets an array element', async () => {
    const content = `openapi: 3.1.0
info:
  title: Arrays
  version: 1.0.0
servers:
  - url: https://example.test
paths: {}
components:
  schemas:
    First:
      $ref: '#/servers/0'
`;
    const document = makeDocument(content);
    const offset = content.indexOf("'#/servers/0'") + 2;

    expect(await provide(document, offset)).toBeDefined();
  });

  it('resolves a root reference', async () => {
    const content = `openapi: 3.1.0
info:
  title: Root
  version: 1.0.0
paths: {}
components:
  schemas:
    Whole:
      $ref: '#'
`;
    const document = makeDocument(content);
    const offset = content.indexOf("'#'") + 2;

    const result = (await provide(document, offset)) as vscode.LocationLink[] | undefined;
    expect(result).toHaveLength(1);
    expect(document.offsetAt(result![0].targetRange.start)).toBe(0);
  });

  it('navigates references that participate in a cycle', async () => {
    const content = `openapi: 3.1.0
info:
  title: Cycle
  version: 1.0.0
paths: {}
components:
  schemas:
    Node:
      type: object
      properties:
        next:
          $ref: '#/components/schemas/Node'
`;
    const document = makeDocument(content);
    const offset = content.indexOf("'#/components/schemas/Node'") + 2;

    expect(await provide(document, offset)).toBeDefined();
  });

  it('returns nothing when the cursor is outside a $ref value', async () => {
    const document = makeDocument(YAML_SPEC);
    const offset = YAML_SPEC.indexOf('title: Refs') + 2;

    expect(await provide(document, offset)).toBeUndefined();
  });

  it('returns nothing for missing references', async () => {
    const content = YAML_SPEC.replace(
      '#/components/schemas/Pet',
      '#/components/schemas/Missing'
    );
    const document = makeDocument(content);
    const offset = content.indexOf("'#/components/schemas/Missing'") + 2;

    expect(await provide(document, offset)).toBeUndefined();
  });

  it('returns nothing for malformed pointers', async () => {
    const content = YAML_SPEC.replace('#/components/schemas/Pet', '#components/schemas/Pet');
    const document = makeDocument(content);
    const offset = content.indexOf("'#components/schemas/Pet'") + 2;

    expect(await provide(document, offset)).toBeUndefined();
  });

  it('returns nothing for non-OpenAPI documents', async () => {
    const content = `title: not a spec
schema:
  $ref: '#/definitions/Thing'
definitions:
  Thing:
    type: object
`;
    const document = makeDocument(content);
    const offset = content.indexOf("'#/definitions/Thing'") + 2;

    expect(await provide(document, offset)).toBeUndefined();
  });

  it('returns nothing for references with malformed percent-encoding', async () => {
    const content = YAML_SPEC.replace('#/components/schemas/Pet', '#/components/%zz');
    const document = makeDocument(content);
    const offset = content.indexOf("'#/components/%zz'") + 2;

    expect(await provide(document, offset)).toBeUndefined();
  });

  it('returns nothing when the $ref value is not a string', async () => {
    const content = `openapi: 3.1.0
info:
  title: Numeric
  version: 1.0.0
paths: {}
components:
  schemas:
    Odd:
      $ref: 42
`;
    const document = makeDocument(content);
    const offset = content.indexOf('42') + 1;

    expect(await provide(document, offset)).toBeUndefined();
  });

  it('returns nothing when the document does not parse at all', async () => {
    const document = makeDocument(YAML_SPEC);
    const { offset } = positionOfRefValue(YAML_SPEC, "'#/components/schemas/Pet'");
    expect(await provide(document, offset)).toBeDefined();

    const broken = createFakeTextDocument({
      content: YAML_SPEC.replace('paths:', 'paths:\n  : : :'),
      languageId: 'yaml',
      path: document.uri.fsPath,
      version: 2,
    });
    expect(await provide(broken, offset)).toBeUndefined();

    clearOpenApiDocumentState(document.uri);
  });

  it('returns nothing when cancellation is requested', async () => {
    const document = makeDocument(YAML_SPEC);
    const { offset } = positionOfRefValue(YAML_SPEC, "'#/components/schemas/Pet'");

    expect(await provide(document, offset, { cancel: true })).toBeUndefined();
  });

  it('keeps resolving after the document stops parsing (sticky detection)', async () => {
    const document = makeDocument(YAML_SPEC);
    const { offset } = positionOfRefValue(YAML_SPEC, "'#/components/schemas/Pet'");
    expect(await provide(document, offset)).toBeDefined();

    // Same URI, but the version field is now unrecognizable.
    const broken = createFakeTextDocument({
      content: YAML_SPEC.replace('openapi: 3.1.0', 'openapi: nope'),
      languageId: 'yaml',
      path: document.uri.fsPath,
      version: 2,
    });

    // Detection is sticky, so the provider still runs; the ref still resolves.
    expect(await provide(broken, offset)).toBeDefined();

    clearOpenApiDocumentState(document.uri);
  });

  describe('external references', () => {
    const COMMON_CONTENT = `Item:
  type: object
  properties:
    id:
      type: string
`;
    const externalSpec = (ref: string) =>
      YAML_SPEC.replace("'#/components/schemas/Pet'", `'${ref}'`);

    const openTextDocument = vscode.workspace.openTextDocument as jest.Mock;

    it('jumps into the referenced workspace file at the pointer target', async () => {
      const content = externalSpec('./common.yaml#/Item');
      const document = makeDocument(content);
      openTextDocument.mockImplementation(async (uri: vscode.Uri) =>
        createFakeTextDocument({ content: COMMON_CONTENT, path: uri.path })
      );
      const offset = content.indexOf("'./common.yaml#/Item'") + 2;

      const result = (await provide(document, offset)) as vscode.LocationLink[] | undefined;

      expect(result).toHaveLength(1);
      expect(result![0].targetUri.toString()).toBe('file:///common.yaml');
      expect(result![0].targetRange).toBeDefined();
      const origin = result![0].originSelectionRange!;
      expect(
        content.slice(document.offsetAt(origin.start), document.offsetAt(origin.end))
      ).toBe('./common.yaml#/Item');
      expect(openTextDocument.mock.calls[0][0].path).toBe('/common.yaml');
    });

    it('jumps to the start of the file for bare-file references', async () => {
      const content = externalSpec('./common.yaml');
      const document = makeDocument(content);
      openTextDocument.mockImplementation(async (uri: vscode.Uri) =>
        createFakeTextDocument({ content: COMMON_CONTENT, path: uri.path })
      );
      const offset = content.indexOf("'./common.yaml'") + 2;

      const result = (await provide(document, offset)) as vscode.LocationLink[] | undefined;

      expect(result).toHaveLength(1);
      expect(result![0].targetRange.start.line).toBe(0);
      expect(result![0].targetRange.start.character).toBe(0);
    });

    it('returns nothing when the referenced file cannot be opened', async () => {
      const content = externalSpec('./missing.yaml#/Item');
      const document = makeDocument(content);
      openTextDocument.mockRejectedValue(new Error('ENOENT'));
      const offset = content.indexOf("'./missing.yaml#/Item'") + 2;

      expect(await provide(document, offset)).toBeUndefined();
    });

    it('returns nothing when the pointer is missing in the referenced file', async () => {
      const content = externalSpec('./common.yaml#/Missing');
      const document = makeDocument(content);
      openTextDocument.mockImplementation(async (uri: vscode.Uri) =>
        createFakeTextDocument({ content: COMMON_CONTENT, path: uri.path })
      );
      const offset = content.indexOf("'./common.yaml#/Missing'") + 2;

      expect(await provide(document, offset)).toBeUndefined();
    });

    it('returns nothing for scheme URLs', async () => {
      const content = externalSpec('https://example.com/x.yaml#/Item');
      const document = makeDocument(content);
      const offset = content.indexOf("'https://example.com") + 2;

      expect(await provide(document, offset)).toBeUndefined();
      expect(openTextDocument).not.toHaveBeenCalled();
    });

    it('returns nothing for untitled documents', async () => {
      const content = externalSpec('./common.yaml#/Item');
      const document = makeDocument(content);
      (document as { uri: unknown }).uri = {
        scheme: 'untitled',
        path: document.uri.path,
        fsPath: document.uri.fsPath,
        toString: () => `untitled:${document.uri.path}`,
      };
      const offset = content.indexOf("'./common.yaml#/Item'") + 2;

      expect(await provide(document, offset)).toBeUndefined();
      expect(openTextDocument).not.toHaveBeenCalled();
    });

    it('returns nothing when external resolution is disabled', async () => {
      const content = externalSpec('./common.yaml#/Item');
      const document = makeDocument(content);
      openTextDocument.mockImplementation(async (uri: vscode.Uri) =>
        createFakeTextDocument({ content: COMMON_CONTENT, path: uri.path })
      );
      const offset = content.indexOf("'./common.yaml#/Item'") + 2;

      expect(
        await provide(document, offset, { settings: { openApiExternalRefsEnabled: false } })
      ).toBeUndefined();
      expect(openTextDocument).not.toHaveBeenCalled();
    });
  });
});
