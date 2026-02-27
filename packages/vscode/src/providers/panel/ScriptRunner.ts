import * as vscode from 'vscode';
import type { ScriptEngine } from '@hivefetch/core/services';
import { resolveScriptsForRequest } from '@hivefetch/core/services';
import type { SecretStorageService } from '../../services/SecretStorageService';
import type { StorageService } from '../../services/StorageService';
import type { PanelInfo } from './PanelTypes';

export class ScriptRunner {
  constructor(
    private readonly scriptEngine: ScriptEngine,
    private readonly storageService: StorageService,
    private readonly secretStorageService: SecretStorageService,
    private readonly getCollections: () => any[],
    private readonly isWebviewAlive: (panelId: string) => boolean
  ) {}

  async getEnvData(): Promise<{ variables: Record<string, string>; globals: Record<string, string> }> {
    const envData = await this.storageService.loadEnvironments();
    const variables: Record<string, string> = {};
    const globals: Record<string, string> = {};
    const activeEnv = envData.environments.find((e: any) => e.id === envData.activeId);
    if (activeEnv) {
      const resolved = await this.secretStorageService.resolveSecrets(activeEnv.id, activeEnv.variables);
      for (const v of resolved) {
        if (v.enabled) variables[v.key] = v.value;
      }
    }
    if (envData.globalVariables) {
      const resolvedGlobals = await this.secretStorageService.resolveSecrets('__global__', envData.globalVariables);
      for (const v of resolvedGlobals) {
        if (v.enabled) globals[v.key] = v.value;
      }
    }
    return { variables, globals };
  }

  collectScriptSources(
    panelInfo: PanelInfo | undefined,
    requestData: any,
    phase: 'pre' | 'post'
  ): { source: string; level: string }[] {
    const sources: { source: string; level: string }[] = [];

    if (panelInfo?.collectionId) {
      const collections = this.getCollections();
      const collection = collections.find((c: any) => c.id === panelInfo.collectionId);
      if (collection && requestData.id) {
        const resolved = resolveScriptsForRequest(collection, requestData.id);
        const chain = phase === 'pre' ? resolved.preRequestScripts : resolved.postResponseScripts;
        sources.push(...chain);
      }
    }

    const scripts = requestData.scripts;
    if (scripts) {
      const src = phase === 'pre' ? scripts.preRequest : scripts.postResponse;
      if (src?.trim()) {
        sources.push({ source: src, level: 'request' });
      }
    }

    return sources;
  }

  async runPreRequestScripts(
    webview: vscode.Webview,
    panelId: string,
    panelInfo: PanelInfo | undefined,
    requestData: any,
    config: any,
    headers: Record<string, string>
  ): Promise<void> {
    const scripts = this.collectScriptSources(panelInfo, requestData, 'pre');
    if (scripts.length === 0) return;
    if (!this.isWebviewAlive(panelId)) return;

    const envData = await this.getEnvData();
    const requestContext = {
      url: config.url,
      method: config.method,
      headers: { ...headers },
      body: config.data,
    };

    const info = {
      requestName: requestData.name || 'Untitled',
      currentIteration: 0,
      totalIterations: 1,
    };

    for (const { source, level } of scripts) {
      const result = await this.scriptEngine.executePreRequestScript(source, requestContext, envData, info);

      if (this.isWebviewAlive(panelId)) {
        webview.postMessage({
          type: 'scriptOutput',
          data: { phase: 'preRequest', result },
        });
      }

      if (result.modifiedRequest) {
        if (result.modifiedRequest.url) config.url = result.modifiedRequest.url;
        if (result.modifiedRequest.method) config.method = result.modifiedRequest.method;
        if (result.modifiedRequest.headers) {
          Object.assign(headers, result.modifiedRequest.headers);
          config.headers = headers;
        }
        if (result.modifiedRequest.body !== undefined) config.data = result.modifiedRequest.body;
      }

      if (result.variablesToSet.length > 0 && this.isWebviewAlive(panelId)) {
        webview.postMessage({
          type: 'setVariables',
          data: result.variablesToSet,
        });
      }

      if (!result.success) break;
    }
  }

  async runPostResponseScripts(
    webview: vscode.Webview,
    panelId: string,
    panelInfo: PanelInfo | undefined,
    requestData: any,
    config: any,
    result: any,
    duration: number
  ): Promise<void> {
    const scripts = this.collectScriptSources(panelInfo, requestData, 'post');
    if (scripts.length === 0) return;
    if (!this.isWebviewAlive(panelId)) return;

    const envData = await this.getEnvData();
    const requestContext = {
      url: config.url,
      method: config.method,
      headers: config.headers || {},
      body: config.data,
    };
    const responseContext = {
      status: result.status,
      statusText: result.statusText,
      headers: result.headers as Record<string, string>,
      body: result.data,
      duration,
    };

    const info = {
      requestName: requestData.name || 'Untitled',
      currentIteration: 0,
      totalIterations: 1,
    };

    for (const { source, level } of scripts) {
      const scriptResult = await this.scriptEngine.executePostResponseScript(
        source,
        requestContext,
        responseContext,
        envData,
        info
      );

      if (this.isWebviewAlive(panelId)) {
        webview.postMessage({
          type: 'scriptOutput',
          data: { phase: 'postResponse', result: scriptResult },
        });
      }

      if (scriptResult.variablesToSet.length > 0 && this.isWebviewAlive(panelId)) {
        webview.postMessage({
          type: 'setVariables',
          data: scriptResult.variablesToSet,
        });
      }

      if (!scriptResult.success) break;
    }
  }
}
