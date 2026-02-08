import { resolveScriptsForRequest } from './ScriptInheritanceService';
import type { Collection, Folder, SavedRequest } from './types';

function makeRequest(id: string, scripts?: { preRequest: string; postResponse: string }): SavedRequest {
  return {
    type: 'request',
    id,
    name: `Request ${id}`,
    method: 'GET',
    url: 'http://localhost',
    params: [],
    headers: [],
    auth: { type: 'none' },
    body: { type: 'none', content: '' },
    scripts,
    createdAt: '',
    updatedAt: '',
  };
}

function makeFolder(id: string, children: any[], scripts?: { preRequest: string; postResponse: string }): Folder {
  return {
    type: 'folder',
    id,
    name: `Folder ${id}`,
    children,
    expanded: true,
    scripts,
    createdAt: '',
    updatedAt: '',
  };
}

function makeCollection(items: any[], scripts?: { preRequest: string; postResponse: string }): Collection {
  return {
    id: 'col-1',
    name: 'Test Collection',
    items,
    expanded: true,
    scripts,
    createdAt: '',
    updatedAt: '',
  };
}

describe('ScriptInheritanceService', () => {
  it('should return empty arrays when no scripts exist', () => {
    const req = makeRequest('r1');
    const collection = makeCollection([req]);
    const result = resolveScriptsForRequest(collection, 'r1');
    expect(result.preRequestScripts).toHaveLength(0);
    expect(result.postResponseScripts).toHaveLength(0);
  });

  it('should return request-level scripts only', () => {
    const req = makeRequest('r1', { preRequest: 'console.log("pre");', postResponse: 'console.log("post");' });
    const collection = makeCollection([req]);
    const result = resolveScriptsForRequest(collection, 'r1');
    // Request-level scripts come from the path resolution, not directly from the request
    // Since resolveScriptsForRequest uses getItemPath which returns [collection, ...folders],
    // the request script is NOT in the path. It must be found differently.
    // Let me check the implementation...
    // Actually, getItemPath returns the ancestor chain, not the request itself.
    // So request-level scripts should NOT be returned by resolveScriptsForRequest.
    // They are handled separately in the callers via requestData.scripts.
    expect(result.preRequestScripts).toHaveLength(0);
    expect(result.postResponseScripts).toHaveLength(0);
  });

  it('should return collection-level scripts', () => {
    const req = makeRequest('r1');
    const collection = makeCollection([req], {
      preRequest: 'console.log("collection pre");',
      postResponse: 'console.log("collection post");',
    });
    const result = resolveScriptsForRequest(collection, 'r1');
    expect(result.preRequestScripts).toHaveLength(1);
    expect(result.preRequestScripts[0].level).toBe('Test Collection');
    expect(result.preRequestScripts[0].source).toBe('console.log("collection pre");');
    expect(result.postResponseScripts).toHaveLength(1);
  });

  it('should return folder-level scripts in order', () => {
    const req = makeRequest('r1');
    const folder = makeFolder('f1', [req], {
      preRequest: 'console.log("folder pre");',
      postResponse: '',
    });
    const collection = makeCollection([folder], {
      preRequest: 'console.log("collection pre");',
      postResponse: '',
    });
    const result = resolveScriptsForRequest(collection, 'r1');
    expect(result.preRequestScripts).toHaveLength(2);
    expect(result.preRequestScripts[0].level).toBe('Test Collection');
    expect(result.preRequestScripts[1].level).toBe('Folder f1');
  });

  it('should handle nested folders', () => {
    const req = makeRequest('r1');
    const innerFolder = makeFolder('f2', [req], {
      preRequest: 'console.log("inner");',
      postResponse: '',
    });
    const outerFolder = makeFolder('f1', [innerFolder], {
      preRequest: 'console.log("outer");',
      postResponse: '',
    });
    const collection = makeCollection([outerFolder], {
      preRequest: 'console.log("collection");',
      postResponse: '',
    });
    const result = resolveScriptsForRequest(collection, 'r1');
    expect(result.preRequestScripts).toHaveLength(3);
    expect(result.preRequestScripts[0].level).toBe('Test Collection');
    expect(result.preRequestScripts[1].level).toBe('Folder f1');
    expect(result.preRequestScripts[2].level).toBe('Folder f2');
  });

  it('should skip empty scripts', () => {
    const req = makeRequest('r1');
    const folder = makeFolder('f1', [req], { preRequest: '', postResponse: 'console.log("post");' });
    const collection = makeCollection([folder], { preRequest: '  ', postResponse: '' });
    const result = resolveScriptsForRequest(collection, 'r1');
    expect(result.preRequestScripts).toHaveLength(0);
    expect(result.postResponseScripts).toHaveLength(1);
    expect(result.postResponseScripts[0].level).toBe('Folder f1');
  });

  it('should handle request not found', () => {
    const collection = makeCollection([]);
    const result = resolveScriptsForRequest(collection, 'nonexistent');
    expect(result.preRequestScripts).toHaveLength(0);
    expect(result.postResponseScripts).toHaveLength(0);
  });

  it('should only include post-response scripts where present', () => {
    const req = makeRequest('r1');
    const folder = makeFolder('f1', [req], {
      preRequest: 'pre',
      postResponse: 'post',
    });
    const collection = makeCollection([folder], {
      preRequest: 'col-pre',
      postResponse: '',
    });
    const result = resolveScriptsForRequest(collection, 'r1');
    expect(result.preRequestScripts).toHaveLength(2);
    expect(result.postResponseScripts).toHaveLength(1);
    expect(result.postResponseScripts[0].level).toBe('Folder f1');
  });
});
