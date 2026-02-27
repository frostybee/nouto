// History types — shared between extension and webview

export interface HistoryEntry {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  headers: Array<{ id: string; key: string; value: string; enabled: boolean }>;
  params?: Array<{ id: string; key: string; value: string; enabled: boolean }>;
  body?: any;
  auth?: any;
  responseStatus?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string;       // Capped at 256 KB
  bodyTruncated?: boolean;
  responseDuration?: number;
  responseSize?: number;
  workspaceName?: string;
  collectionId?: string;
  collectionName?: string;
  requestName?: string;
}

export interface HistoryIndexEntry {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  responseStatus?: number;
  responseDuration?: number;
  responseSize?: number;
  workspaceName?: string;
  collectionId?: string;
  requestName?: string;
}

export interface HistorySearchParams {
  query?: string;
  methods?: string[];
  statusRange?: 'success' | 'redirect' | 'clientError' | 'serverError';
  limit?: number;    // Default 50
  offset?: number;
  before?: string;
  after?: string;
}
