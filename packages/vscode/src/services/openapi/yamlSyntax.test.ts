import { buildYamlSyntaxDiagnostics } from './yamlSyntax';
import { createFakeTextDocument } from '../../test/helpers/fakeTextDocument';

describe('YAML syntax diagnostics', () => {
  it('returns a host syntax diagnostic with a clamped range', () => {
    const document = createFakeTextDocument({ content: 'value: [broken\n' });
    const diagnostics = buildYamlSyntaxDiagnostics(document.getText(), document);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]).toMatchObject({
      source: 'nouto-openapi',
      code: 'syntax',
      severity: 0,
    });
    expect(document.offsetAt(diagnostics[0].range.end)).toBeLessThanOrEqual(document.getText().length);
  });

  it('surfaces a multi-document stream as a syntax diagnostic', () => {
    const document = createFakeTextDocument({ content: 'a: 1\n---\nb: 2\n' });
    const diagnostics = buildYamlSyntaxDiagnostics(document.getText(), document);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]).toMatchObject({ source: 'nouto-openapi', code: 'syntax' });
    expect(diagnostics.some((d) => /multiple documents/i.test(d.message))).toBe(true);
  });

  it('surfaces duplicate mapping keys as a syntax diagnostic', () => {
    const document = createFakeTextDocument({ content: 'a: 1\na: 2\n' });
    const diagnostics = buildYamlSyntaxDiagnostics(document.getText(), document);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.some((d) => /unique/i.test(d.message))).toBe(true);
  });

  it('does not report empty or valid YAML', () => {
    const empty = createFakeTextDocument({ content: '  \n' });
    expect(buildYamlSyntaxDiagnostics(empty.getText(), empty)).toEqual([]);
    const valid = createFakeTextDocument({ content: 'value: ok\n' });
    expect(buildYamlSyntaxDiagnostics(valid.getText(), valid)).toEqual([]);
  });
});
