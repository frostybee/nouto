import type { GqlSubStatus, GqlSubEvent } from '../types';

const _gqlSubStatus = $state<{ value: GqlSubStatus }>({ value: 'disconnected' });
const _gqlSubEvents = $state<{ value: GqlSubEvent[] }>({ value: [] });
const _gqlSubError = $state<{ value: string | null }>({ value: null });

export function gqlSubStatus(): GqlSubStatus { return _gqlSubStatus.value; }
export function gqlSubEvents(): GqlSubEvent[] { return _gqlSubEvents.value; }
export function gqlSubError(): string | null { return _gqlSubError.value; }
export function gqlSubEventCount(): number { return _gqlSubEvents.value.length; }

export function setGqlSubStatus(status: GqlSubStatus, error?: string): void {
  _gqlSubStatus.value = status;
  if (error) _gqlSubError.value = error;
  else if (status === 'connected' || status === 'subscribed') _gqlSubError.value = null;
}

const MAX_EVENTS = 1000;

export function addGqlSubEvent(event: GqlSubEvent): void {
  _gqlSubEvents.value = [..._gqlSubEvents.value, event].slice(-MAX_EVENTS);
}

export function clearGqlSubEvents(): void {
  _gqlSubEvents.value = [];
}

// Bulk restore for tab switching
export function bulkSetGqlSubState(data: { status: string; events: GqlSubEvent[]; error: string | null }): void {
  _gqlSubStatus.value = (data.status || 'disconnected') as GqlSubStatus;
  _gqlSubEvents.value = Array.isArray(data.events) ? data.events : [];
  _gqlSubError.value = data.error ?? null;
}
