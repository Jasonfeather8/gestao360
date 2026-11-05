/**
 * Utilitários compartilhados de anexos/comprovantes.
 */

/** Aceita apenas URLs http/https (bloqueia javascript:, data:, etc.). */
export function isSafeAttachmentUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !url) return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
