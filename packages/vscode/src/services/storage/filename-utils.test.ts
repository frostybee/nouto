import { sanitizeFilename, resolveCollision } from './filename-utils';

describe('sanitizeFilename', () => {
  it('should return name unchanged when already safe', () => {
    expect(sanitizeFilename('Login')).toBe('Login');
    expect(sanitizeFilename('Get Users')).toBe('Get Users');
  });

  it('should replace invalid characters with _', () => {
    expect(sanitizeFilename('file/name')).toBe('file_name');
    expect(sanitizeFilename('file\\name')).toBe('file_name');
    expect(sanitizeFilename('file:name')).toBe('file_name');
    expect(sanitizeFilename('file*name')).toBe('file_name');
    expect(sanitizeFilename('file?name')).toBe('file_name');
    expect(sanitizeFilename('file"name')).toBe('file_name');
    expect(sanitizeFilename('file<name>')).toBe('file_name');
    expect(sanitizeFilename('file|name')).toBe('file_name');
  });

  it('should collapse consecutive underscores', () => {
    expect(sanitizeFilename('a///b')).toBe('a_b');
    expect(sanitizeFilename('a**b')).toBe('a_b');
  });

  it('should trim whitespace', () => {
    expect(sanitizeFilename('  hello  ')).toBe('hello');
  });

  it('should return untitled for empty/whitespace-only input', () => {
    expect(sanitizeFilename('')).toBe('untitled');
    expect(sanitizeFilename('   ')).toBe('untitled');
    expect(sanitizeFilename('***')).toBe('untitled');
  });

  it('should handle Windows reserved names', () => {
    expect(sanitizeFilename('CON')).toBe('CON_');
    expect(sanitizeFilename('PRN')).toBe('PRN_');
    expect(sanitizeFilename('NUL')).toBe('NUL_');
    expect(sanitizeFilename('COM1')).toBe('COM1_');
    expect(sanitizeFilename('LPT9')).toBe('LPT9_');
    expect(sanitizeFilename('con')).toBe('con_');
  });

  it('should truncate long names to 200 characters', () => {
    const longName = 'a'.repeat(250);
    expect(sanitizeFilename(longName).length).toBe(200);
  });

  it('should handle mixed invalid chars and spaces', () => {
    expect(sanitizeFilename('GET /api/users?id=1')).toBe('GET _api_users_id=1');
  });
});

describe('resolveCollision', () => {
  it('should return baseName when no collision', () => {
    const existing = new Set<string>();
    expect(resolveCollision('Login', existing)).toBe('Login');
  });

  it('should append _2 on first collision', () => {
    const existing = new Set(['Login']);
    expect(resolveCollision('Login', existing)).toBe('Login_2');
  });

  it('should append _3 when _2 is also taken', () => {
    const existing = new Set(['Login', 'Login_2']);
    expect(resolveCollision('Login', existing)).toBe('Login_3');
  });

  it('should handle multiple collisions', () => {
    const existing = new Set(['item', 'item_2', 'item_3', 'item_4']);
    expect(resolveCollision('item', existing)).toBe('item_5');
  });
});
