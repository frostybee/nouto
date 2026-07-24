import type { NodeKindTable } from '../types';

/** Curated completion tables for the Server and Server Variable Objects. */

const serverTable: NodeKindTable = {
  kind: 'Server',
  properties: [
    { name: 'url', docs: 'A URL to the target host. Supports Server Variables in `{brackets}`.', insertKind: 'scalar', required: true },
    { name: 'name', docs: 'An optional unique string used to identify the server.', insertKind: 'scalar', sinceVersion: '3.2' },
    { name: 'description', docs: 'An optional description of the host designated by the URL. CommonMark syntax MAY be used.', insertKind: 'scalar' },
    { name: 'variables', docs: 'A map of variable names to Server Variable Objects for URL template substitution.', insertKind: 'object' },
  ],
};

const serverVariableTable: NodeKindTable = {
  kind: 'ServerVariable',
  properties: [
    { name: 'enum', docs: 'An enumeration of allowed string values for this variable. MUST NOT be empty.', insertKind: 'array' },
    { name: 'default', docs: 'The default value to use for substitution. Required.', insertKind: 'scalar', required: true },
    { name: 'description', docs: 'An optional description for the server variable. CommonMark syntax MAY be used.', insertKind: 'scalar' },
  ],
};

export const serverTables: NodeKindTable[] = [serverTable, serverVariableTable];
