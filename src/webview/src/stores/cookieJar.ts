import { writable } from 'svelte/store';

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

export const cookieJarData = writable<Record<string, Cookie[]>>({});

export function setCookieJarData(data: Record<string, Cookie[]>) {
  cookieJarData.set(data);
}
