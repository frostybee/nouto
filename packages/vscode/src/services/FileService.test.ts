import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { FileService } from './FileService';

describe('FileService', () => {
  let fileService: FileService;
  const tempDir = os.tmpdir();
  const tempFiles: string[] = [];

  function createTempFile(fileName: string, content: string | Buffer): string {
    const filePath = path.join(tempDir, `fileservice-test-${Date.now()}-${fileName}`);
    fs.writeFileSync(filePath, content);
    tempFiles.push(filePath);
    return filePath;
  }

  beforeAll(() => {
    fileService = new FileService();
  });

  afterAll(() => {
    for (const filePath of tempFiles) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // ignore cleanup errors
      }
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- getFileInfo tests ---

  describe('getFileInfo', () => {
    it('should return correct fileName from path', async () => {
      const filePath = createTempFile('testfile.txt', 'hello');
      const info = await fileService.getFileInfo(filePath);
      expect(info.fileName).toBe(path.basename(filePath));
    });

    it('should return correct fileSize', async () => {
      const content = 'hello world';
      const filePath = createTempFile('sizefile.txt', content);
      const info = await fileService.getFileInfo(filePath);
      expect(info.fileSize).toBe(Buffer.byteLength(content));
    });

    it('should return correct MIME type for .json', async () => {
      const filePath = createTempFile('data.json', '{}');
      const info = await fileService.getFileInfo(filePath);
      expect(info.fileMimeType).toBe('application/json');
    });

    it('should return correct MIME type for .html', async () => {
      const filePath = createTempFile('page.html', '<html></html>');
      const info = await fileService.getFileInfo(filePath);
      expect(info.fileMimeType).toBe('text/html');
    });

    it('should return correct MIME type for .png', async () => {
      const filePath = createTempFile('image.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      const info = await fileService.getFileInfo(filePath);
      expect(info.fileMimeType).toBe('image/png');
    });

    it('should return correct MIME type for .pdf', async () => {
      const filePath = createTempFile('doc.pdf', '%PDF-1.4');
      const info = await fileService.getFileInfo(filePath);
      expect(info.fileMimeType).toBe('application/pdf');
    });

    it('should return application/octet-stream for unknown extension', async () => {
      const filePath = createTempFile('file.xyz123', 'some data');
      const info = await fileService.getFileInfo(filePath);
      expect(info.fileMimeType).toBe('application/octet-stream');
    });

    it('should return correct MIME type for .css', async () => {
      const filePath = createTempFile('style.css', 'body {}');
      const info = await fileService.getFileInfo(filePath);
      expect(info.fileMimeType).toBe('text/css');
    });

    it('should return the full filePath', async () => {
      const filePath = createTempFile('pathcheck.txt', 'data');
      const info = await fileService.getFileInfo(filePath);
      expect(info.filePath).toBe(filePath);
    });
  });

  // --- fileExists tests ---

  describe('fileExists', () => {
    it('should return true for an existing file', () => {
      const filePath = createTempFile('exists.txt', 'content');
      expect(fileService.fileExists(filePath)).toBe(true);
    });

    it('should return false for a non-existing file', () => {
      const fakePath = path.join(tempDir, `nonexistent-${Date.now()}.txt`);
      expect(fileService.fileExists(fakePath)).toBe(false);
    });
  });

  // --- readFileAsBuffer tests ---

  describe('readFileAsBuffer', () => {
    it('should return file content as Buffer', () => {
      const content = 'buffer test content';
      const filePath = createTempFile('buffer.txt', content);
      const result = fileService.readFileAsBuffer(filePath);
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString()).toBe(content);
    });
  });

  // --- createReadStream tests ---

  describe('createReadStream', () => {
    it('should return a ReadStream', async () => {
      const filePath = createTempFile('stream.txt', 'stream content');
      const stream = fileService.createReadStream(filePath);
      expect(stream).toBeInstanceOf(fs.ReadStream);
      await new Promise<void>((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => {
          expect(Buffer.concat(chunks).toString()).toBe('stream content');
          resolve();
        });
        stream.on('error', reject);
      });
    });
  });

  // --- selectFile tests ---

  describe('selectFile', () => {
    it('should return null when dialog is cancelled (undefined result)', async () => {
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue(undefined);
      const result = await fileService.selectFile();
      expect(result).toBeNull();
    });

    it('should return null when result array is empty', async () => {
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([]);
      const result = await fileService.selectFile();
      expect(result).toBeNull();
    });

    it('should return file info when a file is selected', async () => {
      const filePath = createTempFile('selected.json', '{"key":"value"}');
      const mockUri = { fsPath: filePath };
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([mockUri]);
      const result = await fileService.selectFile();
      expect(result).not.toBeNull();
      expect(result!.filePath).toBe(filePath);
      expect(result!.fileName).toBe(path.basename(filePath));
      expect(result!.fileMimeType).toBe('application/json');
    });
  });
});
