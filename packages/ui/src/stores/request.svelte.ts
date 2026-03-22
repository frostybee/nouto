import type { HttpMethod, KeyValue, PathParam, AuthState, BodyState, Assertion, AuthInheritance, ScriptInheritance, ScriptConfig, SslConfig, ProxyConfig, GrpcConfig } from '../types';
import { generateId } from '../types';

// Re-export for backwards compatibility
export type { HttpMethod, KeyValue, AuthState, BodyState };

export interface RequestState {
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  pathParams: PathParam[];
  headers: KeyValue[];
  auth: AuthState;
  body: BodyState;
  assertions: Assertion[];
  authInheritance?: AuthInheritance;
  scriptInheritance?: ScriptInheritance;
  scripts: ScriptConfig;
  ssl?: SslConfig;
  proxy?: ProxyConfig;
  timeout?: number;
  followRedirects?: boolean;
  maxRedirects?: number;
  description: string;
  grpc?: GrpcConfig;
}

const initialState: RequestState = {
  method: 'GET',
  url: '',
  params: [],
  pathParams: [],
  headers: [],
  auth: { type: 'none' },
  body: { type: 'none', content: '' },
  assertions: [],
  scripts: { preRequest: '', postResponse: '' },
  description: '',
};

export const request = $state<RequestState>({ ...initialState });

export interface RequestContext {
  panelId: string;
  requestId: string;
  collectionId: string;
  collectionName: string;
}

const _originalRequest = $state<{ value: RequestState | null }>({ value: null });
const _requestContext = $state<{ value: RequestContext | null }>({ value: null });

export function originalRequest() { return _originalRequest.value; }
export function requestContext() { return _requestContext.value; }

export function isDirty() {
  if (!_requestContext.value?.collectionId || !_originalRequest.value) return false;
  return JSON.stringify($state.snapshot(request)) !== JSON.stringify(_originalRequest.value);
}

// Deep clone helper to prevent state mutation via shared references
function clone<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

export function setOriginalSnapshot(state: RequestState) {
  _originalRequest.value = clone(state);
}

export function clearOriginalSnapshot() {
  _originalRequest.value = null;
}

export function setRequestContext(ctx: RequestContext) {
  _requestContext.value = ctx;
}

export function clearRequestContext() {
  _requestContext.value = null;
}

// Convenience functions
export function setMethod(method: HttpMethod) {
  request.method = method;
}

export function setUrl(url: string) {
  request.url = url;
}

function ensureKvIds(items: KeyValue[]): KeyValue[] {
  return items.map(v => (v.id ? v : { ...v, id: generateId() }));
}

export function setParams(params: KeyValue[]) {
  request.params = clone(ensureKvIds(params));
}

export function setPathParams(pathParams: PathParam[]) {
  request.pathParams = clone(pathParams);
}

export function setUrlAndParams(url: string, params: KeyValue[]) {
  request.url = url;
  request.params = clone(ensureKvIds(params));
}

export function setHeaders(headers: KeyValue[]) {
  request.headers = clone(ensureKvIds(headers));
}

export function setAuth(auth: AuthState) {
  request.auth = clone(auth);
}

export function setBody(body: BodyState) {
  request.body = clone(body);
}

export function setAssertions(assertions: Assertion[]) {
  request.assertions = clone(assertions);
}

export function setAuthInheritance(authInheritance: AuthInheritance | undefined) {
  request.authInheritance = authInheritance;
}

export function setScriptInheritance(scriptInheritance: ScriptInheritance | undefined) {
  request.scriptInheritance = scriptInheritance;
}

export function setScripts(scripts: ScriptConfig) {
  request.scripts = clone(scripts);
}

export function setDescription(description: string) {
  request.description = description;
}

export function setSsl(ssl: SslConfig | undefined) {
  request.ssl = ssl ? clone(ssl) : undefined;
}

export function setProxy(proxy: ProxyConfig | undefined) {
  request.proxy = proxy ? clone(proxy) : undefined;
}

export function setTimeout(timeout: number | undefined) {
  request.timeout = timeout;
}

export function setRedirects(followRedirects: boolean | undefined, maxRedirects: number | undefined) {
  request.followRedirects = followRedirects;
  request.maxRedirects = maxRedirects;
}

export function setGrpc(grpc: GrpcConfig | undefined) {
  request.grpc = grpc ? clone(grpc) : undefined;
}

export function patchGrpc(partial: Partial<GrpcConfig>) {
  const defaults: GrpcConfig = { useReflection: true, protoPaths: [], protoImportDirs: [] };
  request.grpc = { ...defaults, ...request.grpc, ...partial };
}

export function resetRequest() {
  Object.assign(request, clone(initialState));
  clearOriginalSnapshot();
  clearRequestContext();
}

// Bulk restore for tab switching: sets all request fields + context + original snapshot in one call
export function bulkSetRequest(data: {
  method?: string;
  url?: string;
  params?: KeyValue[];
  pathParams?: PathParam[];
  headers?: KeyValue[];
  auth?: AuthState;
  body?: BodyState;
  assertions?: Assertion[];
  scripts?: ScriptConfig;
  ssl?: SslConfig;
  proxy?: ProxyConfig;
  timeout?: number;
  followRedirects?: boolean;
  maxRedirects?: number;
  description?: string;
  authInheritance?: AuthInheritance;
  scriptInheritance?: ScriptInheritance;
  grpc?: GrpcConfig;
  context?: RequestContext | null;
  originalSnapshot?: RequestState | null;
}) {
  request.method = (data.method || 'GET') as HttpMethod;
  request.url = data.url || '';
  request.params = Array.isArray(data.params) ? ensureKvIds(data.params) : [];
  request.pathParams = Array.isArray(data.pathParams) ? data.pathParams : [];
  request.headers = Array.isArray(data.headers) ? ensureKvIds(data.headers) : [];
  request.auth = data.auth || { type: 'none' };
  request.body = data.body || { type: 'none', content: '' };
  request.assertions = Array.isArray(data.assertions) ? data.assertions : [];
  request.scripts = data.scripts || { preRequest: '', postResponse: '' };
  request.ssl = data.ssl;
  request.proxy = data.proxy;
  request.timeout = data.timeout;
  request.followRedirects = data.followRedirects;
  request.maxRedirects = data.maxRedirects;
  request.description = data.description || '';
  request.authInheritance = data.authInheritance;
  request.scriptInheritance = data.scriptInheritance;
  request.grpc = data.grpc;

  if (data.context?.requestId) {
    _requestContext.value = data.context;
  } else {
    _requestContext.value = null;
  }

  if (data.originalSnapshot) {
    _originalRequest.value = clone(data.originalSnapshot);
  } else {
    _originalRequest.value = null;
  }
}
