/**
 * Simple query language for filtering JSON nodes.
 *
 * Syntax:
 *   field = "value"        -- equality
 *   field != "value"       -- inequality
 *   field > 10             -- greater than
 *   field < 10             -- less than
 *   field >= 10            -- greater than or equal
 *   field <= 10            -- less than or equal
 *   field ~ "pattern"      -- regex match
 *   field contains "text"  -- substring match
 *   field startsWith "x"   -- starts with
 *   field endsWith "x"     -- ends with
 *   expr AND expr          -- logical AND
 *   expr OR expr           -- logical OR
 *   NOT expr               -- logical NOT
 *   (expr)                 -- grouping
 *
 * Field paths support dot notation: address.city, items[0].name
 */

// ---- Token Types ----

type TokenType =
  | 'FIELD' | 'STRING' | 'NUMBER' | 'BOOLEAN' | 'NULL'
  | 'OP_EQ' | 'OP_NEQ' | 'OP_GT' | 'OP_LT' | 'OP_GTE' | 'OP_LTE' | 'OP_REGEX'
  | 'OP_CONTAINS' | 'OP_STARTS_WITH' | 'OP_ENDS_WITH'
  | 'AND' | 'OR' | 'NOT'
  | 'LPAREN' | 'RPAREN'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string;
}

// ---- Lexer ----

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    // Skip whitespace
    if (/\s/.test(input[i])) { i++; continue; }

    // String literals
    if (input[i] === '"') {
      let str = '';
      i++; // skip opening quote
      while (i < input.length && input[i] !== '"') {
        if (input[i] === '\\' && i + 1 < input.length) {
          str += input[i + 1];
          i += 2;
        } else {
          str += input[i];
          i++;
        }
      }
      i++; // skip closing quote
      tokens.push({ type: 'STRING', value: str });
      continue;
    }

    // Operators
    if (input.slice(i, i + 2) === '!=') { tokens.push({ type: 'OP_NEQ', value: '!=' }); i += 2; continue; }
    if (input.slice(i, i + 2) === '>=') { tokens.push({ type: 'OP_GTE', value: '>=' }); i += 2; continue; }
    if (input.slice(i, i + 2) === '<=') { tokens.push({ type: 'OP_LTE', value: '<=' }); i += 2; continue; }
    if (input[i] === '=') { tokens.push({ type: 'OP_EQ', value: '=' }); i++; continue; }
    if (input[i] === '>') { tokens.push({ type: 'OP_GT', value: '>' }); i++; continue; }
    if (input[i] === '<') { tokens.push({ type: 'OP_LT', value: '<' }); i++; continue; }
    if (input[i] === '~') { tokens.push({ type: 'OP_REGEX', value: '~' }); i++; continue; }
    if (input[i] === '(') { tokens.push({ type: 'LPAREN', value: '(' }); i++; continue; }
    if (input[i] === ')') { tokens.push({ type: 'RPAREN', value: ')' }); i++; continue; }

    // Numbers
    if (/[\d.-]/.test(input[i]) && (i === 0 || /[\s(=!><~]/.test(input[i - 1]))) {
      let num = '';
      while (i < input.length && /[\d.eE+-]/.test(input[i])) {
        num += input[i]; i++;
      }
      if (!isNaN(Number(num))) {
        tokens.push({ type: 'NUMBER', value: num });
        continue;
      }
      // Fall through to FIELD if not a valid number
      i -= num.length;
    }

    // Keywords / field names
    let word = '';
    while (i < input.length && /[a-zA-Z0-9_.$\[\]*]/.test(input[i])) {
      word += input[i]; i++;
    }

    if (word) {
      const upper = word.toUpperCase();
      if (upper === 'AND') { tokens.push({ type: 'AND', value: word }); continue; }
      if (upper === 'OR') { tokens.push({ type: 'OR', value: word }); continue; }
      if (upper === 'NOT') { tokens.push({ type: 'NOT', value: word }); continue; }
      if (upper === 'TRUE' || upper === 'FALSE') { tokens.push({ type: 'BOOLEAN', value: upper === 'TRUE' ? 'true' : 'false' }); continue; }
      if (upper === 'NULL') { tokens.push({ type: 'NULL', value: 'null' }); continue; }
      if (upper === 'CONTAINS') { tokens.push({ type: 'OP_CONTAINS', value: 'contains' }); continue; }
      if (upper === 'STARTSWITH') { tokens.push({ type: 'OP_STARTS_WITH', value: 'startsWith' }); continue; }
      if (upper === 'ENDSWITH') { tokens.push({ type: 'OP_ENDS_WITH', value: 'endsWith' }); continue; }
      tokens.push({ type: 'FIELD', value: word });
      continue;
    }

    // Unknown character, skip
    i++;
  }

  tokens.push({ type: 'EOF', value: '' });
  return tokens;
}

// ---- AST ----

export type QueryExpr =
  | { type: 'comparison'; field: string; op: string; value: any }
  | { type: 'and'; left: QueryExpr; right: QueryExpr }
  | { type: 'or'; left: QueryExpr; right: QueryExpr }
  | { type: 'not'; expr: QueryExpr };

// ---- Parser (recursive descent) ----

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  parse(): QueryExpr {
    const expr = this.parseOr();
    if (this.peek().type !== 'EOF') {
      throw new Error(`Unexpected token: ${this.peek().value}`);
    }
    return expr;
  }

  private parseOr(): QueryExpr {
    let left = this.parseAnd();
    while (this.peek().type === 'OR') {
      this.advance();
      const right = this.parseAnd();
      left = { type: 'or', left, right };
    }
    return left;
  }

  private parseAnd(): QueryExpr {
    let left = this.parseNot();
    while (this.peek().type === 'AND') {
      this.advance();
      const right = this.parseNot();
      left = { type: 'and', left, right };
    }
    return left;
  }

  private parseNot(): QueryExpr {
    if (this.peek().type === 'NOT') {
      this.advance();
      const expr = this.parseNot();
      return { type: 'not', expr };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): QueryExpr {
    if (this.peek().type === 'LPAREN') {
      this.advance();
      const expr = this.parseOr();
      this.expect('RPAREN');
      return expr;
    }
    return this.parseComparison();
  }

  private parseComparison(): QueryExpr {
    const fieldToken = this.expect('FIELD');
    const opToken = this.advance();
    const op = opToken.type;

    let value: any;
    const valueToken = this.advance();
    if (valueToken.type === 'STRING') value = valueToken.value;
    else if (valueToken.type === 'NUMBER') value = Number(valueToken.value);
    else if (valueToken.type === 'BOOLEAN') value = valueToken.value === 'true';
    else if (valueToken.type === 'NULL') value = null;
    else throw new Error(`Expected value, got: ${valueToken.value}`);

    const opMap: Record<string, string> = {
      'OP_EQ': '=', 'OP_NEQ': '!=', 'OP_GT': '>', 'OP_LT': '<',
      'OP_GTE': '>=', 'OP_LTE': '<=', 'OP_REGEX': '~',
      'OP_CONTAINS': 'contains', 'OP_STARTS_WITH': 'startsWith', 'OP_ENDS_WITH': 'endsWith',
    };

    if (!(op in opMap)) {
      throw new Error(`Expected operator, got: ${opToken.value}`);
    }

    return { type: 'comparison', field: fieldToken.value, op: opMap[op], value };
  }

  private peek(): Token {
    return this.tokens[this.pos] || { type: 'EOF', value: '' };
  }

  private advance(): Token {
    return this.tokens[this.pos++] || { type: 'EOF', value: '' };
  }

  private expect(type: TokenType): Token {
    const token = this.advance();
    if (token.type !== type) {
      throw new Error(`Expected ${type}, got ${token.type} (${token.value})`);
    }
    return token;
  }
}

// ---- Public API ----

export function parseQuery(input: string): QueryExpr {
  const tokens = tokenize(input);
  return new Parser(tokens).parse();
}

/**
 * Evaluate a query expression against a JSON object.
 * Returns true if the object matches the query.
 */
export function evaluateQuery(expr: QueryExpr, obj: any): boolean {
  switch (expr.type) {
    case 'and': return evaluateQuery(expr.left, obj) && evaluateQuery(expr.right, obj);
    case 'or': return evaluateQuery(expr.left, obj) || evaluateQuery(expr.right, obj);
    case 'not': return !evaluateQuery(expr.expr, obj);
    case 'comparison': return evaluateComparison(expr.field, expr.op, expr.value, obj);
  }
}

function applyOp(actual: any, op: string, expected: any): boolean {
  switch (op) {
    case '=': return expected === null ? actual === null : actual == expected;
    case '!=': return expected === null ? actual !== null : actual != expected;
    case '>': return typeof actual === 'number' && actual > expected;
    case '<': return typeof actual === 'number' && actual < expected;
    case '>=': return typeof actual === 'number' && actual >= expected;
    case '<=': return typeof actual === 'number' && actual <= expected;
    case '~': {
      try {
        const re = new RegExp(String(expected), 'i');
        return re.test(String(actual));
      } catch { return false; }
    }
    case 'contains': return String(actual).toLowerCase().includes(String(expected).toLowerCase());
    case 'startsWith': return String(actual).toLowerCase().startsWith(String(expected).toLowerCase());
    case 'endsWith': return String(actual).toLowerCase().endsWith(String(expected).toLowerCase());
    default: return false;
  }
}

function evaluateComparison(field: string, op: string, expected: any, obj: any): boolean {
  const actual = resolveField(field, obj);
  if (actual === undefined) return false;

  // Wildcard field resolution returns an array — check if ANY element satisfies the comparison.
  if (Array.isArray(actual)) {
    return actual.some(item => applyOp(item, op, expected));
  }

  return applyOp(actual, op, expected);
}

/** Resolve a dotted field path against an object. */
function resolveField(field: string, obj: any): any {
  if (obj === null || typeof obj !== 'object') return undefined;

  const parts = field.split(/\.|\[|\]/).filter(Boolean);
  let current: any = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (part === '*' && Array.isArray(current)) {
      // Wildcard: check if ANY item matches (we return the first truthy for comparison)
      return current;
    }
    const index = Number(part);
    if (!isNaN(index) && Array.isArray(current)) {
      current = current[index];
    } else {
      current = (current as Record<string, any>)[part];
    }
  }

  return current;
}

/**
 * Walk the expression AST and collect the field names whose comparisons
 * actually evaluated to true for the given item.
 * NOT expressions are skipped (negated conditions don't produce a highlight target).
 */
function collectMatchingFieldsInto(expr: QueryExpr, item: any, out: Set<string>): void {
  switch (expr.type) {
    case 'comparison':
      if (evaluateComparison(expr.field, expr.op, expr.value, item)) out.add(expr.field);
      break;
    case 'and':
    case 'or':
      collectMatchingFieldsInto(expr.left, item, out);
      collectMatchingFieldsInto(expr.right, item, out);
      break;
    case 'not':
      break;
  }
}

/**
 * Filter an array of objects using a query expression.
 * Returns the matching items and, for each item, the field names that matched.
 */
export function filterByQuery(data: any[], queryStr: string): {
  results: any[];
  error: string | null;
  matchFields: Map<any, string[]>;
} {
  try {
    const expr = parseQuery(queryStr);
    const matchFields = new Map<any, string[]>();
    const results = data.filter(item => {
      if (item === null || typeof item !== 'object') return false;
      const matches = evaluateQuery(expr, item);
      if (matches) {
        const fields = new Set<string>();
        collectMatchingFieldsInto(expr, item, fields);
        matchFields.set(item, [...fields]);
      }
      return matches;
    });
    return { results, error: null, matchFields };
  } catch (e: any) {
    return { results: [], error: e.message || 'Invalid query', matchFields: new Map() };
  }
}
