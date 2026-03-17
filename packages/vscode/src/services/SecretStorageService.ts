import * as vscode from 'vscode';

const SECRET_PREFIX = 'nouto.secret.';

/**
 * Service for storing sensitive variable values using VS Code's SecretStorage API.
 * Values are stored encrypted and never written to JSON files on disk.
 */
export class SecretStorageService {
  private secrets: vscode.SecretStorage;

  constructor(context: vscode.ExtensionContext) {
    this.secrets = context.secrets;
  }

  /**
   * Store a secret value. The key is the environment variable key prefixed with env ID.
   */
  async store(envId: string, variableKey: string, value: string): Promise<void> {
    const storageKey = this.buildKey(envId, variableKey);
    await this.secrets.store(storageKey, value);
  }

  /**
   * Retrieve a secret value.
   */
  async get(envId: string, variableKey: string): Promise<string | undefined> {
    const storageKey = this.buildKey(envId, variableKey);
    return this.secrets.get(storageKey);
  }

  /**
   * Delete a secret value.
   */
  async delete(envId: string, variableKey: string): Promise<void> {
    const storageKey = this.buildKey(envId, variableKey);
    await this.secrets.delete(storageKey);
  }

  /**
   * Resolve all secret variables for an environment.
   * Takes environment variables and replaces secret refs with actual values.
   */
  async resolveSecrets(
    envId: string,
    variables: Array<{ key: string; value: string; enabled: boolean; isSecret?: boolean; secretRef?: string }>
  ): Promise<Array<{ key: string; value: string; enabled: boolean }>> {
    const resolved: Array<{ key: string; value: string; enabled: boolean }> = [];

    for (const v of variables) {
      if (v.isSecret && v.secretRef) {
        const secretValue = await this.get(envId, v.secretRef);
        resolved.push({
          key: v.key,
          value: secretValue || '',
          enabled: v.enabled,
        });
      } else {
        resolved.push({
          key: v.key,
          value: v.value,
          enabled: v.enabled,
        });
      }
    }

    return resolved;
  }

  /**
   * Store a variable as a secret. Returns the secret ref ID.
   */
  async storeAsSecret(envId: string, variableKey: string, value: string): Promise<string> {
    const secretRef = variableKey; // Use variable key as ref for simplicity
    await this.store(envId, secretRef, value);
    return secretRef;
  }

  private buildKey(envId: string, variableKey: string): string {
    return `${SECRET_PREFIX}${envId}.${variableKey}`;
  }
}
