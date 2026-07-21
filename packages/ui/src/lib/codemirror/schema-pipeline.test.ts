import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { jsonSchemaLinter, stateExtensions } from 'codemirror-json-schema';
import {
  openapi30MetaSchema,
  openapi31MetaSchemaEditor,
  openapi32MetaSchemaEditor,
} from '@nouto/core/services/openapi/schemas';
import {
  buildJsonSchemaExtensions,
  buildJsonSyntaxExtensions,
  buildYamlSchemaExtensions,
  buildYamlSyntaxExtensions,
  resolveSchemaPipeline,
  templateAwareLinter,
} from './schema-pipeline';

describe('resolveSchemaPipeline', () => {
  it('maps language/lint/schema combinations to pipelines', () => {
    expect(resolveSchemaPipeline('json', false, true)).toBe('none');
    expect(resolveSchemaPipeline('json', true, false)).toBe('json-syntax');
    expect(resolveSchemaPipeline('json', true, true)).toBe('json-schema');
    expect(resolveSchemaPipeline('yaml', true, false)).toBe('yaml-syntax');
    expect(resolveSchemaPipeline('yaml', true, true)).toBe('yaml-schema');
    expect(resolveSchemaPipeline('xml', true, true)).toBe('none');
    expect(resolveSchemaPipeline('text', true, false)).toBe('none');
  });
});

describe('templateAwareLinter', () => {
  function fakeJsonView(doc: string): EditorView {
    return { state: EditorState.create({ doc, extensions: [json()] }) } as unknown as EditorView;
  }

  it('suppresses diagnostics when template expressions are present', () => {
    const lint = templateAwareLinter(jsonParseLinter, 'syntax');
    expect(lint(fakeJsonView('{"a": {{token}}}'))).toEqual([]);
  });

  it('stamps the source tag onto diagnostics', () => {
    const lint = templateAwareLinter(jsonParseLinter, 'syntax');
    const diagnostics = lint(fakeJsonView('{ not valid'));
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every((d) => d.source === 'syntax')).toBe(true);
  });

  it('passes valid documents through with no diagnostics', () => {
    const lint = templateAwareLinter(jsonParseLinter, 'syntax');
    expect(lint(fakeJsonView('{"a": 1}'))).toEqual([]);
  });
});

describe('extension builders', () => {
  it('json builders produce extensions usable in an EditorState', () => {
    expect(() =>
      EditorState.create({ doc: '{}', extensions: [json(), buildJsonSyntaxExtensions()] })
    ).not.toThrow();
    expect(() =>
      EditorState.create({ doc: '{}', extensions: [json(), buildJsonSchemaExtensions({})] })
    ).not.toThrow();
  });

  it('yaml builders resolve their dynamic imports and are usable', async () => {
    const syntaxExtensions = await buildYamlSyntaxExtensions();
    const schemaExtensions = await buildYamlSchemaExtensions({});
    const { yaml } = await import('@codemirror/lang-yaml');
    expect(() =>
      EditorState.create({ doc: 'a: 1', extensions: [yaml(), syntaxExtensions] })
    ).not.toThrow();
    expect(() =>
      EditorState.create({ doc: 'a: 1', extensions: [yaml(), schemaExtensions] })
    ).not.toThrow();
  });
});

describe('OpenAPI meta-schema behavior in the editor pipeline (documented reality)', () => {
  // Phase 0 verification result: the in-editor validator
  // (json-schema-library@9.3.5 via codemirror-json-schema, hardcoded to
  // draft-04 semantics) CANNOT meaningfully validate the official OpenAPI
  // meta-schemas:
  //
  // - 3.1 (even the pre-processed editor variant): the root schema keeps a
  //   `$ref` alongside `properties`/`required`, and under draft-04 semantics
  //   a `$ref` sibling swallows every other keyword — validation is inert
  //   and produces ZERO diagnostics even for clearly invalid documents.
  // - 3.0: json-schema-library throws at compile time ("Mutiple typeIds
  //   [not, oneOf]") on schema objects combining `not` and `oneOf`.
  //
  // Consequence (for Phase 1): in-editor 'schema'-source diagnostics must
  // come from host-side Ajv validation (core's validateOpenApiMetaSchema)
  // routed over the transport, per the feature plan's host-side-Ajv rule.
  // templateAwareLinter degrades a throwing/inert schema linter to zero
  // diagnostics so editing never breaks. These tests pin the observed
  // behavior so an upgrade that changes it is noticed.

  function schemaView(doc: string, schema: object): EditorView {
    return {
      state: EditorState.create({
        doc,
        extensions: [json(), stateExtensions(schema as any)],
      }),
    } as unknown as EditorView;
  }

  it.each([
    ['3.1', '3.1.0', openapi31MetaSchemaEditor],
    ['3.2', '3.2.0', openapi32MetaSchemaEditor],
  ])('%s editor variant runs without throwing but is inert (draft-04 $ref-sibling semantics)', (_v, versionString, editorSchema) => {
    const lint = templateAwareLinter(jsonSchemaLinter, 'schema');
    const valid = JSON.stringify({
      openapi: versionString,
      info: { title: 'T', version: '1' },
      paths: {},
    });
    const invalid = JSON.stringify({ openapi: 42, info: { title: 'T', version: '1' }, paths: {} });
    expect(lint(schemaView(valid, editorSchema))).toEqual([]);
    // Inert: no diagnostics even for an invalid document.
    expect(lint(schemaView(invalid, editorSchema))).toEqual([]);
  });

  it('3.0 schema crashes the underlying validator; the wrapper degrades to no diagnostics', () => {
    const doc = JSON.stringify({ openapi: '3.0.3', info: { title: 'T', version: '1' }, paths: {} });
    // Unwrapped: json-schema-library cannot compile the official 3.0 schema.
    expect(() => jsonSchemaLinter()(schemaView(doc, openapi30MetaSchema))).toThrow(
      /typeIds/
    );
    // Wrapped: degrades gracefully instead of breaking the editor.
    const lint = templateAwareLinter(jsonSchemaLinter, 'schema');
    expect(lint(schemaView(doc, openapi30MetaSchema))).toEqual([]);
  });

  it('a plain JSON Schema still validates through the pipeline (sanity check)', () => {
    const lint = templateAwareLinter(jsonSchemaLinter, 'schema');
    const schema = {
      type: 'object',
      properties: { count: { type: 'number' } },
    };
    expect(lint(schemaView('{"count": 1}', schema))).toEqual([]);
    const diagnostics = lint(schemaView('{"count": "nope"}', schema));
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every((d) => d.source === 'schema')).toBe(true);
  });
});
