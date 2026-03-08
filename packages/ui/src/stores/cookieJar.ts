import { writable, derived } from 'svelte/store';
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
export const cookieJars = writable<CookieJarInfo[]>([]);

// Currently active cookie jar ID
export const activeCookieJarId = writable<string | null>(null);

// Domain-grouped cookies for the active jar (populated from backend)
export const cookieJarData = writable<Record<string, Cookie[]>>({});

// Derived: the active jar's info
export const activeCookieJar = derived(
  [cookieJars, activeCookieJarId],
  ([$jars, $activeId]) => $jars.find(j => j.id === $activeId) ?? null
);

// Derived: flat list of all cookies in the active jar (for $cookie variable lookup)
export const activeCookiesList = derived(
  cookieJarData,
  ($data) => Object.values($data).flat()
);

// --- Data loading (called from message handlers) ---

export function setCookieJarData(data: Record<string, Cookie[]>) {
  cookieJarData.set(data);
}

export function loadCookieJars(data: {
  jars: CookieJarInfo[];
  activeJarId: string | null;
}) {
  cookieJars.set(data.jars || []);
  activeCookieJarId.set(data.activeJarId ?? null);
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
  activeCookieJarId.set(id);
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
