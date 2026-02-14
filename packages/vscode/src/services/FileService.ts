import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const MIME_TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.ts': 'application/typescript',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.md': 'text/markdown',
  '.yaml': 'application/x-yaml',
  '.yml': 'application/x-yaml',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.tar': 'application/x-tar',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.avi': 'video/x-msvideo',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export class FileService {
  /**
   * Open a file picker dialog and return file info
   */
  async selectFile(): Promise<{
    filePath: string;
    fileName: string;
    fileSize: number;
    fileMimeType: string;
  } | null> {
    const result = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Select File',
    });

    if (!result || result.length === 0) return null;

    const filePath = result[0].fsPath;
    return this.getFileInfo(filePath);
  }

  /**
   * Get file info for a given path
   */
  getFileInfo(filePath: string): {
    filePath: string;
    fileName: string;
    fileSize: number;
    fileMimeType: string;
  } {
    const stats = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return {
      filePath,
      fileName: path.basename(filePath),
      fileSize: stats.size,
      fileMimeType: MIME_TYPES[ext] || 'application/octet-stream',
    };
  }

  /**
   * Check if a file exists
   */
  fileExists(filePath: string): boolean {
    try {
      fs.accessSync(filePath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a read stream for a file (for streaming large files)
   */
  createReadStream(filePath: string): fs.ReadStream {
    return fs.createReadStream(filePath);
  }

  /**
   * Read a file as a Buffer
   */
  readFileAsBuffer(filePath: string): Buffer {
    return fs.readFileSync(filePath);
  }
}
