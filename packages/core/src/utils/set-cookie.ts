/**
 * Split a `Set-Cookie` header value that carries several cookies.
 *
 * Nouto's HTTP clients flatten duplicate response headers into one string.
 * Cookies from one response are joined with `, ` and cookies collected across
 * redirect hops are joined with `\n`. A comma only separates cookies when the
 * next token looks like a cookie name followed by `=`, so a comma inside an
 * `Expires=Wed, 09 Jun 2021 10:18:14 GMT` attribute is left alone. Cookie
 * names may contain `-` and `.` (for example `XSRF-TOKEN` or `connect.sid`).
 */
export function splitSetCookieHeader(value: string): string[] {
  return value
    .split(/\n|,(?=\s*[^;,=\s]+=)/)
    .map(part => part.trim())
    .filter(part => part.length > 0);
}
