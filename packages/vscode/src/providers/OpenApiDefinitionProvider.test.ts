import * as vscode from 'vscode';
import { OpenApiDefinitionProvider } from './OpenApiDefinitionProvider';
import { createFakeTextDocument } from '../test/helpers/fakeTextDocument';
import { clearOpenApiDocumentState } from '../services/openapi';

const token = { isCancellationRequested: false } as vscode.CancellationToken;

function positionOfRefValue(content: string, ref: string): { content: string; offset: number } {
  const index = content.indexOf(ref);
  if (index < 0) throw new Error(`fixture does not contain ${ref}`);
  return { content, offset: index + 2 };
}

function provide(document: vscode.TextDocument, offset: number, cancel = false) {
  const provider = new OpenApiDefinitionProvider();
  return provider.provideDefinition(
    document,
    document.positionAt(offset),
    { isCancellationRequested: cancel } as vscode.CancellationToken
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

  it('resolves an internal $ref in YAML to the referenced node', () => {
    const document = makeDocument(YAML_SPEC);
    const { offset } = positionOfRefValue(YAML_SPEC, "'#/components/schemas/Pet'");

    const result = provide(document, offset) as vscode.Location | undefined;

    expect(result).toBeDefined();
    const targetOffset = document.offsetAt(result!.range.start);
    // The target range starts inside the Pet schema definition.
    expect(YAML_SPEC.slice(targetOffset).startsWith('type: object')).toBe(true);
  });

  it('resolves an internal $ref in JSON', () => {
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

    const result = provide(document, offset) as vscode.Location | undefined;

    expect(result).toBeDefined();
  });

  it('resolves references with escaped RFC 6901 segments', () => {
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

    expect(provide(document, offset)).toBeDefined();
  });

  it('resolves a reference that targets an array element', () => {
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

    expect(provide(document, offset)).toBeDefined();
  });

  it('resolves a root reference', () => {
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

    const result = provide(document, offset) as vscode.Location | undefined;
    expect(result).toBeDefined();
    expect(document.offsetAt(result!.range.start)).toBe(0);
  });

  it('navigates references that participate in a cycle', () => {
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

    expect(provide(document, offset)).toBeDefined();
  });

  it('returns nothing when the cursor is outside a $ref value', () => {
    const document = makeDocument(YAML_SPEC);
    const offset = YAML_SPEC.indexOf('title: Refs') + 2;

    expect(provide(document, offset)).toBeUndefined();
  });

  it('returns nothing for external references', () => {
    const content = YAML_SPEC.replace(
      "'#/components/schemas/Pet'",
      "'./other.yaml#/components/schemas/Pet'"
    );
    const document = makeDocument(content);
    const offset = content.indexOf("'./other.yaml#") + 2;

    expect(provide(document, offset)).toBeUndefined();
  });

  it('returns nothing for missing references', () => {
    const content = YAML_SPEC.replace(
      '#/components/schemas/Pet',
      '#/components/schemas/Missing'
    );
    const document = makeDocument(content);
    const offset = content.indexOf("'#/components/schemas/Missing'") + 2;

    expect(provide(document, offset)).toBeUndefined();
  });

  it('returns nothing for malformed pointers', () => {
    const content = YAML_SPEC.replace('#/components/schemas/Pet', '#components/schemas/Pet');
    const document = makeDocument(content);
    const offset = content.indexOf("'#components/schemas/Pet'") + 2;

    expect(provide(document, offset)).toBeUndefined();
  });

  it('returns nothing for non-OpenAPI documents', () => {
    const content = `title: not a spec
schema:
  $ref: '#/definitions/Thing'
definitions:
  Thing:
    type: object
`;
    const document = makeDocument(content);
    const offset = content.indexOf("'#/definitions/Thing'") + 2;

    expect(provide(document, offset)).toBeUndefined();
  });

  it('returns nothing for references with malformed percent-encoding', () => {
    const content = YAML_SPEC.replace('#/components/schemas/Pet', '#/components/%zz');
    const document = makeDocument(content);
    const offset = content.indexOf("'#/components/%zz'") + 2;

    expect(provide(document, offset)).toBeUndefined();
  });

  it('returns nothing when the $ref value is not a string', () => {
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

    expect(provide(document, offset)).toBeUndefined();
  });

  it('returns nothing when the document does not parse at all', () => {
    const document = makeDocument(YAML_SPEC);
    const { offset } = positionOfRefValue(YAML_SPEC, "'#/components/schemas/Pet'");
    expect(provide(document, offset)).toBeDefined();

    const broken = createFakeTextDocument({
      content: YAML_SPEC.replace('paths:', 'paths:\n  : : :'),
      languageId: 'yaml',
      path: document.uri.fsPath,
      version: 2,
    });
    expect(provide(broken, offset)).toBeUndefined();

    clearOpenApiDocumentState(document.uri);
  });

  it('returns nothing when cancellation is requested', () => {
    const document = makeDocument(YAML_SPEC);
    const { offset } = positionOfRefValue(YAML_SPEC, "'#/components/schemas/Pet'");

    expect(provide(document, offset, true)).toBeUndefined();
  });

  it('keeps resolving after the document stops parsing (sticky detection)', () => {
    const document = makeDocument(YAML_SPEC);
    const { offset } = positionOfRefValue(YAML_SPEC, "'#/components/schemas/Pet'");
    expect(provide(document, offset)).toBeDefined();

    // Same URI, but the version field is now unrecognizable.
    const broken = createFakeTextDocument({
      content: YAML_SPEC.replace('openapi: 3.1.0', 'openapi: nope'),
      languageId: 'yaml',
      path: document.uri.fsPath,
      version: 2,
    });

    // Detection is sticky, so the provider still runs; the ref still resolves.
    expect(provide(broken, offset)).toBeDefined();

    clearOpenApiDocumentState(document.uri);
  });
});
