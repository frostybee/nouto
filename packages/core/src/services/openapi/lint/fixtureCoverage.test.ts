import { readFileSync } from 'fs';
import { join } from 'path';
import { analyzeOpenApi } from '../analyze';
import { ALL_LINT_RULES, LINT_RULES_CATALOG, runLintRules } from './registry';
import { validateExampleSites } from '../exampleValidation';
import { LINT_FIXABLE_CODES } from './quickFixes';

/**
 * The kitchen-sink fixtures under test-specs/openapi must trip every rule.
 * This keeps the fixtures honest as rules are added: a new rule that no
 * fixture exercises fails here until the fixture grows a violation for it.
 */
const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');
const FIXTURES = ['lint-violations.yaml', 'lint-violations-3.0.yaml'].map((name) =>
  readFileSync(join(REPO_ROOT, 'test-specs', 'openapi', name), 'utf8')
);
const DOCS = join(REPO_ROOT, 'packages', 'website', 'src', 'content', 'docs', 'openapi');

describe('lint fixture coverage', () => {
  const codes = new Set<string>();
  for (const text of FIXTURES) {
    for (const diagnostic of runLintRules(analyzeOpenApi(text, 'yaml'), { disabledRules: [] })) {
      codes.add(diagnostic.code!);
    }
  }

  it.each(ALL_LINT_RULES.filter((rule) => !rule.hostValidated).map((rule) => [rule.id]))(
    'fixture trips %s',
    (id) => {
      expect(codes.has(id)).toBe(true);
    }
  );

  it('fixtures parse and carry no syntax diagnostics', () => {
    for (const text of FIXTURES) {
      const analysis = analyzeOpenApi(text, 'yaml');
      expect(analysis.parsedSpec).toBeDefined();
      expect(analysis.diagnostics.filter((d) => d.source === 'syntax')).toEqual([]);
    }
  });

  it('host-validated example rules stay quiet on the fixtures (no examples declared)', () => {
    for (const text of FIXTURES) {
      expect(validateExampleSites(analyzeOpenApi(text, 'yaml'), { disabledRules: [] })).toEqual([]);
    }
  });

  describe('website docs stay in lock-step with the registry', () => {
    const linting = readFileSync(join(DOCS, 'linting.md'), 'utf8');
    const diagnostics = readFileSync(join(DOCS, 'diagnostics.md'), 'utf8');

    it.each(ALL_LINT_RULES.map((rule) => [rule.id]))('linting.md documents %s', (id) => {
      expect(linting.includes(`\`${id}\``)).toBe(true);
    });

    it.each([...LINT_FIXABLE_CODES].map((id) => [id]))('diagnostics.md documents the fix for %s', (id) => {
      expect(diagnostics.includes(`\`${id}\``) || diagnostics.includes(id)).toBe(true);
    });

    it('docs quote the current rule and quick-fix counts', () => {
      const features = readFileSync(join(DOCS, 'index.md'), 'utf8');
      const groups = new Set(LINT_RULES_CATALOG.map((entry) => entry.group)).size;
      const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
      expect(linting).toContain(`ships ${ALL_LINT_RULES.length} lint rules organized into ${words[groups]} groups`);
      expect(features).toContain(`${ALL_LINT_RULES.length} lint rules across ${words[groups]} groups`);
      expect(features).toContain(`${LINT_FIXABLE_CODES.size} of the lint rules`);
    });

    it('linting.md marks fixability consistently with LINT_FIXABLE_CODES', () => {
      const rows = linting.split(/\r?\n/).filter((line) => /^\| `[a-z0-9-]+` \|/.test(line));
      for (const row of rows) {
        const cells = row.split('|').map((cell) => cell.trim());
        const id = cells[1].replace(/`/g, '');
        const fix = cells[3];
        expect(`${id}:${fix}`).toBe(`${id}:${LINT_FIXABLE_CODES.has(id) ? 'Yes' : 'No'}`);
      }
    });
  });
});
