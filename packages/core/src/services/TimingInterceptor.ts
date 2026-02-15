export interface TimingData {
  dnsLookup: number;
  tcpConnection: number;
  tlsHandshake: number;
  ttfb: number;
  contentTransfer: number;
  total: number;
}

export type TimelineEventCategory =
  | 'config' | 'request' | 'info' | 'warning' | 'dns'
  | 'connection' | 'tls' | 'response' | 'data';

export interface TimelineEvent {
  category: TimelineEventCategory;
  text: string;
  timestamp: number;
}
