// HTTP client for inter-service communication with retry, tracing, and OTel support
import { ApiResponse } from "../types/mod.ts";
import { trace, propagation, context, SpanKind, SpanStatusCode } from "./telemetry.ts";

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

  // Make HTTP request with automatic retry, timeout, and distributed tracing
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

    // Create an outgoing CLIENT span as a child of whatever span is active
    const activeCtx = context.active();
    const tracer = trace.getTracer(this.serviceName);
    const span = tracer.startSpan(`HTTP ${method} ${this.serviceName}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        "http.method": method,
        "http.url": `${this.baseUrl}${path}`,
        "peer.service": this.serviceName,
      },
    }, activeCtx);

    const spanCtx = trace.setSpan(activeCtx, span);

    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Source-Service": this.serviceName,
      ...headers,
    };

    // Keep X-Trace-Id for backward compat with log correlation
    if (traceId) requestHeaders["X-Trace-Id"] = traceId;

    // Inject W3C traceparent so the receiving service continues the trace tree
    propagation.inject(spanCtx, requestHeaders);

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
        span.setAttribute("http.status_code", response.status);
        span.setStatus({ code: response.ok ? SpanStatusCode.OK : SpanStatusCode.ERROR });
        span.end();
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

    span.setStatus({ code: SpanStatusCode.ERROR, message: lastError?.message ?? "unknown" });
    span.end();

    return {
      success: false,
      error: `Service ${this.serviceName} unavailable: ${lastError?.message}`,
      timestamp: new Date().toISOString(),
      traceId,
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
