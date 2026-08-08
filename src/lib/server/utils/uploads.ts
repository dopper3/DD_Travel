import { currentContext } from '$lib/server/data-layer';

export const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'image/webp',
];
export const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.svg', '.webp'];
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

const contentTypeFor = (path: string): string => {
  const ext = path.substring(path.lastIndexOf('.')).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
};

const normalizeKey = (relativePath: string): string =>
  relativePath.replace(/\\/g, '/').replace(/^\/+/, '');

/**
 * File uploads stored in the R2 bucket bound as UPLOADS (see wrangler.jsonc).
 * Replaces the upstream filesystem-based implementation.
 */
class UploadManager {
  get #bucket() {
    return currentContext().uploads;
  }

  async init(): Promise<void> {
    // Nothing to do: the R2 binding's availability is per-request.
  }

  get isConfigured(): boolean {
    return this.#bucket !== null;
  }

  get isReady(): boolean {
    return this.#bucket !== null;
  }

  get uploadLocation(): string | null {
    return this.#bucket ? 'r2://uploads' : null;
  }

  getFilePath(relativePath: string): string | null {
    if (!this.#bucket) return null;
    return normalizeKey(relativePath);
  }

  async saveFile(
    relativePath: string,
    data: Buffer | Uint8Array,
  ): Promise<boolean> {
    const bucket = this.#bucket;
    if (!bucket) return false;

    const key = normalizeKey(relativePath);
    await bucket.put(key, data as unknown as ArrayBuffer, {
      httpMetadata: { contentType: contentTypeFor(key) },
    });
    return true;
  }

  async deleteFile(relativePath: string): Promise<boolean> {
    const bucket = this.#bucket;
    if (!bucket) return false;

    await bucket.delete(normalizeKey(relativePath));
    return true;
  }

  async getFile(
    relativePath: string,
  ): Promise<{ body: ReadableStream; contentType: string } | null> {
    const bucket = this.#bucket;
    if (!bucket) return null;

    const key = normalizeKey(relativePath);
    const object = await bucket.get(key);
    if (!object) return null;

    return {
      body: object.body as unknown as ReadableStream,
      contentType: object.httpMetadata?.contentType ?? contentTypeFor(key),
    };
  }

  async fileExistsAsync(relativePath: string): Promise<boolean> {
    const bucket = this.#bucket;
    if (!bucket) return false;
    return (await bucket.head(normalizeKey(relativePath))) !== null;
  }
}

export const uploadManager = new UploadManager();
