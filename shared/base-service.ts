// Base service class that provides common microservice functionality
import {
  Application,
  Router,
  Context,
  Middleware,
} from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { HealthStatus, ComponentHealth } from "./types/mod.ts";

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

    this.setupMiddleware();
    this.setupHealthEndpoints();
  }

  private setupMiddleware() {
    this.app.use(this.loggingMiddleware());
    this.app.use(this.tracingMiddleware());
    this.app.use(this.errorMiddleware());
  }

  private loggingMiddleware(): Middleware {
    return async (ctx, next) => {
      const start = Date.now();
      const traceId = ctx.request.headers.get("X-Trace-Id") ||
        crypto.randomUUID();

      ctx.state.traceId = traceId;

      await next();

      const duration = Date.now() - start;
      const logEntry = {
        timestamp: new Date().toISOString(),
        service: this.config.name,
        traceId,
        method: ctx.request.method,
        url: ctx.request.url.pathname,
        status: ctx.response.status,
        duration: `${duration}ms`,
      };

      console.log(JSON.stringify(logEntry));
    };
  }

  private tracingMiddleware(): Middleware {
    return async (ctx, next) => {
      const traceId = ctx.state.traceId || crypto.randomUUID();
      ctx.response.headers.set("X-Trace-Id", traceId);
      await next();
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

    console.log(
      `${this.config.name} starting on port ${this.config.port}`
    );

    await this.app.listen({
      port: this.config.port,
      signal: abortController.signal,
    });
  }

  private async shutdown(controller: AbortController) {
    console.log(`${this.config.name} shutting down gracefully...`);
    this.isShuttingDown = true;

    await new Promise((resolve) => setTimeout(resolve, 5000));

    await this.cleanup();

    controller.abort();
    console.log(`${this.config.name} shutdown complete`);
  }

  protected async cleanup(): Promise<void> {
    // Default implementation does nothing
  }
}
