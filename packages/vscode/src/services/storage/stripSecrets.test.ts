import { stripSecretValues } from './stripSecrets';
import type { EnvironmentsData } from '../types';

describe('stripSecretValues', () => {
  it('should blank out secret variable values in environments', () => {
    const data: EnvironmentsData = {
      environments: [
        {
          id: 'env-1',
          name: 'Production',
          variables: [
            { key: 'BASE_URL', value: 'https://api.example.com', enabled: true },
            { key: 'API_KEY', value: 'sk-secret123', enabled: true, isSecret: true },
          ],
        },
      ],
      activeId: 'env-1',
    };

    const result = stripSecretValues(data);

    expect(result.environments[0].variables[0].value).toBe('https://api.example.com');
    expect(result.environments[0].variables[1].value).toBe('');
    expect(result.environments[0].variables[1].isSecret).toBe(true);
    expect(result.environments[0].variables[1].secretRef).toBe('API_KEY');
  });

  it('should blank out secret global variables', () => {
    const data: EnvironmentsData = {
      environments: [],
      activeId: null,
      globalVariables: [
        { key: 'TEAM', value: 'engineering', enabled: true },
        { key: 'TOKEN', value: 'ghp_abc123', enabled: true, isSecret: true },
      ],
    };

    const result = stripSecretValues(data);

    expect(result.globalVariables![0].value).toBe('engineering');
    expect(result.globalVariables![1].value).toBe('');
    expect(result.globalVariables![1].isSecret).toBe(true);
    expect(result.globalVariables![1].secretRef).toBe('TOKEN');
  });

  it('should not modify the original data', () => {
    const data: EnvironmentsData = {
      environments: [
        {
          id: 'env-1',
          name: 'Test',
          variables: [
            { key: 'SECRET', value: 'my-secret', enabled: true, isSecret: true },
          ],
        },
      ],
      activeId: 'env-1',
    };

    const result = stripSecretValues(data);

    // Original should be unchanged
    expect(data.environments[0].variables[0].value).toBe('my-secret');
    // Result should be stripped
    expect(result.environments[0].variables[0].value).toBe('');
  });

  it('should handle missing globalVariables', () => {
    const data: EnvironmentsData = {
      environments: [],
      activeId: null,
    };

    const result = stripSecretValues(data);

    expect(result.globalVariables).toBeUndefined();
  });

  it('should preserve non-secret variables unchanged', () => {
    const data: EnvironmentsData = {
      environments: [
        {
          id: 'env-1',
          name: 'Dev',
          variables: [
            { key: 'URL', value: 'http://localhost', enabled: true, description: 'Base URL' },
            { key: 'PORT', value: '3000', enabled: false },
          ],
        },
      ],
      activeId: 'env-1',
    };

    const result = stripSecretValues(data);

    expect(result.environments[0].variables[0]).toEqual({
      key: 'URL', value: 'http://localhost', enabled: true, description: 'Base URL',
    });
    expect(result.environments[0].variables[1]).toEqual({
      key: 'PORT', value: '3000', enabled: false,
    });
  });

  it('should preserve activeId and other top-level fields', () => {
    const data: EnvironmentsData = {
      environments: [{ id: 'e1', name: 'E1', variables: [] }],
      activeId: 'e1',
      envFilePath: '/path/to/.env',
    };

    const result = stripSecretValues(data);

    expect(result.activeId).toBe('e1');
    expect(result.envFilePath).toBe('/path/to/.env');
  });
});
