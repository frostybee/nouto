import { describe, expect, it, vi } from 'vitest';

const platformMocks = vi.hoisted(() => ({ isLinux: vi.fn(() => true) }));
vi.mock('../platform', () => platformMocks);

import { fileUriKey, fileUriToPath, normalizeFileUri, pathToFileUri } from './pathUtils';

describe('pathToFileUri', () => {
  it('converts a Windows drive path with backslashes', () => {
    expect(pathToFileUri('C:\\specs\\api.yaml')).toBe('file:///C:/specs/api.yaml');
  });

  it('uppercases the drive letter for stable comparisons', () => {
    expect(pathToFileUri('c:\\specs\\api.yaml')).toBe('file:///C:/specs/api.yaml');
  });

  it('accepts forward-slash Windows paths', () => {
    expect(pathToFileUri('C:/specs/api.yaml')).toBe('file:///C:/specs/api.yaml');
  });

  it('percent-encodes special characters per segment', () => {
    expect(pathToFileUri('C:\\my specs\\a&b.yaml')).toBe('file:///C:/my%20specs/a%26b.yaml');
  });

  it('converts a POSIX path', () => {
    expect(pathToFileUri('/home/user/specs/api.yaml')).toBe('file:///home/user/specs/api.yaml');
  });

  it('converts a UNC path to an authority-form URI', () => {
    expect(pathToFileUri('\\\\server\\share\\api.yaml')).toBe('file://server/share/api.yaml');
  });

  it('produces URIs that compose with WHATWG URL relative resolution (core resolver contract)', () => {
    const base = pathToFileUri('C:\\specs\\api.yaml');
    expect(new URL('./schemas/common.yaml', base).toString()).toBe(
      pathToFileUri('C:\\specs\\schemas\\common.yaml')
    );
    expect(new URL('../shared/common.yaml', base).toString()).toBe(
      pathToFileUri('C:\\shared\\common.yaml')
    );
  });
});

describe('fileUriToPath', () => {
  it('converts a drive URI to a backslash Windows path', () => {
    expect(fileUriToPath('file:///C:/specs/api.yaml')).toBe('C:\\specs\\api.yaml');
  });

  it('uppercases a lowercase drive letter', () => {
    expect(fileUriToPath('file:///c:/specs/api.yaml')).toBe('C:\\specs\\api.yaml');
  });

  it('decodes percent-encoded segments', () => {
    expect(fileUriToPath('file:///C:/my%20specs/a%26b.yaml')).toBe('C:\\my specs\\a&b.yaml');
  });

  it('converts a POSIX URI', () => {
    expect(fileUriToPath('file:///home/user/api.yaml')).toBe('/home/user/api.yaml');
  });

  it('converts an authority-form URI to a UNC path', () => {
    expect(fileUriToPath('file://server/share/api.yaml')).toBe('\\\\server\\share\\api.yaml');
  });

  it('handles a bare drive root', () => {
    expect(fileUriToPath('file:///C:/')).toBe('C:\\');
  });

  it('rejects non-file URIs', () => {
    expect(() => fileUriToPath('https://example.com/x.yaml')).toThrow(/Not a file URI/);
  });

  it('survives malformed percent sequences without throwing', () => {
    expect(fileUriToPath('file:///C:/bad%zz/api.yaml')).toBe('C:\\bad%zz\\api.yaml');
  });
});

describe('round trips', () => {
  it.each([
    'C:\\specs\\api.yaml',
    'C:\\my specs\\a&b.yaml',
    '/home/user/specs/api.yaml',
    '\\\\server\\share\\folder\\api.yaml',
  ])('path → uri → path is stable for %s', (path) => {
    expect(fileUriToPath(pathToFileUri(path))).toBe(path);
  });

  it('normalizeFileUri canonicalizes URIs produced by URL arithmetic', () => {
    // URL keeps the base's encoding; a differently-encoded but equivalent URI
    // must normalize to the same canonical string.
    expect(normalizeFileUri('file:///c:/my%20specs/api.yaml')).toBe(
      pathToFileUri('C:\\my specs\\api.yaml')
    );
  });
});

describe('fileUriKey', () => {
  it('case-folds the whole path on case-insensitive filesystems (Windows/macOS)', () => {
    platformMocks.isLinux.mockReturnValue(false);
    expect(fileUriKey('C:\\Specs\\Api.yaml')).toBe(fileUriKey('c:\\specs\\API.YAML'));
    expect(fileUriKey('C:\\Specs\\Api.yaml')).toBe(fileUriKey('C:/specs/api.yaml'));
  });

  it('keeps case significant on Linux', () => {
    platformMocks.isLinux.mockReturnValue(true);
    expect(fileUriKey('/home/user/Api.yaml')).not.toBe(fileUriKey('/home/user/api.yaml'));
    expect(fileUriKey('/home/user/api.yaml')).toBe(fileUriKey('/home/user/api.yaml'));
  });

  it('accepts a file:// URI and matches the equivalent OS path', () => {
    platformMocks.isLinux.mockReturnValue(false);
    expect(fileUriKey('file:///c:/specs/api.yaml')).toBe(fileUriKey('C:\\Specs\\Api.yaml'));
  });

  it('falls back to case-sensitive when platform detection is unavailable', () => {
    platformMocks.isLinux.mockImplementation(() => {
      throw new Error('no tauri runtime');
    });
    expect(fileUriKey('/home/user/Api.yaml')).not.toBe(fileUriKey('/home/user/api.yaml'));
    platformMocks.isLinux.mockReset();
    platformMocks.isLinux.mockReturnValue(true);
  });
});
