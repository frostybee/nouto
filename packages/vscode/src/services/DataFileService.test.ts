import * as fs from 'fs/promises';
import { parseDataFile } from './DataFileService';

jest.mock('fs/promises');
const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;

describe('DataFileService', () => {
  describe('CSV parsing', () => {
    it('should parse CSV with headers', async () => {
      mockReadFile.mockResolvedValue('name,email,age\nAlice,alice@test.com,30\nBob,bob@test.com,25\n');
      const rows = await parseDataFile('/test.csv', 'csv');
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({ name: 'Alice', email: 'alice@test.com', age: '30' });
      expect(rows[1]).toEqual({ name: 'Bob', email: 'bob@test.com', age: '25' });
    });

    it('should skip empty lines in CSV', async () => {
      mockReadFile.mockResolvedValue('key,value\na,1\n\nb,2\n');
      const rows = await parseDataFile('/test.csv', 'csv');
      expect(rows).toHaveLength(2);
    });
  });

  describe('JSON parsing', () => {
    it('should parse JSON array', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ]));
      const rows = await parseDataFile('/test.json', 'json');
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({ name: 'Alice', age: '30' });
      expect(rows[1]).toEqual({ name: 'Bob', age: '25' });
    });

    it('should wrap single JSON object in array', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({ name: 'Alice', token: 'abc123' }));
      const rows = await parseDataFile('/test.json', 'json');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({ name: 'Alice', token: 'abc123' });
    });

    it('should convert null values to empty strings', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ key: null, value: 42 }]));
      const rows = await parseDataFile('/test.json', 'json');
      expect(rows[0]).toEqual({ key: '', value: '42' });
    });

    it('should throw on invalid JSON', async () => {
      mockReadFile.mockResolvedValue('not valid json');
      await expect(parseDataFile('/test.json', 'json')).rejects.toThrow('Invalid JSON');
    });

    it('should throw on non-object array elements', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([1, 2, 3]));
      await expect(parseDataFile('/test.json', 'json')).rejects.toThrow('array of objects');
    });
  });
});
