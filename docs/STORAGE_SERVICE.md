# Storage Service

A self-hosted, mock S3-compatible object storage service built on the same **provider/adapter pattern** as the Payment Gateway. It runs in development and lower environments where cloud credentials are not available, and can be swapped for AWS S3 or Azure Blob Storage by changing a single environment variable.

---

## Architecture

```
Browser (Admin — /admin/products/new or /[id])
  │
  │  POST /api/upload  (multipart, same origin, admin JWT required)
  ▼
Fresh Frontend :8000
  │  routes/api/upload.ts — (1) verify admin session  (2) inject X-Storage-Key  (3) proxy body
  │
  │  POST /upload + X-Storage-Key header
  ▼
Storage Service (internal Docker network only — port NOT exposed on host)
  │
  ├── validates X-Storage-Key before any write
  ├── LocalStorageProvider  → saves bytes to Docker volume /app/uploads
  ├── S3StorageProvider     → uploads to AWS S3 bucket     (stub — see below)
  └── AzureBlobProvider     → uploads to Azure Blob storage (stub — see below)
  │
  Returns: { key: "uuid.jpg", url: "http://localhost:8000/api/storage/files/uuid.jpg" }

Browser (any user — product listing, product detail)
  │
  │  GET /api/storage/files/:key  (no auth — product images are public)
  ▼
Fresh Frontend :8000
  │  routes/api/storage/files/[key].ts — validates key format, proxies to storage service
  │
  │  GET /files/:key (internal Docker network)
  ▼
Storage Service — streams file bytes back
```

### Security model

| Path | Auth | Reason |
|---|---|---|
| `POST /api/upload` (Fresh) | Admin JWT cookie | Only admins may upload product images |
| `GET /api/storage/files/:key` (Fresh) | None | Product images are public; anyone browsing the shop must see them |
| `POST /upload` (storage service direct) | `X-Storage-Key` header | Blocks other containers on the Docker network from writing without the shared secret |
| `GET /files/:key` (storage service direct) | None — but unreachable from host | Port 3007 is not mapped; only Fresh (same Docker network) can reach it |

### Why proxy everything through Fresh?

- **No host port exposure** — port 3007 is only on the internal Docker network
- **No CORS** — island and image tags are same-origin (`localhost:8000`)
- **No URL leakage** — the browser never knows the storage service exists
- **Zero island changes when switching providers** — swap `STORAGE_SERVICE_URL` and `STORAGE_API_KEY` in the environment; the proxy adapts automatically

---

## Provider Interface

```typescript
// services/storage-service/providers/mod.ts

export interface UploadResult {
  key: string;          // e.g. "550e8400-abc.jpg" — UUID + extension
  url: string;          // e.g. "http://localhost:3007/files/550e8400-abc.jpg"
  size: number;         // bytes
  contentType: string;  // MIME type
}

export interface DownloadResult {
  data: Uint8Array;
  contentType: string;
}

export interface StorageProvider {
  readonly name: string;
  upload(key: string, data: Uint8Array, contentType: string): Promise<UploadResult>;
  download(key: string): Promise<DownloadResult | null>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
  isHealthy(): Promise<boolean>;
}
```

The registry pattern (identical to the payment gateway) lets you register multiple providers at startup and select one via environment variable:

```typescript
registerProvider(new LocalStorageProvider(storagePath, publicUrl));
registerProvider(new S3StorageProvider());
// active = getProvider(Deno.env.get("STORAGE_PROVIDER") || "local")
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/upload` | Multipart file upload. Returns `{ success, data: { key, url, size, contentType } }` |
| `GET` | `/files/:key` | Serve a file by key. Sets `Cache-Control: immutable` for long-lived caching |
| `DELETE` | `/files/:key` | Delete a file by key |
| `GET` | `/providers` | List registered providers and the active one |
| `GET` | `/health` | Standard health check including storage writability |
| `GET` | `/health/live` | Liveness probe |
| `GET` | `/health/ready` | Readiness probe |

### Upload request

```bash
curl -X POST http://localhost:3007/upload \
  -F "file=@/path/to/image.jpg"
```

Response:
```json
{
  "success": true,
  "data": {
    "key": "550e8400-e29b-41d4-a716-446655440000.jpg",
    "url": "http://localhost:3007/files/550e8400-e29b-41d4-a716-446655440000.jpg",
    "size": 84237,
    "contentType": "image/jpeg"
  },
  "timestamp": "2026-06-07T10:00:00.000Z"
}
```

### Validation

Requests that fail validation receive a descriptive error response:

| Condition | Status | Example error |
|---|---|---|
| Wrong content type field | 400 | `"Expected multipart/form-data"` |
| No file in body | 400 | `"No file provided in request"` |
| File exceeds size limit | 413 | `"File exceeds the 5 MB limit"` |
| Disallowed MIME type | 415 | `"File type 'application/pdf' is not allowed"` |

---

## Key / URL Design

- Keys are `{uuid}.{ext}` — generated on upload, never user-supplied
- The UUID prevents collisions; the extension allows MIME-type inference on serve
- Full URLs are stored in `product.image` (e.g. `http://localhost:3007/files/uuid.jpg`)
- `resolveProductImage()` in `frontend/utils/shop.ts` passes full URLs through unchanged, so switching providers doesn't require re-saving any product records — the URL is already canonical

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3007` | Storage service listen port |
| `STORAGE_PROVIDER` | `local` | Active provider: `local`, `s3`, or `azure` |
| `STORAGE_PUBLIC_URL` | `http://localhost:3007` | Base URL used to construct file URLs for the active provider. In production, point this to your CDN or S3 bucket URL |
| `STORAGE_PATH` | `./uploads` | Filesystem path for the local provider |
| `MAX_FILE_SIZE_MB` | `5` | Maximum file size in megabytes |
| `ALLOWED_TYPES` | `image/jpeg,image/png,image/webp,image/gif,image/svg+xml` | Comma-separated allowed MIME types |
| `STORAGE_API_KEY` | _(empty — open in dev)_ | Shared secret validated on write endpoints (`POST /upload`, `DELETE /files/:key`). Set the same value on the frontend (`STORAGE_API_KEY`) so the Fresh proxy can inject the `X-Storage-Key` header |
| `AWS_BUCKET` | — | S3 bucket name (required for S3 provider) |
| `AWS_REGION` | `us-east-1` | AWS region (required for S3 provider) |
| `AWS_ACCESS_KEY_ID` | — | IAM access key (required for S3 provider) |
| `AWS_SECRET_ACCESS_KEY` | — | IAM secret key (required for S3 provider) |
| `AZURE_CONNECTION_STRING` | — | Azure Storage connection string (required for Azure provider) |
| `AZURE_CONTAINER` | `uploads` | Azure Blob container name (required for Azure provider) |

**Frontend env var:**

| Variable | Default | Description |
|---|---|---|
| `STORAGE_SERVICE_URL` | `http://localhost:3007` | Internal URL the Fresh proxy uses to reach the storage service |

---

## Switching to AWS S3

**Step 1 — Add the SDK** to `services/storage-service/providers/s3.ts`:

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "npm:@aws-sdk/client-s3";
```

**Step 2 — Implement the methods** (stubs are already scaffolded in [providers/s3.ts](../services/storage-service/providers/s3.ts)):

```typescript
async upload(key: string, data: Uint8Array, contentType: string): Promise<UploadResult> {
  const client = new S3Client({ region: this.region });
  await client.send(new PutObjectCommand({
    Bucket: this.bucket,
    Key: key,
    Body: data,
    ContentType: contentType,
  }));
  return { key, url: this.getUrl(key), size: data.byteLength, contentType };
}

async download(key: string): Promise<DownloadResult | null> {
  const client = new S3Client({ region: this.region });
  try {
    const resp = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const data = await resp.Body!.transformToByteArray();
    return { data, contentType: resp.ContentType ?? "application/octet-stream" };
  } catch { return null; }
}

async delete(key: string): Promise<void> {
  const client = new S3Client({ region: this.region });
  await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
}

async isHealthy(): Promise<boolean> {
  const client = new S3Client({ region: this.region });
  try {
    await client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    return true;
  } catch { return false; }
}
```

**Step 3 — Set environment variables** in your cloud env (or docker-compose override):

```yaml
environment:
  STORAGE_PROVIDER: s3
  STORAGE_PUBLIC_URL: https://your-bucket.s3.us-east-1.amazonaws.com
  AWS_BUCKET: your-bucket
  AWS_REGION: us-east-1
  AWS_ACCESS_KEY_ID: AKIAIOSFODNN7EXAMPLE
  AWS_SECRET_ACCESS_KEY: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

**S3 bucket policy** (object-level public read for product images):
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::your-bucket/*"
  }]
}
```

No product records need updating — the URL format changes automatically because `STORAGE_PUBLIC_URL` drives `getUrl()`.

---

## Switching to Azure Blob Storage

**Step 1 — Add the SDK** to `services/storage-service/providers/azure.ts`:

```typescript
import { BlobServiceClient } from "npm:@azure/storage-blob";
```

**Step 2 — Implement the methods** (stubs are already scaffolded in [providers/azure.ts](../services/storage-service/providers/azure.ts)):

```typescript
async upload(key: string, data: Uint8Array, contentType: string): Promise<UploadResult> {
  const serviceClient = BlobServiceClient.fromConnectionString(this.connectionString);
  const containerClient = serviceClient.getContainerClient(this.container);
  const blobClient = containerClient.getBlockBlobClient(key);
  await blobClient.uploadData(data, {
    blobHTTPHeaders: { blobContentType: contentType },
  });
  return { key, url: this.getUrl(key), size: data.byteLength, contentType };
}
```

**Step 3 — Set environment variables**:

```yaml
environment:
  STORAGE_PROVIDER: azure
  AZURE_CONNECTION_STRING: DefaultEndpointsProtocol=https;AccountName=...
  AZURE_CONTAINER: uploads
```

Set the container's **Access level** to "Blob (anonymous read access for blobs only)" in the Azure Portal so uploaded images are publicly accessible.

---

## Adding a New Provider

1. Create `services/storage-service/providers/yourprovider.ts` implementing `StorageProvider`
2. Register it in `main.ts` inside `initProviders()`:
   ```typescript
   registerProvider(new YourProvider());
   ```
3. Set `STORAGE_PROVIDER=yourprovider` in the environment
4. No other files need to change — the adapter seam handles everything

---

## Local Development

The local provider stores files in a Docker volume (`storage_data`) mounted at `/app/uploads`. Files survive container restarts but are isolated from the host filesystem.

```bash
# Start the storage service
docker-compose up storage-service

# Upload a test image
curl -X POST http://localhost:3007/upload -F "file=@test.jpg"

# Verify health
curl http://localhost:3007/health

# List active provider
curl http://localhost:3007/providers
```

Files are automatically accessible at the URL returned by the upload response (`http://localhost:3007/files/{key}`).
