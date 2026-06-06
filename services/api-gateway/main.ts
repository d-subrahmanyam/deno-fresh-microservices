// API Gateway - single entry point for all microservice requests

import {
  Application,
  Router,
  Context,
  Middleware,
} from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { ServiceClient } from "../../shared/utils/http-client.ts";
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
} from "../../shared/utils/telemetry.ts";

initTelemetry("api-gateway", "1.0.0");

// Service client instances
const productsService = new ServiceClient(
  Deno.env.get("PRODUCTS_SERVICE_URL") || "http://localhost:3003",
  "api-gateway"
);

const ordersService = new ServiceClient(
  Deno.env.get("ORDERS_SERVICE_URL") || "http://localhost:3004",
  "api-gateway"
);

const cartService = new ServiceClient(
  Deno.env.get("CART_SERVICE_URL") || "http://localhost:3005",
  "api-gateway"
);

const paymentGatewayService = new ServiceClient(
  Deno.env.get("PAYMENT_GATEWAY_SERVICE_URL") || "http://localhost:3001",
  "api-gateway"
);

const analyticsService = new ServiceClient(
  Deno.env.get("ANALYTICS_SERVICE_URL") || "http://localhost:3006",
  "api-gateway"
);

// Rate limiting middleware
const rateLimits = new Map<
  string,
  { count: number; resetTime: number }
>();

function rateLimiter(maxRequests: number, windowMs: number): Middleware {
  return async (ctx, next) => {
    const clientIp = ctx.request.ip;
    const now = Date.now();

    let limit = rateLimits.get(clientIp);

    if (!limit || now > limit.resetTime) {
      limit = { count: 0, resetTime: now + windowMs };
      rateLimits.set(clientIp, limit);
    }

    limit.count++;

    ctx.response.headers.set("X-RateLimit-Limit", maxRequests.toString());
    ctx.response.headers.set(
      "X-RateLimit-Remaining",
      Math.max(0, maxRequests - limit.count).toString()
    );
    ctx.response.headers.set("X-RateLimit-Reset", limit.resetTime.toString());

    if (limit.count > maxRequests) {
      ctx.response.status = 429;
      ctx.response.body = {
        success: false,
        error: "Too many requests. Please try again later.",
        timestamp: new Date().toISOString(),
      };
      return;
    }

    await next();
  };
}

// Tracing middleware — creates OTel SERVER span and propagates W3C traceparent
function tracingMiddleware(): Middleware {
  const tracer = getTracer("api-gateway");
  return async (ctx, next) => {
    const inCarrier: Record<string, string> = {};
    ctx.request.headers.forEach((v, k) => { inCarrier[k] = v; });
    const parentCtx = propagation.extract(ROOT_CONTEXT, inCarrier);

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
    const traceId = span.isRecording()
      ? span.spanContext().traceId
      : (ctx.request.headers.get("X-Trace-Id") || crypto.randomUUID());

    ctx.state.traceId = traceId;
    ctx.response.headers.set("X-Trace-Id", traceId);

    const outCarrier: Record<string, string> = {};
    propagation.inject(activeCtx, outCarrier);
    for (const [k, v] of Object.entries(outCarrier)) {
      ctx.response.headers.set(k, v);
    }

    const start = Date.now();
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
      const duration = Date.now() - start;
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: "api-gateway",
        traceId,
        method: ctx.request.method,
        path: ctx.request.url.pathname,
        status: ctx.response.status,
        durationMs: duration,
      }));
    }
  };
}

const app = new Application();
const router = new Router();

// Apply middleware
app.use(tracingMiddleware());
app.use(rateLimiter(1000, 60000)); // 1000 requests per minute

// Health endpoint
router.get("/health", (ctx) => {
  ctx.response.body = { status: "healthy", service: "api-gateway" };
});

// === Products Routes ===
router.all("/api/products/:path*", async (ctx) => {
  const path =
    `/api/products${ctx.params.path ? `/${ctx.params.path}` : ""}${ctx.request.url.search}`;
  const result = await productsService.request(
    ctx.request.method,
    path,
    ctx.request.hasBody ? await ctx.request.body().value : undefined,
    { traceId: ctx.state.traceId }
  );
  ctx.response.body = result;
});

// === Aggregation Endpoints ===

// Get cart with product details
router.get("/api/carts/:userId/details", async (ctx) => {
  const userId = ctx.params.userId;
  const traceId = ctx.state.traceId;

  const cartResult = await cartService.get(`/api/carts/${userId}`, {
    traceId,
  });

  if (!cartResult.success) {
    ctx.response.status = 404;
    ctx.response.body = cartResult;
    return;
  }

  // Fetch product details for each item
  const itemsWithDetails = await Promise.all(
    cartResult.data!.items.map(async (item) => {
      const productResult = await productsService.get(
        `/api/products/${item.productId}`,
        { traceId }
      );
      return {
        ...item,
        product: productResult.data || null,
      };
    })
  );

  ctx.response.body = {
    success: true,
    data: {
      cart: cartResult.data,
      itemsWithDetails,
    },
    timestamp: new Date().toISOString(),
    traceId,
  };
});

// === Carts Routes ===
router.all("/api/carts/:path*", async (ctx) => {
  const path =
    `/api/carts${ctx.params.path ? `/${ctx.params.path}` : ""}${ctx.request.url.search}`;
  const result = await cartService.request(
    ctx.request.method,
    path,
    ctx.request.hasBody ? await ctx.request.body().value : undefined,
    { traceId: ctx.state.traceId }
  );
  ctx.response.body = result;
});

// === Orders Routes ===
router.all("/api/orders/:path*", async (ctx) => {
  const path =
    `/api/orders${ctx.params.path ? `/${ctx.params.path}` : ""}${ctx.request.url.search}`;
  const result = await ordersService.request(
    ctx.request.method,
    path,
    ctx.request.hasBody ? await ctx.request.body().value : undefined,
    { traceId: ctx.state.traceId }
  );
  ctx.response.body = result;
});

// === Analytics Routes ===
router.all("/api/events/:path*", async (ctx) => {
  const path =
    `/api/events${ctx.params.path ? `/${ctx.params.path}` : ""}${ctx.request.url.search}`;
  const result = await analyticsService.request(
    ctx.request.method,
    path,
    ctx.request.hasBody ? await ctx.request.body().value : undefined,
    { traceId: ctx.state.traceId }
  );
  ctx.response.body = result;
});

router.all("/api/events", async (ctx) => {
  const result = await analyticsService.request(
    ctx.request.method,
    `/api/events${ctx.request.url.search}`,
    ctx.request.hasBody ? await ctx.request.body().value : undefined,
    { traceId: ctx.state.traceId }
  );
  ctx.response.body = result;
});

// === Payments Routes ===
router.all("/api/payments/:path*", async (ctx) => {
  const path =
    `/api/payments${ctx.params.path ? `/${ctx.params.path}` : ""}${ctx.request.url.search}`;
  const result = await paymentGatewayService.request(
    ctx.request.method,
    path,
    ctx.request.hasBody ? await ctx.request.body().value : undefined,
    { traceId: ctx.state.traceId }
  );
  ctx.response.body = result;
});

app.use(router.routes());
app.use(router.allowedMethods());

const port = parseInt(Deno.env.get("PORT") || "3000");
console.log(`API Gateway starting on port ${port}`);

// Handle graceful shutdown — flush OTel spans before exit
const abortController = new AbortController();
Deno.addSignalListener("SIGINT", async () => {
  await shutdownTelemetry();
  abortController.abort();
});
Deno.addSignalListener("SIGTERM", async () => {
  await shutdownTelemetry();
  abortController.abort();
});

await app.listen({
  port,
  signal: abortController.signal,
});
