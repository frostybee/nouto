/**
 * Path ↔ file:// URI conversion for the OpenAPI editor (Phase 5).
 *
 * Desktop sessions store raw OS paths (dialog plugin output), while core's
 * external-$ref machinery (`resolveExternalRefUri`) does WHATWG URL arithmetic
 * over real file:// URIs. These helpers are the single canonical bridge:
 * every comparison between a resolver-produced URI and a session path must go
 * through them so percent-encoding and drive-letter casing stay consistent.
 */

import { isLinux } from '../platform';

const WINDOWS_DRIVE_PATH = /^[a-zA-Z]:(\/|$)/;
const WINDOWS_DRIVE_SEGMENT = /^[A-Z]:$/;

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Converts an absolute OS path (Windows or POSIX) to a canonical file:// URI. */
export function pathToFileUri(path: string): string {
  let p = path.replace(/\\/g, '/');
  let authority = '';
  if (p.startsWith('//')) {
    // UNC \\server\share\x → file://server/share/x
    const rest = p.slice(2);
    const slash = rest.indexOf('/');
    authority = slash === -1 ? rest : rest.slice(0, slash);
    p = slash === -1 ? '/' : rest.slice(slash);
  } else if (WINDOWS_DRIVE_PATH.test(p)) {
    // Uppercase the drive letter so lookups are stable across sources.
    p = `/${p[0].toUpperCase()}${p.slice(1)}`;
  } else if (!p.startsWith('/')) {
    p = `/${p}`;
  }
  const encoded = p
    .split('/')
    .map((segment, index) =>
      index === 1 && WINDOWS_DRIVE_SEGMENT.test(segment) ? segment : encodeURIComponent(segment),
    )
    .join('/');
  return `file://${authority}${encoded}`;
}

/** Converts a file:// URI back to an OS path (Windows form when drive/UNC-shaped). */
export function fileUriToPath(uri: string): string {
  const url = new URL(uri);
  if (url.protocol !== 'file:') {
    throw new Error(`Not a file URI: ${uri}`);
  }
  const decoded = url.pathname.split('/').map(decodeSegment).join('/');
  if (url.hostname) {
    return `\\\\${url.hostname}${decoded.replace(/\//g, '\\')}`;
  }
  const drive = /^\/([a-zA-Z]):(\/.*)?$/.exec(decoded);
  if (drive) {
    const rest = (drive[2] ?? '').replace(/\//g, '\\');
    return `${drive[1].toUpperCase()}:${rest || '\\'}`;
  }
  return decoded;
}

/**
 * Canonical form for equality checks between URIs from different producers
 * (pathToFileUri vs core's URL arithmetic): decode → re-encode with ours.
 */
export function normalizeFileUri(uri: string): string {
  return pathToFileUri(fileUriToPath(uri));
}

/** Windows and macOS filesystems are case-insensitive by default; Linux is not. */
function pathsAreCaseSensitive(): boolean {
  try {
    return isLinux();
  } catch {
    // No Tauri runtime (unit tests): case-sensitive is the safe default.
    return true;
  }
}

/**
 * Canonical *comparison* key for two paths/URIs that may refer to the same
 * file (session dedupe, recents dedupe, cache reverse index). Accepts either
 * an OS path or a file:// URI. Case-folds the whole URI on case-insensitive
 * filesystems. Never use for display or storage — casing is destroyed.
 */
export function fileUriKey(pathOrUri: string): string {
  let uri: string;
  if (pathOrUri.startsWith('file://')) {
    try {
      uri = normalizeFileUri(pathOrUri);
    } catch {
      uri = pathOrUri;
    }
  } else {
    uri = pathToFileUri(pathOrUri);
  }
  return pathsAreCaseSensitive() ? uri : uri.toLowerCase();
}
