import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { DraftService } from './DraftService';
import type { SavedRequest } from './types';

let tmpDir: string;

function makeMockRequest(url = 'https://example.com/api'): SavedRequest {
  return {
    type: 'request',
    id: `req-${Date.now()}`,
    name: 'Test Request',
    method: 'GET',
    url,
    params: [],
    headers: [],
    auth: { type: 'none' },
    body: { type: 'none', content: '' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `hivefetch-draft-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe('DraftService (real filesystem)', () => {
  it('upsert + flush creates drafts.json', async () => {
    const service = new DraftService(tmpDir);
    await service.load();

    service.upsert('panel-1', null, null, makeMockRequest());
    await service.flush();

    const filePath = path.join(tmpDir, 'drafts.json');
    expect(existsSync(filePath)).toBe(true);

    const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('panel-1');
  });

  it('round-trips: write -> new instance -> load -> verify', async () => {
    const service1 = new DraftService(tmpDir);
    await service1.load();
    service1.upsert('panel-a', 'req-1', 'col-1', makeMockRequest('https://example.com/a'));
    service1.upsert('panel-b', null, null, makeMockRequest('https://example.com/b'));
    await service1.flush();

    const service2 = new DraftService(tmpDir);
    await service2.load();
    expect(service2.getAll()).toHaveLength(2);
    expect(service2.has('panel-a')).toBe(true);
    expect(service2.has('panel-b')).toBe(true);
  });

  it('remove + flush removes entry from disk', async () => {
    const service = new DraftService(tmpDir);
    await service.load();
    service.upsert('panel-x', null, null, makeMockRequest());
    service.upsert('panel-y', null, null, makeMockRequest('https://example.com/y'));
    await service.flush();

    service.remove('panel-x');
    await service.flush();

    const service2 = new DraftService(tmpDir);
    await service2.load();
    expect(service2.has('panel-x')).toBe(false);
    expect(service2.has('panel-y')).toBe(true);
    expect(service2.getAll()).toHaveLength(1);
  });

  it('empty URL is not persisted', async () => {
    const service = new DraftService(tmpDir);
    await service.load();
    service.upsert('panel-empty', null, null, makeMockRequest(''));
    await service.flush();

    expect(service.has('panel-empty')).toBe(false);
  });
});
