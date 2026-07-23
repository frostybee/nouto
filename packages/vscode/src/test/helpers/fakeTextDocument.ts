import * as vscode from 'vscode';

export interface FakeTextDocumentOptions {
  content: string;
  languageId?: string;
  path?: string;
  version?: number;
}

export function createFakeTextDocument({
  content,
  languageId = 'yaml',
  path = '/spec.yaml',
  version = 1,
}: FakeTextDocumentOptions): vscode.TextDocument {
  const lineOffsets = [0];
  for (let index = 0; index < content.length; index++) {
    if (content.charCodeAt(index) === 13) {
      if (content.charCodeAt(index + 1) === 10) index++;
      lineOffsets.push(index + 1);
    } else if (content.charCodeAt(index) === 10) {
      lineOffsets.push(index + 1);
    }
  }

  const positionAt = (rawOffset: number): vscode.Position => {
    const offset = Math.min(Math.max(Math.floor(rawOffset), 0), content.length);
    let low = 0;
    let high = lineOffsets.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (lineOffsets[mid] > offset) high = mid;
      else low = mid + 1;
    }
    const line = Math.max(0, low - 1);
    return new vscode.Position(line, offset - lineOffsets[line]);
  };

  const offsetAt = (position: vscode.Position): number => {
    const line = Math.min(Math.max(position.line, 0), lineOffsets.length - 1);
    const start = lineOffsets[line];
    const next = line + 1 < lineOffsets.length ? lineOffsets[line + 1] : content.length;
    return Math.min(start + Math.max(position.character, 0), next);
  };

  const lineAt = (lineOrPosition: number | vscode.Position) => {
    const line = typeof lineOrPosition === 'number' ? lineOrPosition : lineOrPosition.line;
    const start = lineOffsets[line];
    const next = line + 1 < lineOffsets.length ? lineOffsets[line + 1] : content.length;
    const raw = content.slice(start, next);
    const text = raw.replace(/[\r\n]+$/, '');
    const end = start + text.length;
    return {
      lineNumber: line,
      text,
      range: new vscode.Range(positionAt(start), positionAt(end)),
      rangeIncludingLineBreak: new vscode.Range(positionAt(start), positionAt(next)),
      firstNonWhitespaceCharacterIndex: text.search(/\S|$/),
      isEmptyOrWhitespace: !text.trim(),
    };
  };

  return {
    uri: vscode.Uri.file(path),
    fileName: path,
    isUntitled: false,
    languageId,
    version,
    isDirty: false,
    isClosed: false,
    lineCount: lineOffsets.length,
    getText: (range?: vscode.Range) => range
      ? content.slice(offsetAt(range.start), offsetAt(range.end))
      : content,
    positionAt,
    offsetAt,
    lineAt,
    save: async () => true,
    getWordRangeAtPosition: () => undefined,
    validateRange: (range: vscode.Range) => range,
    validatePosition: (position: vscode.Position) => position,
    eol: content.includes('\r\n')
      ? (vscode.EndOfLine?.CRLF ?? 2)
      : (vscode.EndOfLine?.LF ?? 1),
  } as unknown as vscode.TextDocument;
}
