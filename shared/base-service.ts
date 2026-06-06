// Base service class that provides common microservice functionality
import {
  Application,
  Router,
  Context,
  Middleware,
} from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { HealthStatus, ComponentHealth } from "./types/mod.ts";
import {
  initTelemetry,
  shutdownTelemetry,
  getTracer,
  trace,
  propagation,
  context,
  SpanKind,
  SpanStatusCode,
  ROOT_CONTEXT,
} from "./utils/telemetry.ts";

export interface ServiceConfig {
  name: string;
  port: number;
  version: string;
}

export abstract class BaseService {
  protected app: Application;
  protected router: Router;
  protected config: ServiceConfig;
  protected startTime: number;
  protected isShuttingDown = false;

  constructor(config: ServiceConfig) {
    this.config = config;
    this.app = new Application();
    this.router = new Router();
    this.startTime = Date.now();

    initTelemetry(config.name, config.version);
    this.setupMiddleware();
    this.setupHealthEndpoints();
  }

  private setupMiddleware() {
    // OTel spans must be outermost so all downstream middleware runs inside
    // context.with(), enabling automatic context propagation via AsyncLocalStorage.
    this.app.use(this.tracingMiddleware());
    this.app.use(this.loggingMiddleware());
    this.app.use(this.errorMiddleware());
  }

  private loggingMiddleware(): Middleware {
    return async (ctx, next) => {
      const start = Date.now();
      await next();
      const duration = Date.now() - start;
      const status = ctx.response.status;
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: this.config.name,
        traceId: ctx.state.traceId,
        level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
        method: ctx.request.method,
        url: ctx.request.url.pathname,
        status,
        durationMs: duration,
      }));
    };
  }

  private tracingMiddleware(): Middleware {
    const tracer = getTracer(this.config.name);
    return async (ctx, next) => {
      // Extract W3C traceparent/tracestate from the incoming request
      const inCarrier: Record<string, string> = {};
      ctx.request.headers.forEach((v, k) => { inCarrier[k] = v; });
      const parentCtx = propagation.extract(ROOT_CONTEXT, inCarrier);

      // Create an HTTP server span
      const span = tracer.startSpan(
        `${ctx.request.method} ${ctx.request.url.pathname}`,
        {
          kind: SpanKind.SERVER,
          attributes: {
            "http.method": ctx.request.method,
            "http.target": ctx.request.url.pathname,
            "http.host": ctx.request.headers.get("host") ?? "",
          },
        },
        parentCtx,
      );

      const activeCtx = trace.setSpan(parentCtx, span);

      // Use the OTel trace ID when recording; fall back to UUID for no-op spans
      const traceId = span.isRecording()
        ? span.spanContext().traceId
        : (ctx.request.headers.get("X-Trace-Id") || crypto.randomUUID());

      ctx.state.traceId = traceId;
      ctx.response.headers.set("X-Trace-Id", traceId);

      // Propagate traceparent downstream so browsers / other services continue the trace
      const outCarrier: Record<string, string> = {};
      propagation.inject(activeCtx, outCarrier);
      for (const [k, v] of Object.entries(outCarrier)) {
        ctx.response.headers.set(k, v);
      }

      try {
        await context.with(activeCtx, async () => { await next(); });
        span.setAttribute("http.status_code", ctx.response.status);
        span.setStatus({
          code: ctx.response.status >= 500 ? SpanStatusCode.ERROR : SpanStatusCode.OK,
        });
      } catch (err) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : String(err),
        });
        throw err;
      } finally {
        span.end();
      }
    };
  }

  private errorMiddleware(): Middleware {
    return async (ctx, next) => {
      try {
        await next();
      } catch (error) {
        const message = error instanceof Error ? error.message :
          "Internal server error";

        console.error(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            service: this.config.name,
            traceId: ctx.state.traceId,
            level: "error",
            error: message,
            stack: error instanceof Error ? error.stack : undefined,
          })
        );

        ctx.response.status = 500;
        ctx.response.body = {
          success: false,
          error: message,
          timestamp: new Date().toISOString(),
          traceId: ctx.state.traceId,
        };
      }
    };
  }

  private setupHealthEndpoints() {
    this.router.get("/health/live", (ctx) => {
      if (this.isShuttingDown) {
        ctx.response.status = 503;
        ctx.response.body = { status: "shutting_down" };
        return;
      }
      ctx.response.body = { status: "alive" };
    });

    this.router.get("/health/ready", async (ctx) => {
      if (this.isShuttingDown) {
        ctx.response.status = 503;
        ctx.response.body = { status: "shutting_down" };
        return;
      }

      const health = await this.getHealthStatus();
      ctx.response.status = health.status === "healthy" ? 200 : 503;
      ctx.response.body = health;
    });

    this.router.get("/health", async (ctx) => {
      const health = await this.getHealthStatus();
      ctx.response.body = health;
    });
  }

  protected abstract checkDependencies(): Promise<
    Record<string, ComponentHealth>
  >;

  private async getHealthStatus(): Promise<HealthStatus> {
    const checks = await this.checkDependencies();
    const allHealthy = Object.values(checks).every(
      (c) => c.status === "healthy"
    );

    return {
      status: allHealthy ? "healthy" : "unhealthy",
      service: this.config.name,
      version: this.config.version,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks,
    };
  }

  protected abstract setupRoutes(): void;

  async start() {
    this.setupRoutes();

    this.app.use(this.router.routes());
    this.app.use(this.router.allowedMethods());

    const abortController = new AbortController();

    Deno.addSignalListener("SIGINT", () => this.shutdown(abortController));
    Deno.addSignalListener("SIGTERM", () => this.shutdown(abortController));

    console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: this.config.name, level: "info", event: "startup", port: this.config.port, version: this.config.version }));

    await this.app.listen({
      port: this.config.port,
      signal: abortController.signal,
    });
  }

  private async shutdown(controller: AbortController) {
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: this.config.name, level: "info", event: "shutdown_started" }));
    this.isShuttingDown = true;

    await new Promise((resolve) => setTimeout(resolve, 5000));

    await this.cleanup();

    controller.abort();
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: this.config.name, level: "info", event: "shutdown_complete" }));
  }

  protected async cleanup(): Promise<void> {
    await shutdownTelemetry();
  }
}
