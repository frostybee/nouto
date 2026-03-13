import { resolveAssertionsForRequest } from './AssertionInheritanceService';
import type { Collection, Assertion } from '../types';

function makeAssertion(id: string, target: Assertion['target'] = 'status', operator: Assertion['operator'] = 'equals'): Assertion {
  return { id, enabled: true, target, operator, expected: '200' };
}

describe('AssertionInheritanceService', () => {
  it('should return request-level assertions when no ancestors have assertions', () => {
    const collection: Collection = {
      id: 'col1', name: 'Col', items: [
        { type: 'request' as const, id: 'r1', name: 'R1', method: 'GET', url: '', params: [], headers: [], auth: { type: 'none' }, body: { type: 'none', content: '' }, createdAt: '', updatedAt: '', assertions: [makeAssertion('a1')] },
      ],
      expanded: true, createdAt: '', updatedAt: '',
    };
    const result = resolveAssertionsForRequest(collection, 'r1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a1');
  });

  it('should merge collection-level and request-level assertions', () => {
    const collection: Collection = {
      id: 'col1', name: 'Col', items: [
        { type: 'request' as const, id: 'r1', name: 'R1', method: 'GET', url: '', params: [], headers: [], auth: { type: 'none' }, body: { type: 'none', content: '' }, createdAt: '', updatedAt: '', assertions: [makeAssertion('a2')] },
      ],
      expanded: true, createdAt: '', updatedAt: '',
      assertions: [makeAssertion('a1')],
    };
    const result = resolveAssertionsForRequest(collection, 'r1');
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('a1');
    expect(result[1].id).toBe('a2');
  });

  it('should merge collection -> folder -> request assertions in order', () => {
    const collection: Collection = {
      id: 'col1', name: 'Col', items: [
        {
          type: 'folder' as const, id: 'f1', name: 'Folder', children: [
            { type: 'request' as const, id: 'r1', name: 'R1', method: 'GET', url: '', params: [], headers: [], auth: { type: 'none' }, body: { type: 'none', content: '' }, createdAt: '', updatedAt: '', assertions: [makeAssertion('a3')] },
          ],
          expanded: true, createdAt: '', updatedAt: '',
          assertions: [makeAssertion('a2')],
        },
      ],
      expanded: true, createdAt: '', updatedAt: '',
      assertions: [makeAssertion('a1')],
    };
    const result = resolveAssertionsForRequest(collection, 'r1');
    expect(result).toHaveLength(3);
    expect(result.map(a => a.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('should deduplicate by ID (deepest wins)', () => {
    const collection: Collection = {
      id: 'col1', name: 'Col', items: [
        { type: 'request' as const, id: 'r1', name: 'R1', method: 'GET', url: '', params: [], headers: [], auth: { type: 'none' }, body: { type: 'none', content: '' }, createdAt: '', updatedAt: '', assertions: [makeAssertion('shared', 'body', 'contains')] },
      ],
      expanded: true, createdAt: '', updatedAt: '',
      assertions: [makeAssertion('shared', 'status', 'equals')],
    };
    const result = resolveAssertionsForRequest(collection, 'r1');
    expect(result).toHaveLength(1);
    // Request-level "shared" should win (last occurrence)
    expect(result[0].target).toBe('body');
  });

  it('should return empty array when no assertions exist', () => {
    const collection: Collection = {
      id: 'col1', name: 'Col', items: [
        { type: 'request' as const, id: 'r1', name: 'R1', method: 'GET', url: '', params: [], headers: [], auth: { type: 'none' }, body: { type: 'none', content: '' }, createdAt: '', updatedAt: '' },
      ],
      expanded: true, createdAt: '', updatedAt: '',
    };
    const result = resolveAssertionsForRequest(collection, 'r1');
    expect(result).toHaveLength(0);
  });

  it('should return collection assertions when request has none', () => {
    const collection: Collection = {
      id: 'col1', name: 'Col', items: [
        { type: 'request' as const, id: 'r1', name: 'R1', method: 'GET', url: '', params: [], headers: [], auth: { type: 'none' }, body: { type: 'none', content: '' }, createdAt: '', updatedAt: '' },
      ],
      expanded: true, createdAt: '', updatedAt: '',
      assertions: [makeAssertion('a1'), makeAssertion('a2')],
    };
    const result = resolveAssertionsForRequest(collection, 'r1');
    expect(result).toHaveLength(2);
  });
});
