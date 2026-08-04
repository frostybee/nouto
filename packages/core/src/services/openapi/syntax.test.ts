import { buildSyntaxDiagnostics } from './syntax';

describe('buildSyntaxDiagnostics', () => {
  it('returns no diagnostics for empty or whitespace-only content', () => {
    expect(buildSyntaxDiagnostics('', 'yaml')).toEqual([]);
    expect(buildSyntaxDiagnostics('   \n', 'json')).toEqual([]);
  });

  it('returns no diagnostics for valid documents', () => {
    expect(buildSyntaxDiagnostics('openapi: 3.1.0\ninfo:\n  title: T\n', 'yaml')).toEqual([]);
    expect(buildSyntaxDiagnostics('{"openapi": "3.1.0"}', 'json')).toEqual([]);
  });

  it('reports YAML parse errors with offsets bracketing the error', () => {
    const content = 'info:\n  title: [unterminated\n';
    const diagnostics = buildSyntaxDiagnostics(content, 'yaml');
    expect(diagnostics.length).toBeGreaterThan(0);
    for (const diagnostic of diagnostics) {
      expect(diagnostic.source).toBe('syntax');
      expect(diagnostic.severity).toBe('error');
      expect(diagnostic.code).toBe('syntax');
      expect(diagnostic.pointer).toBeUndefined();
      const { from, to } = diagnostic.data as { from: number; to: number };
      expect(from).toBeGreaterThanOrEqual(0);
      expect(to).toBeGreaterThan(from - 1);
      expect(to).toBeLessThanOrEqual(content.length);
    }
    const flowStart = content.indexOf('[');
    expect(
      diagnostics.some((d) => (d.data as { from: number }).from >= flowStart - 1)
    ).toBe(true);
  });

  it('reports JSON parse errors with humanized messages and clamped offsets', () => {
    const content = '{"openapi": "3.1.0",}';
    // allowTrailingComma is on, so break it harder: an unclosed object.
    const broken = '{"openapi": "3.1.0"';
    const diagnostics = buildSyntaxDiagnostics(broken, 'json');
    expect(diagnostics.length).toBeGreaterThan(0);
    const { from, to } = diagnostics[0].data as { from: number; to: number };
    expect(from).toBeGreaterThanOrEqual(0);
    expect(to).toBeLessThanOrEqual(broken.length);
    // Message is humanized, not the raw enum name.
    expect(diagnostics[0].message).not.toMatch(/^[A-Z][a-z]+[A-Z]/);
    expect(diagnostics[0].message.length).toBeGreaterThan(0);
    // Trailing commas are tolerated (matches the analysis pipeline's parser).
    expect(buildSyntaxDiagnostics(content, 'json')).toEqual([]);
  });

  it('reports garbage after the JSON root value', () => {
    const diagnostics = buildSyntaxDiagnostics('{"a": 1} trailing', 'json');
    expect(diagnostics.length).toBeGreaterThan(0);
  });
});
