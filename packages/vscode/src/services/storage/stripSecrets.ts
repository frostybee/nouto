import type { EnvironmentsData, EnvironmentVariable } from '@hivefetch/core';

/**
 * Deep-clone environment data and blank out secret variable values.
 * Used before writing to disk so secrets never end up in JSON files.
 */
export function stripSecretValues(data: EnvironmentsData): EnvironmentsData {
  const strip = (vars: EnvironmentVariable[]): EnvironmentVariable[] =>
    vars.map(v => (v.isSecret ? { ...v, value: '', secretRef: v.key } : v));

  return {
    ...data,
    globalVariables: data.globalVariables ? strip(data.globalVariables) : undefined,
    environments: data.environments.map(env => ({
      ...env,
      variables: strip(env.variables),
    })),
  };
}
