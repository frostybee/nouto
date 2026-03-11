import { postMessage } from '../lib/vscode';

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  createdAt: number;
}

export interface CookieJarInfo {
  id: string;
  name: string;
  cookieCount: number;
}

// All available cookie jars
const _cookieJars = $state<{ value: CookieJarInfo[] }>({ value: [] });

// Currently active cookie jar ID
const _activeCookieJarId = $state<{ value: string | null }>({ value: null });

// Domain-grouped cookies for the active jar (populated from backend)
const _cookieJarData = $state<{ value: Record<string, Cookie[]> }>({ value: {} });

export function cookieJars() { return _cookieJars.value; }
export function activeCookieJarId() { return _activeCookieJarId.value; }
export function cookieJarData() { return _cookieJarData.value; }

// Derived: the active jar's info
export function activeCookieJar() {
  return _cookieJars.value.find(j => j.id === _activeCookieJarId.value) ?? null;
}

// Derived: flat list of all cookies in the active jar (for $cookie variable lookup)
export function activeCookiesList() { return Object.values(_cookieJarData.value).flat(); }

// --- Data loading (called from message handlers) ---

export function setCookieJarData(data: Record<string, Cookie[]>) {
  _cookieJarData.value = data;
}

export function loadCookieJars(data: {
  jars: CookieJarInfo[];
  activeJarId: string | null;
}) {
  _cookieJars.value = data.jars || [];
  _activeCookieJarId.value = data.activeJarId ?? null;
}

// --- Management functions (send messages to backend) ---

export function requestCookieJars() {
  postMessage({ type: 'getCookieJars' });
}

export function requestCookieJarData() {
  postMessage({ type: 'getCookieJar' });
}

export function createCookieJar(name: string) {
  postMessage({ type: 'createCookieJar', data: { name } });
}

export function renameCookieJar(id: string, name: string) {
  postMessage({ type: 'renameCookieJar', data: { id, name } });
}

export function deleteCookieJar(id: string) {
  postMessage({ type: 'deleteCookieJar', data: { id } });
}

export function switchCookieJar(id: string | null) {
  _activeCookieJarId.value = id;
  postMessage({ type: 'setActiveCookieJar', data: { id } });
}

export function addCookie(cookie: Omit<Cookie, 'createdAt'>) {
  postMessage({
    type: 'addCookie',
    data: {
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
    },
  });
}

export function updateCookie(
  oldName: string,
  oldDomain: string,
  oldPath: string,
  cookie: Omit<Cookie, 'createdAt'>
) {
  postMessage({
    type: 'updateCookie',
    data: {
      oldName,
      oldDomain,
      oldPath,
      cookie: {
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        expires: cookie.expires,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite,
      },
    },
  });
}

export function deleteCookie(name: string, domain: string, path: string) {
  postMessage({ type: 'deleteCookie', data: { name, domain, path } });
}

export function deleteCookieDomain(domain: string) {
  postMessage({ type: 'deleteCookieDomain', data: { domain } });
}

export function clearCookieJar() {
  postMessage({ type: 'clearCookieJar' });
}
