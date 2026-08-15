import { getByPointer, internalRefToPointer } from '../../pointer';
import type { LintFinding, LintRule } from '../types';
import { componentEntries, isRecord, mergedParameters, operationViews, rootTags, specOf } from '../context';
import { walkMediaTypes, walkSchemas } from '../schemaWalk';

/**
 * OpenAPI 3.2 structures: `in: querystring` parameters, hierarchical tags,
 * discriminator `defaultMapping`, and sequential media type encodings. Each
 * rule keys off the presence of the 3.2 construct rather than the declared
 * version, so a 3.1 document that already uses them is checked too.
 */

const querystringParameterConflict: LintRule = {
  id: 'querystring-parameter-conflict',
  description: 'An in: querystring parameter must be the only one on its operation and cannot coexist with in: query parameters.',
  defaultSeverity: 'error',
  run(analysis) {
    const findings: LintFinding[] = [];
    for (const view of operationViews(analysis)) {
      const params = mergedParameters(view, analysis);
      const querystring = params.filter((param) => param.in === 'querystring');
      if (querystring.length === 0) continue;
      const label = `${view.summary.method.toUpperCase()} ${view.summary.path}`;
      querystring.slice(1).forEach((param) => {
        findings.push({
          message: `${label} declares more than one in: querystring parameter ("${param.name}"); only one is allowed.`,
          pointer: param.pointer,
          anchor: true,
        });
      });
      const query = params.filter((param) => param.in === 'query');
      if (query.length > 0) {
        findings.push({
          message: `${label} mixes an in: querystring parameter ("${querystring[0].name}") with in: query parameters (${query.map((p) => p.name).join(', ')}); use one or the other.`,
          pointer: querystring[0].pointer,
          anchor: true,
        });
      }
    }
    return findings;
  },
};

const tagParentInvalid: LintRule = {
  id: 'tag-parent-invalid',
  description: 'A tag parent must name another root tag and must not form a cycle.',
  defaultSeverity: 'error',
  run(analysis) {
    const spec = specOf(analysis);
    if (!spec) return [];
    const tags = rootTags(spec);
    const byName = new Map(tags.map((tag) => [tag.name, tag]));
    const findings: LintFinding[] = [];
    for (const tag of tags) {
      const parent = tag.object.parent;
      if (parent === undefined) continue;
      if (typeof parent !== 'string' || !byName.has(parent)) {
        findings.push({
          message: `Tag "${tag.name}" has parent "${String(parent)}", which is not a declared root tag.`,
          pointer: `${tag.pointer}/parent`,
        });
        continue;
      }
      // Follow the parent chain; revisiting this tag means a cycle.
      const visited = new Set<string>([tag.name]);
      let current: string | undefined = parent;
      while (current !== undefined) {
        if (visited.has(current)) {
          findings.push({ message: `Tag "${tag.name}" is part of a parent cycle.`, pointer: `${tag.pointer}/parent` });
          break;
        }
        visited.add(current);
        const next: unknown = byName.get(current)?.object.parent;
        current = typeof next === 'string' ? next : undefined;
      }
    }
    return findings;
  },
};

const discriminatorDefaultMappingInvalid: LintRule = {
  id: 'discriminator-default-mapping-invalid',
  description: 'discriminator.defaultMapping must name a component schema or resolve as an internal reference.',
  defaultSeverity: 'error',
  run(analysis) {
    const spec = specOf(analysis);
    if (!spec) return [];
    const schemaNames = new Set(componentEntries(spec, 'schemas').map((entry) => entry.name));
    const findings: LintFinding[] = [];
    for (const { schema, pointer } of walkSchemas(analysis)) {
      const discriminator = schema.discriminator;
      if (!isRecord(discriminator) || discriminator.defaultMapping === undefined) continue;
      const target = discriminator.defaultMapping;
      const targetPointer = `${pointer}/discriminator/defaultMapping`;
      if (typeof target !== 'string' || !target) {
        findings.push({ message: 'discriminator.defaultMapping must be a non-empty string.', pointer: targetPointer });
        continue;
      }
      if (target.startsWith('#')) {
        const resolved = internalRefToPointer(target);
        if (resolved === undefined || !getByPointer(spec, resolved).found) {
          findings.push({ message: `discriminator.defaultMapping "${target}" does not resolve.`, pointer: targetPointer });
        }
        continue;
      }
      // A relative/absolute URI to another document cannot be checked here.
      if (/[/.:]/.test(target)) continue;
      if (!schemaNames.has(target)) {
        findings.push({
          message: `discriminator.defaultMapping "${target}" is not a schema under components.schemas.`,
          pointer: targetPointer,
        });
      }
    }
    return findings;
  },
};

const mediaTypeEncodingConflict: LintRule = {
  id: 'media-type-encoding-conflict',
  description: 'A Media Type Object may use only one of encoding, prefixEncoding, itemEncoding, and the sequential ones need itemSchema.',
  defaultSeverity: 'error',
  run(analysis) {
    const findings: LintFinding[] = [];
    for (const { mediaType, pointer } of walkMediaTypes(analysis)) {
      const present = ['encoding', 'prefixEncoding', 'itemEncoding'].filter((key) => mediaType[key] !== undefined);
      if (present.length > 1) {
        findings.push({
          message: `Media type declares ${present.join(' and ')}; only one encoding form is allowed.`,
          pointer: `${pointer}/${present[1]}`,
          anchor: true,
        });
      }
      for (const key of ['prefixEncoding', 'itemEncoding']) {
        if (mediaType[key] !== undefined && mediaType.itemSchema === undefined) {
          findings.push({
            message: `"${key}" applies to sequential media types and requires "itemSchema".`,
            pointer: `${pointer}/${key}`,
            anchor: true,
          });
        }
      }
    }
    return findings;
  },
};

export const oas32Rules: LintRule[] = [
  querystringParameterConflict,
  tagParentInvalid,
  discriminatorDefaultMappingInvalid,
  mediaTypeEncodingConflict,
];
