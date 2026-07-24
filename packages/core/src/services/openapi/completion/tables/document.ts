import type { NodeKindTable } from '../types';

/**
 * Curated completion tables for the top-level document objects: the OpenAPI
 * Object (Root), Info, Contact, License, Tag, and External Documentation.
 *
 * Authored from the OpenAPI Specification's Fixed Fields tables per version —
 * NOT derived from the vendored JSON meta-schemas (see the note atop
 * tables/schema.ts).
 */

const rootTable: NodeKindTable = {
  kind: 'Root',
  properties: [
    { name: 'openapi', docs: 'The version number of the OpenAPI Specification this document uses, e.g. `3.1.0`.', insertKind: 'scalar', required: true },
    { name: '$self', docs: 'The URI that identifies this OpenAPI document.', insertKind: 'scalar', sinceVersion: '3.2' },
    { name: 'info', docs: 'Metadata about the API (title, version, description, …). Required.', insertKind: 'object', required: true },
    { name: 'jsonSchemaDialect', docs: 'Default value for the `$schema` keyword within Schema Objects in this document.', insertKind: 'scalar', sinceVersion: '3.1' },
    { name: 'servers', docs: 'Connectivity information to target servers. Defaults to a single server with url `/`.', insertKind: 'array' },
    { name: 'paths', docs: 'The available paths and operations for the API.', insertKind: 'object' },
    { name: 'webhooks', docs: 'Incoming webhooks that MAY be received as part of this API. A map of Path Item Objects.', insertKind: 'object', sinceVersion: '3.1' },
    { name: 'components', docs: 'Reusable objects (schemas, responses, parameters, …) referenced across the document.', insertKind: 'object' },
    { name: 'security', docs: 'A declaration of which security mechanisms can be used across the API.', insertKind: 'array' },
    { name: 'tags', docs: 'A list of tags used by the document with additional metadata.', insertKind: 'array' },
    { name: 'externalDocs', docs: 'Additional external documentation.', insertKind: 'object' },
  ],
};

const infoTable: NodeKindTable = {
  kind: 'Info',
  properties: [
    { name: 'title', docs: 'The title of the API.', insertKind: 'scalar', required: true },
    { name: 'summary', docs: 'A short summary of the API.', insertKind: 'scalar', sinceVersion: '3.1' },
    { name: 'description', docs: 'A description of the API. CommonMark syntax MAY be used.', insertKind: 'scalar' },
    { name: 'termsOfService', docs: 'A URI for the Terms of Service for the API.', insertKind: 'scalar' },
    { name: 'contact', docs: 'The contact information for the exposed API.', insertKind: 'object' },
    { name: 'license', docs: 'The license information for the exposed API.', insertKind: 'object' },
    { name: 'version', docs: 'The version of this API document (distinct from the OpenAPI version).', insertKind: 'scalar', required: true },
  ],
};

const contactTable: NodeKindTable = {
  kind: 'Contact',
  properties: [
    { name: 'name', docs: 'The identifying name of the contact person/organization.', insertKind: 'scalar' },
    { name: 'url', docs: 'The URI pointing to the contact information.', insertKind: 'scalar' },
    { name: 'email', docs: 'The email address of the contact person/organization.', insertKind: 'scalar' },
  ],
};

const licenseTable: NodeKindTable = {
  kind: 'License',
  properties: [
    { name: 'name', docs: 'The license name used for the API.', insertKind: 'scalar', required: true },
    { name: 'identifier', docs: 'An SPDX license expression for the API. Mutually exclusive with `url`.', insertKind: 'scalar', sinceVersion: '3.1' },
    { name: 'url', docs: 'A URI for the license used for the API. Mutually exclusive with `identifier`.', insertKind: 'scalar' },
  ],
};

const tagTable: NodeKindTable = {
  kind: 'Tag',
  properties: [
    { name: 'name', docs: 'The name of the tag.', insertKind: 'scalar', required: true },
    { name: 'summary', docs: 'A short summary of the tag.', insertKind: 'scalar', sinceVersion: '3.2' },
    { name: 'description', docs: 'A description for the tag. CommonMark syntax MAY be used.', insertKind: 'scalar' },
    { name: 'externalDocs', docs: 'Additional external documentation for this tag.', insertKind: 'object' },
    { name: 'parent', docs: 'The name of a parent tag, forming a tag hierarchy.', insertKind: 'scalar', sinceVersion: '3.2' },
    { name: 'kind', docs: 'A machine-readable classification of the tag (e.g. `nav`, `badge`, `audience`).', insertKind: 'scalar', sinceVersion: '3.2' },
  ],
};

const externalDocsTable: NodeKindTable = {
  kind: 'ExternalDocs',
  properties: [
    { name: 'description', docs: 'A description of the target documentation. CommonMark syntax MAY be used.', insertKind: 'scalar' },
    { name: 'url', docs: 'The URI for the target documentation.', insertKind: 'scalar', required: true },
  ],
};

export const documentTables: NodeKindTable[] = [
  rootTable,
  infoTable,
  contactTable,
  licenseTable,
  tagTable,
  externalDocsTable,
];
