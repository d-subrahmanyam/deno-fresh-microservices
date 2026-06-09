import { BaseService, ServiceConfig } from "../../shared/base-service.ts";
import { ComponentHealth } from "../../shared/types/mod.ts";
import {
  getProvider,
  listProviders,
  registerProvider,
  StorageProvider,
} from "./providers/mod.ts";
import { LocalStorageProvider } from "./providers/local.ts";
import { S3StorageProvider } from "./providers/s3.ts";
import { AzureBlobStorageProvider } from "./providers/azure.ts";

// Valid key format: UUID (hex + dashes) followed by a dot and a short extension.
// This prevents path traversal attacks when serving files by URL key.
const VALID_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z]{2,5}$/i;

const EXT_FROM_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
};

class StorageService extends BaseService {
  private provider!: StorageProvider;

  constructor(config: ServiceConfig) {
    super(config);
  }

  setProvider(provider: StorageProvider) {
    this.provider = provider;
  }

  protected async checkDependencies(): Promise<Record<string, ComponentHealth>> {
    const healthy = await this.provider.isHealthy();
    return {
      storage: {
        status: healthy ? "healthy" : "unhealthy",
        message: healthy ? undefined : "Storage backend is not writable",
      },
    };
  }

  protected setupRoutes() {
    const maxSizeMB = parseInt(Deno.env.get("MAX_FILE_SIZE_MB") || "5");
    const allowedTypes = new Set(
      (Deno.env.get("ALLOWED_TYPES") ||
        "image/jpeg,image/png,image/webp,image/gif,image/svg+xml").split(",").map((t) =>
          t.trim()
        ),
    );
    const apiKey = Deno.env.get("STORAGE_API_KEY") || "";

    // Shared secret guard for write operations.
    // The storage service is not exposed on the host network — all write traffic
    // must arrive via the Fresh proxy, which injects X-Storage-Key.
    // GET /files/:key remains open because product images are public.
    const requireApiKey = (ctx: { request: { headers: Headers }; response: { status: number; body: unknown } }): boolean => {
      if (!apiKey) return true; // no key configured — allow (dev default)
      const provided = ctx.request.headers.get("x-storage-key") ?? "";
      if (provided !== apiKey) {
        ctx.response.status = 401;
        ctx.response.body = { success: false, error: "Unauthorized" };
        return false;
      }
      return true;
    };

    // Upload a file — returns { key, url, size, contentType }
    this.router.post("/upload", async (ctx) => {
      if (!requireApiKey(ctx)) return;

      const contentType = ctx.request.headers.get("content-type") || "";
      if (!contentType.startsWith("multipart/form-data")) {
        ctx.response.status = 400;
        ctx.response.body = { success: false, error: "Expected multipart/form-data" };
        return;
      }

      let formData: { files?: Array<{ filename?: string; content?: Uint8Array; contentType: string }> };
      try {
        const body = ctx.request.body({ type: "form-data" });
        formData = await body.value.read({ maxSize: maxSizeMB * 1024 * 1024 });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes("max") || msg.toLowerCase().includes("size")) {
          ctx.response.status = 413;
          ctx.response.body = {
            success: false,
            error: `File exceeds the ${maxSizeMB} MB limit`,
          };
        } else {
          ctx.response.status = 400;
          ctx.response.body = { success: false, error: "Failed to parse multipart form data" };
        }
        return;
      }

      const file = formData.files?.[0];
      if (!file || !file.content || file.content.byteLength === 0) {
        ctx.response.status = 400;
        ctx.response.body = { success: false, error: "No file provided in request" };
        return;
      }

      const mimeType = (file.contentType || "application/octet-stream").split(";")[0].trim();
      if (!allowedTypes.has(mimeType)) {
        ctx.response.status = 415;
        ctx.response.body = {
          success: false,
          error: `File type '${mimeType}' is not allowed. Allowed: ${[...allowedTypes].join(", ")}`,
        };
        return;
      }

      const ext = EXT_FROM_MIME[mimeType] ?? ".bin";
      const key = `${crypto.randomUUID()}${ext}`;

      const result = await this.provider.upload(key, file.content, mimeType);

      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: "storage-service",
        level: "info",
        event: "file_uploaded",
        key,
        size: result.size,
        contentType: mimeType,
        provider: this.provider.name,
        traceId: ctx.state.traceId,
      }));

      ctx.response.status = 201;
      ctx.response.body = {
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
        traceId: ctx.state.traceId,
      };
    });

    // Serve a file by key
    this.router.get("/files/:key", async (ctx) => {
      const key = ctx.params.key;

      if (!VALID_KEY_RE.test(key)) {
        ctx.response.status = 400;
        ctx.response.body = { success: false, error: "Invalid file key" };
        return;
      }

      const result = await this.provider.download(key);
      if (!result) {
        ctx.response.status = 404;
        ctx.response.body = { success: false, error: "File not found" };
        return;
      }

      ctx.response.headers.set("Content-Type", result.contentType);
      ctx.response.headers.set("Cache-Control", "public, max-age=31536000, immutable");
      ctx.response.body = result.data;
    });

    // Delete a file by key
    this.router.delete("/files/:key", async (ctx) => {
      if (!requireApiKey(ctx)) return;

      const key = ctx.params.key;

      if (!VALID_KEY_RE.test(key)) {
        ctx.response.status = 400;
        ctx.response.body = { success: false, error: "Invalid file key" };
        return;
      }

      await this.provider.delete(key);

      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: "storage-service",
        level: "info",
        event: "file_deleted",
        key,
        provider: this.provider.name,
        traceId: ctx.state.traceId,
      }));

      ctx.response.body = {
        success: true,
        timestamp: new Date().toISOString(),
        traceId: ctx.state.traceId,
      };
    });

    // List registered providers (useful for debugging and health checks)
    this.router.get("/providers", (ctx) => {
      ctx.response.body = {
        success: true,
        data: { active: this.provider.name, registered: listProviders() },
        timestamp: new Date().toISOString(),
      };
    });
  }
}

function initProviders(storagePath: string, publicUrl: string) {
  registerProvider(new LocalStorageProvider(storagePath, publicUrl));
  registerProvider(new S3StorageProvider());
  registerProvider(new AzureBlobStorageProvider());
}

async function ensureStoragePath(path: string) {
  try {
    await Deno.mkdir(path, { recursive: true });
  } catch (err) {
    if (!(err instanceof Deno.errors.AlreadyExists)) throw err;
  }
}

const storagePath = Deno.env.get("STORAGE_PATH") || "./uploads";
const publicUrl = Deno.env.get("STORAGE_PUBLIC_URL") || "http://localhost:3007";
const providerName = Deno.env.get("STORAGE_PROVIDER") || "local";

const config: ServiceConfig = {
  name: "storage-service",
  port: parseInt(Deno.env.get("PORT") || "3007"),
  version: "1.0.0",
};

await ensureStoragePath(storagePath);
initProviders(storagePath, publicUrl);

const provider = getProvider(providerName);

const service = new StorageService(config);
service.setProvider(provider);
await service.start();
