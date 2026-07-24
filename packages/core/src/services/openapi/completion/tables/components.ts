import type { NodeKindTable } from '../types';

/** Curated completion table for the Components Object's fixed sections. */

const componentsTable: NodeKindTable = {
  kind: 'Components',
  properties: [
    { name: 'schemas', docs: 'Reusable Schema Objects, keyed by name.', insertKind: 'object' },
    { name: 'responses', docs: 'Reusable Response Objects, keyed by name.', insertKind: 'object' },
    { name: 'parameters', docs: 'Reusable Parameter Objects, keyed by name.', insertKind: 'object' },
    { name: 'examples', docs: 'Reusable Example Objects, keyed by name.', insertKind: 'object' },
    { name: 'requestBodies', docs: 'Reusable Request Body Objects, keyed by name.', insertKind: 'object' },
    { name: 'headers', docs: 'Reusable Header Objects, keyed by name.', insertKind: 'object' },
    { name: 'securitySchemes', docs: 'Reusable Security Scheme Objects, keyed by name.', insertKind: 'object' },
    { name: 'links', docs: 'Reusable Link Objects, keyed by name.', insertKind: 'object' },
    { name: 'callbacks', docs: 'Reusable Callback Objects, keyed by name.', insertKind: 'object' },
    { name: 'pathItems', docs: 'Reusable Path Item Objects, keyed by name.', insertKind: 'object', sinceVersion: '3.1' },
    { name: 'mediaTypes', docs: 'Reusable Media Type Objects, keyed by name.', insertKind: 'object', sinceVersion: '3.2' },
  ],
};

export const componentsTables: NodeKindTable[] = [componentsTable];
