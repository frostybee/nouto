import type { IncomingMessage } from '@nouto/transport';

export type NotifyFn = (message: IncomingMessage) => void;
