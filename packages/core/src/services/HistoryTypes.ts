// History types - shared between extension and webview

export interface HistoryEntry {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  headers: Array<{ id: string; key: string; value: string; enabled: boolean }>;
  params?: Array<{ id: string; key: string; value: string; enabled: boolean }>;
  pathParams?: Array<{ id: string; key: string; value: string; description: string; enabled: boolean }>;
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
  requestId?: string;
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
  requestId?: string;
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
  collectionId?: string;       // Filter by collection
  requestId?: string;          // Filter by specific saved request (UUID)
  isRegex?: boolean;           // Regex search mode
  searchFields?: ('url' | 'headers' | 'responseBody')[];  // Deep search
  similarTo?: string;          // Find entries with same base URL
}

export interface HistoryStats {
  totalRequests: number;
  timeRange: { from: string; to: string };
  topEndpoints: Array<{ url: string; method: string; count: number; avgDuration: number; errorRate: number }>;
  statusDistribution: { '2xx': number; '3xx': number; '4xx': number; '5xx': number; error: number };
  avgResponseTime: number;
  errorRate: number;
  requestsPerDay: Array<{ date: string; count: number }>;
}
