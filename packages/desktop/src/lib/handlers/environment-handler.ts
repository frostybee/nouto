import { invoke } from '@tauri-apps/api/core';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import type { OutgoingMessage } from '@nouto/transport';
import type { NotifyFn } from './types';

const ENVIRONMENTS_KEY = 'nouto_environments';

export function loadStoredEnvironments(): { environments: any[]; activeId: string | null; globalVariables?: any[] } {
  try {
    const raw = localStorage.getItem(ENVIRONMENTS_KEY);
    return raw ? JSON.parse(raw) : { environments: [], activeId: null };
  } catch {
    return { environments: [], activeId: null };
  }
}

export function saveEnvironmentData(data: { environments: any[]; activeId: string | null; globalVariables?: any[] }): void {
  try {
    localStorage.setItem(ENVIRONMENTS_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('[TauriMessageBus] Failed to cache environments:', error);
  }
  invoke('save_environments', { data }).catch((error) => {
    console.error('[TauriMessageBus] Failed to save environments to disk:', error);
  });
}

export function emitStoredEnvironments(notify: NotifyFn): void {
  const envData = loadStoredEnvironments();
  notify({ type: 'loadEnvironments', data: envData } as any);
}

export function cacheEnvironmentEvent(payload: any): void {
  try {
    localStorage.setItem(ENVIRONMENTS_KEY, JSON.stringify(payload));
  } catch { /* ignore */ }
}

export async function handleEnvironmentMessage(message: OutgoingMessage, notify: NotifyFn): Promise<void> {
  const data = 'data' in message ? (message as any).data : undefined;
  const envData = loadStoredEnvironments();

  switch (message.type) {
    case 'createEnvironment': {
      const name = data?.name || 'New Environment';
      envData.environments.push({
        id: crypto.randomUUID().replace(/-/g, '').slice(0, 20),
        name,
        variables: [],
      });
      saveEnvironmentData(envData);
      notify({ type: 'loadEnvironments', data: envData } as any);
      break;
    }
    case 'renameEnvironment': {
      const env = envData.environments.find((e: any) => e.id === data.id);
      if (env) {
        env.name = data.name;
        saveEnvironmentData(envData);
        notify({ type: 'loadEnvironments', data: envData } as any);
      }
      break;
    }
    case 'deleteEnvironment': {
      envData.environments = envData.environments.filter((e: any) => e.id !== data.id);
      if (envData.activeId === data.id) {
        envData.activeId = null;
      }
      saveEnvironmentData(envData);
      notify({ type: 'loadEnvironments', data: envData } as any);
      break;
    }
    case 'duplicateEnvironment': {
      const source = envData.environments.find((e: any) => e.id === data.id);
      if (source) {
        envData.environments.push({
          id: crypto.randomUUID().replace(/-/g, '').slice(0, 20),
          name: `${source.name} (copy)`,
          variables: source.variables.map((v: any) => ({ ...v })),
        });
        saveEnvironmentData(envData);
        notify({ type: 'loadEnvironments', data: envData } as any);
      }
      break;
    }
    case 'setActiveEnvironment': {
      envData.activeId = data.id;
      saveEnvironmentData(envData);
      notify({ type: 'loadEnvironments', data: envData } as any);
      break;
    }
    case 'exportEnvironment': {
      const env = envData.environments.find((e: any) => e.id === data.id);
      if (!env) break;
      const exportPayload = {
        name: env.name,
        variables: env.variables,
        ...(env.color ? { color: env.color } : {}),
        exportedAt: new Date().toISOString(),
        _type: 'nouto-environment',
      };
      const safeName = env.name.replace(/[^a-zA-Z0-9]/g, '_');
      const filePath = await save({
        defaultPath: safeName + '.env.json',
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
      });
      if (filePath) {
        await writeTextFile(filePath, JSON.stringify(exportPayload, null, 2));
        notify({ type: 'showNotification', data: { level: 'info', message: `Environment "${env.name}" exported successfully.` } } as any);
      }
      break;
    }
    case 'exportAllEnvironments': {
      const exportPayload = {
        environments: envData.environments.map((env: any) => ({
          id: env.id,
          name: env.name,
          variables: env.variables,
          ...(env.color ? { color: env.color } : {}),
        })),
        exportedAt: new Date().toISOString(),
        _type: 'nouto-environments',
      };
      const filePath = await save({
        defaultPath: 'environments.json',
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
      });
      if (filePath) {
        await writeTextFile(filePath, JSON.stringify(exportPayload, null, 2));
        notify({ type: 'showNotification', data: { level: 'info', message: 'All environments exported successfully.' } } as any);
      }
      break;
    }
    case 'exportGlobalVariables': {
      const exportPayload = {
        globalVariables: envData.globalVariables || [],
        exportedAt: new Date().toISOString(),
        _type: 'nouto-globals',
      };
      const filePath = await save({
        defaultPath: 'global-variables.json',
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
      });
      if (filePath) {
        await writeTextFile(filePath, JSON.stringify(exportPayload, null, 2));
        notify({ type: 'showNotification', data: { level: 'info', message: 'Global variables exported successfully.' } } as any);
      }
      break;
    }
    case 'importGlobalVariables': {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
      });
      if (!selected) break;
      try {
        const raw = await readTextFile(selected as string);
        let importData = JSON.parse(raw);
        if (!importData._type && Array.isArray(importData.values)) {
          importData = {
            _type: 'nouto-globals',
            globalVariables: importData.values.map((v: any) => ({
              key: v.key ?? '',
              value: v.value ?? '',
              enabled: v.enabled !== false,
            })),
          };
        }
        if (importData._type !== 'nouto-globals') {
          notify({ type: 'showNotification', data: { level: 'error', message: 'Unrecognized format. Supported: Nouto globals export, Postman environment/globals file.' } } as any);
          break;
        }
        const incoming: any[] = importData.globalVariables || [];
        const existingKeys = new Set((envData.globalVariables || []).map((v: any) => v.key));
        envData.globalVariables = envData.globalVariables || [];
        for (const v of incoming) {
          if (!existingKeys.has(v.key)) {
            envData.globalVariables.push({ key: v.key ?? '', value: v.value ?? '', enabled: v.enabled ?? true });
          }
        }
        saveEnvironmentData(envData);
        notify({ type: 'loadEnvironments', data: envData } as any);
        notify({ type: 'showNotification', data: { level: 'info', message: 'Global variables imported successfully.' } } as any);
      } catch (e) {
        notify({ type: 'showNotification', data: { level: 'error', message: `Failed to import global variables: ${e}` } } as any);
      }
      break;
    }
    case 'importEnvironments': {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
      });
      if (!selected) break;
      try {
        const raw = await readTextFile(selected as string);
        const importData = JSON.parse(raw);
        const genId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 20);
        const existingNames = new Set(envData.environments.map((e: any) => e.name));

        if (importData._type === 'nouto-environment') {
          const name = existingNames.has(importData.name) ? `${importData.name} (imported)` : importData.name;
          envData.environments.push({
            id: genId(),
            name,
            variables: importData.variables || [],
            ...(importData.color ? { color: importData.color } : {}),
          });
        } else if (importData._type === 'nouto-environments') {
          for (const env of (importData.environments || [])) {
            const name = existingNames.has(env.name) ? `${env.name} (imported)` : env.name;
            existingNames.add(name);
            envData.environments.push({
              id: genId(),
              name,
              variables: env.variables || [],
              ...(env.color ? { color: env.color } : {}),
            });
          }
        } else if (Array.isArray(importData.values)) {
          const fileName = (selected as string).split(/[\\/]/).pop()?.replace('.json', '') || 'Imported';
          const envName = importData.name || fileName.replace('.postman_environment', '').replace('.postman_globals', '');
          const name = existingNames.has(envName) ? `${envName} (imported)` : envName;
          envData.environments.push({
            id: genId(),
            name,
            variables: (importData.values || []).map((v: any) => ({
              key: v.key ?? '',
              value: v.value ?? '',
              enabled: v.enabled !== false,
            })),
          });
        } else {
          notify({ type: 'showNotification', data: { level: 'error', message: 'Unrecognized format. Supported: Nouto environment export, Postman environment/globals file.' } } as any);
          break;
        }

        saveEnvironmentData(envData);
        notify({ type: 'loadEnvironments', data: envData } as any);
        notify({ type: 'showNotification', data: { level: 'info', message: 'Environments imported successfully.' } } as any);
      } catch (e) {
        notify({ type: 'showNotification', data: { level: 'error', message: `Failed to import environments: ${e}` } } as any);
      }
      break;
    }
  }
}
