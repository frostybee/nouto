import { loadEnvironments, loadEnvFileVariables } from './environment';
import { setCookieJarData } from './cookieJar';
import type { EnvironmentVariable } from './environment';

export interface InitEnvironmentsData {
  environments: any[];
  activeId: string | null;
  globalVariables?: EnvironmentVariable[];
  envFilePath?: string | null;
  envFileVariables?: EnvironmentVariable[];
  cookieJarData: Record<string, any[]>;
}

export function initEnvironmentPanel(data: InitEnvironmentsData) {
  loadEnvironments({
    environments: data.environments,
    activeId: data.activeId,
    globalVariables: data.globalVariables,
    envFilePath: data.envFilePath,
    envFileVariables: data.envFileVariables,
  });
  setCookieJarData(data.cookieJarData || {});
}
