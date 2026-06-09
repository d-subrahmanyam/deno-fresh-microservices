import { DownloadResult, StorageProvider, UploadResult } from "./mod.ts";

const MIME_FROM_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

export class LocalStorageProvider implements StorageProvider {
  readonly name = "local";
  private storagePath: string;
  private publicUrl: string;

  constructor(storagePath: string, publicUrl: string) {
    this.storagePath = storagePath;
    this.publicUrl = publicUrl.replace(/\/$/, "");
  }

  async upload(key: string, data: Uint8Array, contentType: string): Promise<UploadResult> {
    await Deno.writeFile(`${this.storagePath}/${key}`, data);
    return { key, url: this.getUrl(key), size: data.byteLength, contentType };
  }

  async download(key: string): Promise<DownloadResult | null> {
    try {
      const data = await Deno.readFile(`${this.storagePath}/${key}`);
      const ext = "." + key.split(".").pop()!.toLowerCase();
      const contentType = MIME_FROM_EXT[ext] ?? "application/octet-stream";
      return { data, contentType };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await Deno.remove(`${this.storagePath}/${key}`);
    } catch {
      // Ignore if file does not exist
    }
  }

  getUrl(key: string): string {
    return `${this.publicUrl}/files/${key}`;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const testPath = `${this.storagePath}/.health`;
      await Deno.writeFile(testPath, new Uint8Array([1]));
      await Deno.remove(testPath);
      return true;
    } catch {
      return false;
    }
  }
}
