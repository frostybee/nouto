import type { FileService } from '../../services/FileService';

export interface BodyBuildResult {
  data?: any;
  headerUpdates: Record<string, string>;
  formData?: any;
  error?: {
    category: string;
    message: string;
    suggestion: string;
  };
}

export class RequestBodyBuilder {
  constructor(private readonly fileService: FileService) {}

  async build(body: any, headers: Record<string, string>): Promise<BodyBuildResult> {
    const headerUpdates: Record<string, string> = {};

    if (body.type === 'json' && body.content) {
      return this.buildJson(body.content, headers);
    }

    if (body.type === 'text' && body.content) {
      if (!headers['Content-Type']) headerUpdates['Content-Type'] = 'text/plain';
      return { data: body.content, headerUpdates };
    }

    if (body.type === 'xml' && body.content) {
      if (!headers['Content-Type']) headerUpdates['Content-Type'] = 'application/xml';
      return { data: body.content, headerUpdates };
    }

    if (body.type === 'x-www-form-urlencoded' && body.content) {
      return this.buildUrlEncoded(body.content, headers);
    }

    if (body.type === 'form-data' && body.content) {
      return this.buildFormData(body.content, headers);
    }

    if (body.type === 'graphql' && body.content) {
      return this.buildGraphQL(body, headers);
    }

    if (body.type === 'binary' && body.content) {
      return this.buildBinary(body, headers);
    }

    if (body.content) {
      return { data: body.content, headerUpdates };
    }

    return { headerUpdates };
  }

  private buildJson(content: string, headers: Record<string, string>): BodyBuildResult {
    const headerUpdates: Record<string, string> = {};
    try {
      const data = JSON.parse(content);
      if (!headers['Content-Type']) headerUpdates['Content-Type'] = 'application/json';
      return { data, headerUpdates };
    } catch {
      if (!headers['Content-Type']) headerUpdates['Content-Type'] = 'text/plain';
      return { data: content, headerUpdates };
    }
  }

  private buildUrlEncoded(content: string, headers: Record<string, string>): BodyBuildResult {
    const headerUpdates: Record<string, string> = {};
    try {
      const formItems = JSON.parse(content);
      const formData = new URLSearchParams();
      for (const item of formItems) {
        if (item.enabled && item.key) {
          formData.append(item.key, item.value || '');
        }
      }
      if (!headers['Content-Type']) headerUpdates['Content-Type'] = 'application/x-www-form-urlencoded';
      return { data: formData.toString(), headerUpdates };
    } catch {
      return {
        headerUpdates,
        error: {
          category: 'validation',
          message: 'Invalid form data format',
          suggestion: 'The form data could not be parsed. Please check the format of your form fields.',
        },
      };
    }
  }

  private async buildFormData(content: string, headers: Record<string, string>): Promise<BodyBuildResult> {
    const headerUpdates: Record<string, string> = {};
    try {
      const formItems = JSON.parse(content);
      const FormData = (await import('form-data')).default;
      const formData = new FormData();
      for (const item of formItems) {
        if (!item.enabled || !item.key) continue;
        if (item.fieldType === 'file' && item.value) {
          if (this.fileService.fileExists(item.value)) {
            formData.append(item.key, this.fileService.createReadStream(item.value), {
              filename: item.fileName || undefined,
              contentType: item.fileMimeType || undefined,
            });
          }
        } else {
          formData.append(item.key, item.value || '');
        }
      }
      Object.assign(headerUpdates, formData.getHeaders());
      return { data: formData, formData, headerUpdates };
    } catch {
      return {
        headerUpdates,
        error: {
          category: 'validation',
          message: 'Invalid form data format',
          suggestion: 'The form data could not be parsed. Please check the format of your form fields.',
        },
      };
    }
  }

  private buildGraphQL(body: any, headers: Record<string, string>): BodyBuildResult {
    const headerUpdates: Record<string, string> = {};
    const payload: Record<string, any> = { query: body.content };
    if (body.graphqlVariables) {
      try { payload.variables = JSON.parse(body.graphqlVariables); } catch {}
    }
    if (body.graphqlOperationName) {
      payload.operationName = body.graphqlOperationName;
    }
    if (!headers['Content-Type']) headerUpdates['Content-Type'] = 'application/json';
    return { data: payload, headerUpdates };
  }

  private buildBinary(body: any, headers: Record<string, string>): BodyBuildResult {
    const headerUpdates: Record<string, string> = {};
    const filePath = body.content;
    if (this.fileService.fileExists(filePath)) {
      const data = this.fileService.readFileAsBuffer(filePath);
      if (!headers['Content-Type']) {
        headerUpdates['Content-Type'] = body.fileMimeType || 'application/octet-stream';
      }
      return { data, headerUpdates };
    } else {
      return {
        headerUpdates,
        error: {
          category: 'validation',
          message: 'File not found',
          suggestion: 'The selected file no longer exists. Please select a new file.',
        },
      };
    }
  }
}
