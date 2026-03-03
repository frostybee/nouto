import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import type { EnvFileService } from '../../services/EnvFileService';
import type { EnvironmentsData, EnvironmentVariable } from '../../services/types';
import { confirmAction } from '../confirmAction';
import { generateId } from './CollectionTreeOps';

export interface IEnvironmentContext {
  environments: EnvironmentsData;
  storageService: {
    saveEnvironments(data: EnvironmentsData): Promise<any>;
  };
  envFileService: EnvFileService;
  postToWebview(message: any): void;
  notifyEnvironmentsUpdated(): void;
  setEnvironments(data: EnvironmentsData): void;
}

export class EnvironmentHandler {
  constructor(private readonly ctx: IEnvironmentContext) {}

  async createEnvironment(name?: string): Promise<void> {
    const envName = name || await vscode.window.showInputBox({
      prompt: 'Environment name',
      placeHolder: 'Development',
    });

    if (!envName) return;

    this.ctx.environments.environments.push({
      id: generateId(),
      name: envName,
      variables: [],
    });

    await this.ctx.storageService.saveEnvironments(this.ctx.environments);
    this.ctx.notifyEnvironmentsUpdated();
  }

  async renameEnvironment(id: string, name: string): Promise<void> {
    const env = this.ctx.environments.environments.find(e => e.id === id);
    if (!env) return;

    env.name = name;
    await this.ctx.storageService.saveEnvironments(this.ctx.environments);
    this.ctx.notifyEnvironmentsUpdated();
  }

  async deleteEnvironment(id: string): Promise<void> {
    const env = this.ctx.environments.environments.find(e => e.id === id);
    if (!env) return;

    const confirmed = await confirmAction(`Delete environment "${env.name}"?`, 'Delete');
    if (!confirmed) return;

    this.ctx.environments.environments = this.ctx.environments.environments.filter(e => e.id !== id);
    if (this.ctx.environments.activeId === id) {
      this.ctx.environments.activeId = null;
    }
    await this.ctx.storageService.saveEnvironments(this.ctx.environments);
    this.ctx.notifyEnvironmentsUpdated();
  }

  async duplicateEnvironment(id: string): Promise<void> {
    const env = this.ctx.environments.environments.find(e => e.id === id);
    if (!env) return;

    this.ctx.environments.environments.push({
      id: generateId(),
      name: `${env.name} (copy)`,
      variables: [...env.variables.map(v => ({ ...v }))],
    });

    await this.ctx.storageService.saveEnvironments(this.ctx.environments);
    this.ctx.notifyEnvironmentsUpdated();
  }

  async setActiveEnvironment(id: string | null): Promise<void> {
    this.ctx.environments.activeId = id;
    await this.ctx.storageService.saveEnvironments(this.ctx.environments);
    this.ctx.notifyEnvironmentsUpdated();
  }

  async saveEnvironments(data: EnvironmentsData): Promise<void> {
    this.ctx.setEnvironments(data);
    await this.ctx.storageService.saveEnvironments(this.ctx.environments);
    this.ctx.notifyEnvironmentsUpdated();
  }

  async linkEnvFile(): Promise<void> {
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        'Environment Files': ['env'],
        'All Files': ['*'],
      },
      title: 'Select .env File',
    });

    if (!result || result.length === 0) return;

    const filePath = result[0].fsPath;
    await this.ctx.envFileService.setFilePath(filePath);

    this.ctx.environments.envFilePath = filePath;
    await this.ctx.storageService.saveEnvironments(this.ctx.environments);

    this.ctx.postToWebview({
      type: 'envFileVariablesUpdated',
      data: {
        variables: this.ctx.envFileService.getVariables(),
        filePath,
      },
    });
  }

  async unlinkEnvFile(): Promise<void> {
    await this.ctx.envFileService.setFilePath(null);

    this.ctx.environments.envFilePath = null;
    await this.ctx.storageService.saveEnvironments(this.ctx.environments);

    this.ctx.postToWebview({
      type: 'envFileVariablesUpdated',
      data: {
        variables: [],
        filePath: null,
      },
    });
  }

  private mapVariables(vars: EnvironmentVariable[]) {
    return vars.map(v => ({
      key: v.key,
      value: v.value,
      enabled: v.enabled,
      ...(v.description ? { description: v.description } : {}),
    }));
  }

  async exportEnvironment(id: string): Promise<void> {
    let name: string;
    let variables: ReturnType<typeof this.mapVariables>;

    if (id === '__global__') {
      name = 'Global Variables';
      variables = this.mapVariables(this.ctx.environments.globalVariables || []);
    } else {
      const env = this.ctx.environments.environments.find(e => e.id === id);
      if (!env) {
        vscode.window.showErrorMessage('Environment not found');
        return;
      }
      name = env.name;
      variables = this.mapVariables(env.variables);
    }

    const exportData = {
      name,
      variables,
      exportedAt: new Date().toISOString(),
      _type: 'hivefetch-environment',
    };

    const safeName = name.replace(/[^a-zA-Z0-9]/g, '_');
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(safeName + '.env.json'),
      filters: { 'JSON Files': ['json'] },
      title: `Export Environment: ${name}`,
    });

    if (uri) {
      await fs.writeFile(uri.fsPath, JSON.stringify(exportData, null, 2), 'utf8');
      vscode.window.showInformationMessage(`Environment "${name}" exported successfully.`);
    }
  }

  async exportAllEnvironments(): Promise<void> {
    const exportData = {
      globalVariables: this.mapVariables(this.ctx.environments.globalVariables || []),
      environments: this.ctx.environments.environments.map(env => ({
        id: env.id,
        name: env.name,
        variables: this.mapVariables(env.variables),
      })),
      exportedAt: new Date().toISOString(),
      _type: 'hivefetch-environments',
    };

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file('environments.json'),
      filters: { 'JSON Files': ['json'] },
      title: 'Export All Environments',
    });

    if (uri) {
      await fs.writeFile(uri.fsPath, JSON.stringify(exportData, null, 2), 'utf8');
      vscode.window.showInformationMessage('All environments exported successfully.');
    }
  }
}
