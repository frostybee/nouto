import { loadEnvironments, loadEnvFileVariables } from './environment';
import { setCookieJarData, loadCookieJars } from './cookieJar';
import type { EnvironmentVariable } from './environment';

export interface InitEnvironmentsData {
  environments: any[];
  activeId: string | null;
  globalVariables?: EnvironmentVariable[];
  envFilePath?: string | null;
  envFileVariables?: EnvironmentVariable[];
  cookieJarData: Record<string, any[]>;
  cookieJars?: Array<{ id: string; name: string; cookieCount: number }>;
  activeCookieJarId?: string | null;
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
  if (data.cookieJars) {
    loadCookieJars({
      jars: data.cookieJars,
      activeJarId: data.activeCookieJarId ?? null,
    });
  }
}
