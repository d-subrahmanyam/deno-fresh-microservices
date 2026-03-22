// API Gateway - single entry point for all microservice requests

import {
  Application,
  Router,
  Context,
  Middleware,
} from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { ServiceClient } from "../../shared/utils/http-client.ts";

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

// Tracing middleware
function tracingMiddleware(): Middleware {
  return async (ctx, next) => {
    const traceId = ctx.request.headers.get("X-Trace-Id") ||
      crypto.randomUUID();
    const start = Date.now();

    ctx.state.traceId = traceId;
    ctx.response.headers.set("X-Trace-Id", traceId);

    await next();

    const duration = Date.now() - start;
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        service: "api-gateway",
        traceId,
        method: ctx.request.method,
        path: ctx.request.url.pathname,
        status: ctx.response.status,
        duration: `${duration}ms`,
      })
    );
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

app.use(router.routes());
app.use(router.allowedMethods());

const port = parseInt(Deno.env.get("PORT") || "3000");
console.log(`API Gateway starting on port ${port}`);

// Handle graceful shutdown
const abortController = new AbortController();
Deno.addSignalListener("SIGINT", () => abortController.abort());
Deno.addSignalListener("SIGTERM", () => abortController.abort());

await app.listen({
  port,
  signal: abortController.signal,
});
