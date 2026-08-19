// Maps every Rust-emitted event name to its typed IncomingMessage payload.
// Derived from the IncomingMessage union so it can never drift: adding a new
// IncomingMessage member automatically makes it a valid event name here.
import type { IncomingMessage } from '@nouto/transport';

export type RustEventPayloads = {
  [K in IncomingMessage['type']]: Extract<IncomingMessage, { type: K }>;
};

export type RustEventName = keyof RustEventPayloads;
