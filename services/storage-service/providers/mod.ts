export interface UploadResult {
  key: string;
  url: string;
  size: number;
  contentType: string;
}

export interface DownloadResult {
  data: Uint8Array;
  contentType: string;
}

// Implement this interface to add a new storage provider (e.g. S3, Azure Blob).
// Register the instance via registerProvider() in main.ts before starting the service.
export interface StorageProvider {
  readonly name: string;
  upload(key: string, data: Uint8Array, contentType: string): Promise<UploadResult>;
  download(key: string): Promise<DownloadResult | null>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
  isHealthy(): Promise<boolean>;
}

const registry = new Map<string, StorageProvider>();

export function registerProvider(provider: StorageProvider): void {
  registry.set(provider.name, provider);
}

export function getProvider(name: string): StorageProvider {
  const provider = registry.get(name);
  if (!provider) {
    throw new Error(
      `Unknown storage provider: "${name}". Registered providers: ${listProviders().join(", ")}`,
    );
  }
  return provider;
}

export function listProviders(): string[] {
  return [...registry.keys()];
}
