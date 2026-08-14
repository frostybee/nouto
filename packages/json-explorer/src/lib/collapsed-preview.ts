function formatPreviewValue(value: any): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return '[…]';
  const t = typeof value;
  if (t === 'object') return '{…}';
  if (t === 'string') return `"${value}"`;
  return String(value);
}

function buildObjectPreview(value: Record<string, any>, maxLength: number, maxEntries: number): { text: string; truncated: boolean } {
  const keys = Object.keys(value);
  const parts: string[] = [];
  let truncated = false;
  for (let i = 0; i < keys.length; i++) {
    if (i >= maxEntries) { truncated = true; break; }
    const part = `"${keys[i]}": ${formatPreviewValue(value[keys[i]])}`;
    const candidate = parts.length ? `${parts.join(', ')}, ${part}` : part;
    if (candidate.length > maxLength) { truncated = true; break; }
    parts.push(part);
  }
  if (parts.length < keys.length) truncated = true;
  return { text: parts.join(', '), truncated };
}

function buildArrayPreview(value: any[], maxLength: number, maxEntries: number): { text: string; truncated: boolean } {
  const parts: string[] = [];
  let truncated = false;
  for (let i = 0; i < value.length; i++) {
    if (i >= maxEntries) { truncated = true; break; }
    const part = formatPreviewValue(value[i]);
    const candidate = parts.length ? `${parts.join(', ')}, ${part}` : part;
    if (candidate.length > maxLength) { truncated = true; break; }
    parts.push(part);
  }
  if (parts.length < value.length) truncated = true;
  return { text: parts.join(', '), truncated };
}

export function buildTooltipPreview(value: any, type: 'object' | 'array', maxEntries = 10, maxLength = 400): string {
  const result = type === 'array'
    ? buildArrayPreview(value as any[], maxLength, maxEntries)
    : buildObjectPreview(value as Record<string, any>, maxLength, maxEntries);
  return result.truncated ? `${result.text}, …` : result.text;
}
