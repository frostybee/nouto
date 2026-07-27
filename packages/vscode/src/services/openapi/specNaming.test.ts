import { uniqueName, uniqueMemberKey } from './specNaming';
import { clearOpenApiDocumentState } from '.';
import { createFakeTextDocument } from '../../test/helpers/fakeTextDocument';
import type * as vscode from 'vscode';

describe('uniqueName', () => {
  it('returns the base when free', () => {
    expect(uniqueName(['a', 'b'], 'c')).toBe('c');
  });

  it('suffixes from -2 upward until free', () => {
    expect(uniqueName(['c'], 'c')).toBe('c-2');
    expect(uniqueName(['c', 'c-2', 'c-3'], 'c')).toBe('c-4');
  });

  it('accepts a Set without copying semantics changing', () => {
    expect(uniqueName(new Set(['c']), 'c')).toBe('c-2');
  });
});

describe('uniqueMemberKey', () => {
  const uris: vscode.Uri[] = [];

  function specDocument(content: string): vscode.TextDocument {
    const document = createFakeTextDocument({ content, path: '/naming.yaml' });
    uris.push(document.uri);
    return document;
  }

  afterEach(() => {
    for (const uri of uris) clearOpenApiDocumentState(uri);
    uris.length = 0;
  });

  it('checks membership against the parsed spec', () => {
    const document = specDocument(`openapi: 3.1.0
info:
  title: T
  version: 1.0.0
paths: {}
components:
  schemas:
    NewSchema:
      type: object
    NewSchema-2:
      type: object
`);
    expect(uniqueMemberKey(document, '/components/schemas', 'NewSchema')).toBe('NewSchema-3');
    expect(uniqueMemberKey(document, '/components/schemas', 'Fresh')).toBe('Fresh');
  });

  it('treats a missing parent as having no members', () => {
    const document = specDocument(`openapi: 3.1.0
info:
  title: T
  version: 1.0.0
paths: {}
`);
    expect(uniqueMemberKey(document, '/components/schemas', 'NewSchema')).toBe('NewSchema');
  });
});
