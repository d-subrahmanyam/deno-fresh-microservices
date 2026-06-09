import { DownloadResult, StorageProvider, UploadResult } from "./mod.ts";

// Azure Blob Storage Provider
//
// To activate this provider:
//   1. Add the Azure SDK to your import map or deno.json:
//        import "npm:@azure/storage-blob@^12"
//   2. Set the following environment variables:
//        AZURE_CONNECTION_STRING — from the Azure Portal → Storage Account → Access keys
//        AZURE_CONTAINER         — blob container name (must already exist, set to public read)
//   3. Change STORAGE_PROVIDER=azure in docker-compose.yml (or your cloud env)
//
// File URLs will have the form:
//   https://{account}.blob.core.windows.net/{AZURE_CONTAINER}/{key}
//
// Container access level: set to "Blob (anonymous read access for blobs only)"
// so uploaded images are publicly accessible without SAS tokens.

export class AzureBlobStorageProvider implements StorageProvider {
  readonly name = "azure";
  private connectionString: string;
  private container: string;

  constructor() {
    this.connectionString = Deno.env.get("AZURE_CONNECTION_STRING") || "";
    this.container = Deno.env.get("AZURE_CONTAINER") || "uploads";
  }

  async upload(_key: string, _data: Uint8Array, _contentType: string): Promise<UploadResult> {
    // TODO: implement with @azure/storage-blob
    //
    // import { BlobServiceClient } from "npm:@azure/storage-blob";
    // const serviceClient = BlobServiceClient.fromConnectionString(this.connectionString);
    // const containerClient = serviceClient.getContainerClient(this.container);
    // const blockBlobClient = containerClient.getBlockBlobClient(_key);
    // await blockBlobClient.uploadData(_data, { blobHTTPHeaders: { blobContentType: _contentType } });
    // return { key: _key, url: this.getUrl(_key), size: _data.byteLength, contentType: _contentType };
    throw new Error(
      "AzureBlobStorageProvider: not yet implemented. See providers/azure.ts for activation steps.",
    );
  }

  async download(_key: string): Promise<DownloadResult | null> {
    // TODO: implement with blockBlobClient.downloadToBuffer()
    throw new Error(
      "AzureBlobStorageProvider: not yet implemented. See providers/azure.ts for activation steps.",
    );
  }

  async delete(_key: string): Promise<void> {
    // TODO: implement with blockBlobClient.delete()
    throw new Error(
      "AzureBlobStorageProvider: not yet implemented. See providers/azure.ts for activation steps.",
    );
  }

  getUrl(key: string): string {
    // Extract account name from connection string for URL construction
    const match = this.connectionString.match(/AccountName=([^;]+)/);
    const account = match?.[1] || "storageaccount";
    return `https://${account}.blob.core.windows.net/${this.container}/${key}`;
  }

  async isHealthy(): Promise<boolean> {
    // TODO: implement ContainerClient.exists() check once the SDK is wired up
    return true;
  }
}
