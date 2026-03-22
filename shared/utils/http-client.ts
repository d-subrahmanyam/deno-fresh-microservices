// HTTP client for inter-service communication with retry and tracing support
import { ApiResponse } from "../types/mod.ts";

interface RequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
  traceId?: string;
}

export class ServiceClient {
  private baseUrl: string;
  private serviceName: string;
  private defaultTimeout: number;

  constructor(baseUrl: string, serviceName: string, defaultTimeout = 5000) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.serviceName = serviceName;
    this.defaultTimeout = defaultTimeout;
  }

  // Make HTTP request with automatic retry and timeout handling
  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const {
      headers = {},
      timeout = this.defaultTimeout,
      retries = 3,
      traceId,
    } = options;

    const requestTraceId = traceId || crypto.randomUUID();

    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Trace-Id": requestTraceId,
      "X-Source-Service": this.serviceName,
      ...headers,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: requestHeaders,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const data = await response.json();
        return data as ApiResponse<T>;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (error instanceof DOMException && error.name === "AbortError") {
          break;
        }

        if (attempt < retries - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, 100 * Math.pow(2, attempt))
          );
        }
      }
    }

    return {
      success: false,
      error: `Service ${this.serviceName} unavailable: ${lastError?.message}`,
      timestamp: new Date().toISOString(),
      traceId: requestTraceId,
    };
  }

  // Convenience methods for common HTTP verbs
  get<T>(path: string, options?: RequestOptions) {
    return this.request<T>("GET", path, undefined, options);
  }

  post<T>(path: string, body: unknown, options?: RequestOptions) {
    return this.request<T>("POST", path, body, options);
  }

  put<T>(path: string, body: unknown, options?: RequestOptions) {
    return this.request<T>("PUT", path, body, options);
  }

  delete<T>(path: string, options?: RequestOptions) {
    return this.request<T>("DELETE", path, undefined, options);
  }
}
