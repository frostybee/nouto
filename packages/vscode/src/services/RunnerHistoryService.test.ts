import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { RunnerHistoryService } from './RunnerHistoryService';
import type { CollectionRunResult } from './types';

describe('RunnerHistoryService', () => {
  let service: RunnerHistoryService;
  let tmpDir: string;

  const makeRunResult = (overrides: Partial<CollectionRunResult> = {}): CollectionRunResult => ({
    collectionId: 'col1',
    collectionName: 'Test Collection',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    totalRequests: 3,
    passedRequests: 2,
    failedRequests: 1,
    skippedRequests: 0,
    totalDuration: 1500,
    results: [],
    stoppedEarly: false,
    ...overrides,
  });

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `runner-history-test-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    service = new RunnerHistoryService(tmpDir);
    await service.load();
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch { /* ok */ }
  });

  it('should start with empty history', async () => {
    const runs = await service.getRuns();
    expect(runs).toHaveLength(0);
  });

  it('should save and retrieve a run', async () => {
    const result = makeRunResult();
    const entry = await service.saveRun(result);

    expect(entry.id).toBeDefined();
    expect(entry.collectionId).toBe('col1');
    expect(entry.passedRequests).toBe(2);

    const runs = await service.getRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe(entry.id);
  });

  it('should retrieve run detail by ID', async () => {
    const result = makeRunResult({ totalRequests: 5 });
    const entry = await service.saveRun(result);

    const detail = await service.getRunById(entry.id);
    expect(detail).not.toBeNull();
    expect(detail!.totalRequests).toBe(5);
    expect(detail!.collectionName).toBe('Test Collection');
  });

  it('should return null for nonexistent run ID', async () => {
    const detail = await service.getRunById('nonexistent');
    expect(detail).toBeNull();
  });

  it('should filter runs by collectionId', async () => {
    await service.saveRun(makeRunResult({ collectionId: 'col1' }));
    await service.saveRun(makeRunResult({ collectionId: 'col2' }));
    await service.saveRun(makeRunResult({ collectionId: 'col1' }));

    const col1Runs = await service.getRuns('col1');
    expect(col1Runs).toHaveLength(2);

    const col2Runs = await service.getRuns('col2');
    expect(col2Runs).toHaveLength(1);
  });

  it('should delete a run', async () => {
    const entry = await service.saveRun(makeRunResult());
    expect(await service.getRuns()).toHaveLength(1);

    const deleted = await service.deleteRun(entry.id);
    expect(deleted).toBe(true);
    expect(await service.getRuns()).toHaveLength(0);
  });

  it('should return false when deleting nonexistent run', async () => {
    const deleted = await service.deleteRun('nonexistent');
    expect(deleted).toBe(false);
  });

  it('should clear all history', async () => {
    await service.saveRun(makeRunResult());
    await service.saveRun(makeRunResult());

    await service.clearAll();
    expect(await service.getRuns()).toHaveLength(0);
  });

  it('should order runs newest first', async () => {
    await service.saveRun(makeRunResult({ startedAt: '2026-03-10T00:00:00Z' }));
    await service.saveRun(makeRunResult({ startedAt: '2026-03-11T00:00:00Z' }));

    const runs = await service.getRuns();
    expect(runs).toHaveLength(2);
    // Newest first (last saved is unshifted to front)
    expect(runs[0].startedAt).toBe('2026-03-11T00:00:00Z');
  });

  it('should persist across service restarts', async () => {
    await service.saveRun(makeRunResult());

    // Create a new service pointing at the same directory
    const service2 = new RunnerHistoryService(tmpDir);
    await service2.load();
    const runs = await service2.getRuns();
    expect(runs).toHaveLength(1);
  });

  it('should respect limit parameter', async () => {
    for (let i = 0; i < 5; i++) {
      await service.saveRun(makeRunResult());
    }

    const limited = await service.getRuns(undefined, 3);
    expect(limited).toHaveLength(3);
  });
});
