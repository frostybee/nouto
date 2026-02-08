import { DraftService } from './DraftService';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import type { DraftEntry, SavedRequest } from './types';

jest.mock('fs/promises');
jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

const mockFs = fs as jest.Mocked<typeof fs>;
const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;

const createMockRequest = (url = 'https://api.example.com'): SavedRequest => ({
  type: 'request',
  id: 'req-1',
  name: 'Test Request',
  method: 'GET',
  url,
  params: [],
  headers: [],
  auth: { type: 'none' },
  body: { type: 'none', content: '' },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
});

const createMockDraftEntry = (id: string, overrides: Partial<DraftEntry> = {}): DraftEntry => ({
  id,
  requestId: null,
  collectionId: null,
  request: createMockRequest(),
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('DraftService', () => {
  let service: DraftService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockExistsSync.mockReturnValue(false);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    service = new DraftService('/test/storage');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('load', () => {
    it('should handle missing file gracefully', async () => {
      mockExistsSync.mockReturnValue(false);

      await service.load();

      expect(service.getAll()).toEqual([]);
    });

    it('should load valid JSON entries', async () => {
      const entries = [createMockDraftEntry('panel-1'), createMockDraftEntry('panel-2')];
      mockExistsSync.mockReturnValue(true);
      mockFs.readFile.mockResolvedValue(JSON.stringify(entries));

      await service.load();

      expect(service.getAll()).toHaveLength(2);
      expect(service.has('panel-1')).toBe(true);
      expect(service.has('panel-2')).toBe(true);
    });

    it('should handle empty file without throwing', async () => {
      mockExistsSync.mockReturnValue(true);
      mockFs.readFile.mockResolvedValue('');

      await service.load();

      expect(service.getAll()).toEqual([]);
    });

    it('should handle whitespace-only file without throwing', async () => {
      mockExistsSync.mockReturnValue(true);
      mockFs.readFile.mockResolvedValue('   \n  ');

      await service.load();

      expect(service.getAll()).toEqual([]);
    });

    it('should handle corrupted JSON without throwing', async () => {
      mockExistsSync.mockReturnValue(true);
      mockFs.readFile.mockResolvedValue('{invalid json');

      await service.load();

      expect(service.getAll()).toEqual([]);
    });

    it('should handle file read errors without throwing', async () => {
      mockExistsSync.mockReturnValue(true);
      mockFs.readFile.mockRejectedValue(new Error('Permission denied'));

      await service.load();

      expect(service.getAll()).toEqual([]);
    });
  });

  describe('upsert', () => {
    it('should add a new draft', () => {
      service.upsert('panel-1', 'req-1', null, createMockRequest());

      expect(service.has('panel-1')).toBe(true);
      expect(service.getAll()).toHaveLength(1);
    });

    it('should update an existing draft', () => {
      service.upsert('panel-1', 'req-1', null, createMockRequest());
      service.upsert('panel-1', 'req-1', null, createMockRequest('https://updated.com'));

      expect(service.getAll()).toHaveLength(1);
      expect(service.getAll()[0].request.url).toBe('https://updated.com');
    });

    it('should skip drafts with empty URL', () => {
      service.upsert('panel-1', null, null, createMockRequest(''));

      expect(service.has('panel-1')).toBe(false);
      expect(service.getAll()).toHaveLength(0);
    });

    it('should enforce max drafts cap (20)', () => {
      for (let i = 0; i < 25; i++) {
        service.upsert(`panel-${i}`, null, null, createMockRequest(`https://api${i}.com`));
      }

      expect(service.getAll().length).toBeLessThanOrEqual(20);
    });
  });

  describe('remove', () => {
    it('should remove an existing draft', () => {
      service.upsert('panel-1', null, null, createMockRequest());

      service.remove('panel-1');

      expect(service.has('panel-1')).toBe(false);
      expect(service.getAll()).toHaveLength(0);
    });

    it('should not throw when removing non-existent draft', () => {
      expect(() => service.remove('non-existent')).not.toThrow();
    });
  });

  describe('flush', () => {
    it('should write drafts to disk immediately', async () => {
      mockExistsSync.mockReturnValue(true);
      service.upsert('panel-1', null, null, createMockRequest());

      await service.flush();

      expect(mockFs.writeFile).toHaveBeenCalledTimes(1);
      const writtenData = JSON.parse(mockFs.writeFile.mock.calls[0][1] as string);
      expect(writtenData).toHaveLength(1);
      expect(writtenData[0].id).toBe('panel-1');
    });

    it('should create directory if missing', async () => {
      mockExistsSync.mockReturnValue(false);
      service.upsert('panel-1', null, null, createMockRequest());

      await service.flush();

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.any(String),
        { recursive: true }
      );
    });
  });
});
