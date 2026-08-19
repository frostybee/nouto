// Minimal JSONC support for VS Code theme files, which routinely carry
// // and /* */ comments and trailing commas that JSON.parse rejects.
// Two string-aware passes: comments first, then trailing commas — a comma
// separated from its closing brace only by a comment is trailing too, which
// a single combined pass would miss.
//
// Ported from the author's sarde-studio project (src/lib/theme/jsonc.js).

function scan(text: string, onOutside: (t: string, i: number) => number): string {
  // Walks text tracking string state; delegates non-string chars to
  // onOutside, which returns how many input chars it consumed (0 = emit char
  // as-is).
  let out = '';
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === '\\' && i + 1 < text.length) {
        out += text[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }
    const consumed = onOutside(text, i);
    if (consumed > 0) {
      i += consumed;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

export function stripJsonComments(text: string): string {
  const noComments = scan(text, (t, i) => {
    if (t[i] === '/' && t[i + 1] === '/') {
      let j = i;
      while (j < t.length && t[j] !== '\n') j += 1;
      return j - i;
    }
    if (t[i] === '/' && t[i + 1] === '*') {
      let j = i + 2;
      while (j < t.length && !(t[j] === '*' && t[j + 1] === '/')) j += 1;
      return Math.min(j + 2, t.length) - i;
    }
    return 0;
  });
  return scan(noComments, (t, i) => {
    if (t[i] === ',') {
      let j = i + 1;
      while (j < t.length && /\s/.test(t.charAt(j))) j += 1;
      if (t[j] === '}' || t[j] === ']') return 1;
    }
    return 0;
  });
}

export function parseJsonc(text: string): unknown {
  return JSON.parse(stripJsonComments(text));
}
