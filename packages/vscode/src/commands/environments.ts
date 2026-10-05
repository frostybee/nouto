import * as vscode from 'vscode';
import type { EnvironmentsData } from '../services/types';

export function registerOpenEnvironmentsCommand(
  openFn: () => Promise<void>
): vscode.Disposable {
  return vscode.commands.registerCommand('nouto.openEnvironments', openFn);
}

export function registerOpenCookieJarsCommand(
  openFn: () => Promise<void>
): vscode.Disposable {
  return vscode.commands.registerCommand('nouto.openCookieJars', openFn);
}

export interface EnvironmentPickItem extends vscode.QuickPickItem {
  /** Environment to activate; `null` deactivates. Absent on the separator and the manage item. */
  envId?: string | null;
  action?: 'manage';
}

/** Items for the environment picker: No Environment, each environment, then Manage Environments. */
export function buildEnvironmentPickItems(data: EnvironmentsData): EnvironmentPickItem[] {
  const activeId = data.activeId ?? null;
  const activeDescription = (active: boolean) => (active ? 'Active' : undefined);
  return [
    { label: 'No Environment', description: activeDescription(activeId === null), envId: null },
    ...data.environments.map((env) => ({
      label: env.name,
      description: activeDescription(env.id === activeId),
      envId: env.id,
    })),
    { label: '', kind: vscode.QuickPickItemKind.Separator },
    { label: '$(gear) Manage Environments...', action: 'manage' },
  ];
}

export function registerSelectEnvironmentCommand(deps: {
  getEnvironments(): EnvironmentsData;
  setActiveEnvironment(id: string | null): Promise<void>;
  openEnvironmentsPanel(): Promise<void>;
}): vscode.Disposable {
  return vscode.commands.registerCommand('nouto.selectEnvironment', async () => {
    const data = deps.getEnvironments();
    const picked = await vscode.window.showQuickPick(buildEnvironmentPickItems(data), {
      title: 'Select Environment',
      placeHolder: 'Choose the environment for your requests',
    });
    if (!picked) return;
    if (picked.action === 'manage') {
      await deps.openEnvironmentsPanel();
      return;
    }
    if (picked.envId !== undefined && picked.envId !== (data.activeId ?? null)) {
      await deps.setActiveEnvironment(picked.envId);
    }
  });
}
