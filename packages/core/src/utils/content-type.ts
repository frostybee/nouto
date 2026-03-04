import type { ContentCategory } from '../types';

/**
 * Categorize a content-type header into a display category.
 */
export function categorizeContentType(contentType: string): ContentCategory {
  const ct = contentType.toLowerCase();
  if (ct.includes('application/json') || ct.includes('+json')) return 'json';
  if (ct.includes('image/')) return 'image';
  if (ct.includes('text/html')) return 'html';
  if (ct.includes('application/pdf')) return 'pdf';
  if (ct.includes('text/xml') || ct.includes('application/xml') || ct.includes('+xml')) return 'xml';
  if (ct.includes('text/')) return 'text';
  if (ct.includes('audio/') || ct.includes('video/')) return 'binary';
  if (ct.includes('application/octet-stream') || ct.includes('application/zip') || ct.includes('application/gzip')) return 'binary';
  return 'text';
}

/**
 * Check if a content type represents binary data.
 */
export function isBinaryContent(contentType: string): boolean {
  const category = categorizeContentType(contentType);
  return category === 'image' || category === 'pdf' || category === 'binary';
}
