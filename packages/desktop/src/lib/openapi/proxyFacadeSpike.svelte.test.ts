import { describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

/**
 * Phase 5 spike (gates the session-registry design): proves Svelte 5 tracks
 * reactive reads made *inside* a JS Proxy get trap during an $effect, so the
 * `openApiSession` facade can forward property access to the active session
 * while consumers keep re-rendering on both field changes and tab switches.
 * The assertions here are folded into session.svelte.test.ts once the real
 * registry lands; this file then guards the raw mechanism.
 */

interface MiniSession {
  content: string;
}

describe('Proxy facade reactivity (Phase 5 registry spike)', () => {
  it('re-tracks $effect reads through a Proxy get trap across active-session switches', () => {
    const sessions = new SvelteMap<string, MiniSession>();
    let activeId = $state<string | null>(null);
    const EMPTY: MiniSession = { content: '' };

    const facade = new Proxy(EMPTY, {
      get(_target, prop) {
        const session = activeId ? sessions.get(activeId) : undefined;
        return Reflect.get(session ?? EMPTY, prop);
      },
      set(_target, prop, value) {
        const session = activeId ? sessions.get(activeId) : undefined;
        if (session) Reflect.set(session, prop, value);
        return true;
      },
    }) as MiniSession;

    const seen: string[] = [];
    const cleanup = $effect.root(() => {
      $effect(() => {
        seen.push(facade.content);
      });
    });
    flushSync();
    expect(seen).toEqual(['']);

    const a = $state<MiniSession>({ content: 'A1' });
    const b = $state<MiniSession>({ content: 'B1' });
    sessions.set('a', a);
    sessions.set('b', b);
    activeId = 'a';
    flushSync();
    expect(seen).toEqual(['', 'A1']);

    // Field mutation within the active session re-fires the effect.
    a.content = 'A2';
    flushSync();
    expect(seen).toEqual(['', 'A1', 'A2']);

    // Mutation in a background session does not.
    b.content = 'B2';
    flushSync();
    expect(seen).toEqual(['', 'A1', 'A2']);

    // Switching the active session re-fires with the new session's value.
    activeId = 'b';
    flushSync();
    expect(seen).toEqual(['', 'A1', 'A2', 'B2']);

    // Writes through the facade land on the active session and re-fire.
    facade.content = 'B3';
    flushSync();
    expect(seen).toEqual(['', 'A1', 'A2', 'B2', 'B3']);
    expect(b.content).toBe('B3');
    expect(a.content).toBe('A2');

    cleanup();
  });

  it('templates-style reads fall back to the empty session when nothing is active', () => {
    const sessions = new SvelteMap<string, MiniSession>();
    let activeId = $state<string | null>(null);
    const EMPTY: MiniSession = { content: '' };
    const facade = new Proxy(EMPTY, {
      get(_target, prop) {
        const session = activeId ? sessions.get(activeId) : undefined;
        return Reflect.get(session ?? EMPTY, prop);
      },
      set(_target, prop, value) {
        const session = activeId ? sessions.get(activeId) : undefined;
        if (session) Reflect.set(session, prop, value);
        return true;
      },
    }) as MiniSession;

    expect(facade.content).toBe('');
    // Writing with no active session is a silent no-op and must not mutate EMPTY.
    facade.content = 'ignored';
    expect(facade.content).toBe('');
    expect(EMPTY.content).toBe('');

    const only = $state<MiniSession>({ content: 'X' });
    sessions.set('x', only);
    activeId = 'x';
    expect(facade.content).toBe('X');
  });
});
