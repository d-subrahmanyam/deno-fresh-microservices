import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { BaseService, ServiceConfig } from "../../shared/base-service.ts";
import {
  Payment,
  PaymentStatus,
  ChargeRequest,
  ApiResponse,
  ComponentHealth,
} from "../../shared/types/mod.ts";
import { ServiceClient } from "../../shared/utils/http-client.ts";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { connect } from "https://deno.land/x/redis@v0.32.3/mod.ts";
import { registerProvider, getProvider, listProviders } from "./providers/mod.ts";
import { MockProvider } from "./providers/mock.ts";

let dbClient: Client;
let redisClient: any;
let ordersServiceClient: ServiceClient;

class PaymentGatewayService extends BaseService {
  constructor(config: ServiceConfig) {
    super(config);
  }

  protected async checkDependencies(): Promise<Record<string, ComponentHealth>> {
    const checks: Record<string, ComponentHealth> = {};

    try {
      const start = Date.now();
      await dbClient.queryArray("SELECT 1");
      checks.database = { status: "healthy", latency: Date.now() - start };
    } catch (error) {
      checks.database = {
        status: "unhealthy",
        message: error instanceof Error ? error.message : "Database error",
      };
    }

    try {
      const start = Date.now();
      await redisClient.ping();
      checks.redis = { status: "healthy", latency: Date.now() - start };
    } catch (error) {
      checks.redis = {
        status: "unhealthy",
        message: error instanceof Error ? error.message : "Redis error",
      };
    }

    return checks;
  }

  protected setupRoutes() {
    // Single-step charge
    this.router.post("/api/payments/charge", async (ctx) => {
      const body = await ctx.request.body().value;
      const result = await this.charge(body, ctx.state.traceId);
      ctx.response.status = result.success ? 201 : 422;
      ctx.response.body = result;
    });

    // Authorize (reserve funds, capture later)
    this.router.post("/api/payments/authorize", async (ctx) => {
      const body = await ctx.request.body().value;
      const result = await this.authorize(body, ctx.state.traceId);
      ctx.response.status = result.success ? 201 : 422;
      ctx.response.body = result;
    });

    // Capture previously authorized payment
    this.router.post("/api/payments/:id/capture", async (ctx) => {
      const body = await ctx.request.body().value;
      const result = await this.capture(ctx.params.id, body?.amount, ctx.state.traceId);
      ctx.response.status = result.success ? 200 : 422;
      ctx.response.body = result;
    });

    // Void authorization
    this.router.post("/api/payments/:id/void", async (ctx) => {
      const result = await this.voidPayment(ctx.params.id, ctx.state.traceId);
      ctx.response.status = result.success ? 200 : 422;
      ctx.response.body = result;
    });

    // Refund captured payment
    this.router.post("/api/payments/:id/refund", async (ctx) => {
      const body = await ctx.request.body().value;
      const result = await this.refund(ctx.params.id, body?.amount, ctx.state.traceId);
      ctx.response.status = result.success ? 200 : 422;
      ctx.response.body = result;
    });

    // Get payment by ID
    this.router.get("/api/payments/:id", async (ctx) => {
      const result = await this.getPayment(ctx.params.id, ctx.state.traceId);
      ctx.response.status = result.success ? 200 : 404;
      ctx.response.body = result;
    });

    // List payments (filter by orderId, userId, status)
    this.router.get("/api/payments", async (ctx) => {
      const orderId = ctx.request.url.searchParams.get("orderId");
      const userId = ctx.request.url.searchParams.get("userId");
      const status = ctx.request.url.searchParams.get("status");
      const limit = parseInt(ctx.request.url.searchParams.get("limit") || "20");
      const offset = parseInt(ctx.request.url.searchParams.get("offset") || "0");
      const result = await this.listPayments(orderId, userId, status, limit, offset, ctx.state.traceId);
      ctx.response.body = result;
    });

    // List available providers (useful for debugging / admin)
    this.router.get("/api/payments/providers", (ctx) => {
      ctx.response.body = {
        success: true,
        data: listProviders(),
        timestamp: new Date().toISOString(),
      };
    });
  }

  private async charge(data: any, traceId: string): Promise<ApiResponse<Payment>> {
    return await this.processPayment(data, PaymentStatus.CAPTURED, "charge", traceId);
  }

  private async authorize(data: any, traceId: string): Promise<ApiResponse<Payment>> {
    return await this.processPayment(data, PaymentStatus.AUTHORIZED, "authorize", traceId);
  }

  private async processPayment(
    data: any,
    successStatus: PaymentStatus,
    operation: "charge" | "authorize",
    traceId: string,
  ): Promise<ApiResponse<Payment>> {
    const providerName = Deno.env.get("PAYMENT_PROVIDER") || "mock";

    if (!data?.orderId || !data?.userId || !data?.amount || !data?.paymentMethod) {
      return {
        success: false,
        error: "orderId, userId, amount, and paymentMethod are required",
        timestamp: new Date().toISOString(),
        traceId,
      };
    }

    const req: ChargeRequest = {
      orderId: data.orderId,
      userId: data.userId,
      amount: data.amount,
      currency: data.currency || "USD",
      paymentMethod: data.paymentMethod,
    };

    const id = crypto.randomUUID();
    const now = new Date();

    // Persist as pending before calling provider
    await this.insertPayment(id, req, PaymentStatus.PROCESSING, providerName, now);

    let providerResult;
    try {
      const provider = getProvider(providerName);
      providerResult = operation === "charge"
        ? await provider.charge(req)
        : await provider.authorize(req);
    } catch (error) {
      await this.updatePayment(id, PaymentStatus.FAILED, undefined, "Provider error", now);
      throw error;
    }

    if (!providerResult.success) {
      await this.updatePayment(id, PaymentStatus.FAILED, undefined, providerResult.errorCode, now);
      await this.updateOrderStatus(data.orderId, "cancelled", traceId);
      console.log(JSON.stringify({
        timestamp: now.toISOString(),
        service: "payment-gateway",
        traceId,
        level: "warn",
        event: "payment_declined",
        paymentId: id,
        orderId: data.orderId,
        userId: data.userId,
        amount: data.amount,
        provider: providerName,
        errorCode: providerResult.errorCode,
      }));
      return {
        success: false,
        error: providerResult.errorCode ?? "payment_failed",
        timestamp: now.toISOString(),
        traceId,
      };
    }

    await this.updatePayment(id, successStatus, providerResult.transactionId, undefined, now);
    await this.updateOrderStatus(data.orderId, "confirmed", traceId);
    console.log(JSON.stringify({
      timestamp: now.toISOString(),
      service: "payment-gateway",
      traceId,
      level: "info",
      event: "payment_charged",
      paymentId: id,
      orderId: data.orderId,
      userId: data.userId,
      amount: data.amount,
      currency: req.currency,
      provider: providerName,
      providerTransactionId: providerResult.transactionId,
    }));

    const payment = await this.fetchPaymentRow(id);
    return { success: true, data: payment, timestamp: now.toISOString(), traceId };
  }

  private async capture(
    paymentId: string,
    amount: number | undefined,
    traceId: string,
  ): Promise<ApiResponse<Payment>> {
    const payment = await this.fetchPaymentRow(paymentId);
    if (!payment) {
      return { success: false, error: "Payment not found", timestamp: new Date().toISOString(), traceId };
    }
    if (payment.status !== PaymentStatus.AUTHORIZED) {
      return { success: false, error: "Only authorized payments can be captured", timestamp: new Date().toISOString(), traceId };
    }

    const provider = getProvider(payment.provider);
    const result = await provider.capture(payment.providerTransactionId!, amount);
    if (!result.success) {
      return { success: false, error: result.errorCode ?? "capture_failed", timestamp: new Date().toISOString(), traceId };
    }

    await this.updatePayment(paymentId, PaymentStatus.CAPTURED, result.transactionId, undefined, new Date());
    await this.updateOrderStatus(payment.orderId, "confirmed", traceId);
    return { success: true, data: await this.fetchPaymentRow(paymentId), timestamp: new Date().toISOString(), traceId };
  }

  private async voidPayment(paymentId: string, traceId: string): Promise<ApiResponse<Payment>> {
    const payment = await this.fetchPaymentRow(paymentId);
    if (!payment) {
      return { success: false, error: "Payment not found", timestamp: new Date().toISOString(), traceId };
    }
    if (payment.status !== PaymentStatus.AUTHORIZED) {
      return { success: false, error: "Only authorized payments can be voided", timestamp: new Date().toISOString(), traceId };
    }

    const provider = getProvider(payment.provider);
    const result = await provider.void(payment.providerTransactionId!);
    if (!result.success) {
      return { success: false, error: result.errorCode ?? "void_failed", timestamp: new Date().toISOString(), traceId };
    }

    await this.updatePayment(paymentId, PaymentStatus.VOIDED, undefined, undefined, new Date());
    await this.updateOrderStatus(payment.orderId, "cancelled", traceId);
    return { success: true, data: await this.fetchPaymentRow(paymentId), timestamp: new Date().toISOString(), traceId };
  }

  private async refund(
    paymentId: string,
    amount: number | undefined,
    traceId: string,
  ): Promise<ApiResponse<Payment>> {
    const payment = await this.fetchPaymentRow(paymentId);
    if (!payment) {
      return { success: false, error: "Payment not found", timestamp: new Date().toISOString(), traceId };
    }
    if (payment.status !== PaymentStatus.CAPTURED) {
      return { success: false, error: "Only captured payments can be refunded", timestamp: new Date().toISOString(), traceId };
    }

    const provider = getProvider(payment.provider);
    const result = await provider.refund(payment.providerTransactionId!, amount);
    if (!result.success) {
      return { success: false, error: result.errorCode ?? "refund_failed", timestamp: new Date().toISOString(), traceId };
    }

    await this.updatePayment(paymentId, PaymentStatus.REFUNDED, undefined, undefined, new Date());
    return { success: true, data: await this.fetchPaymentRow(paymentId), timestamp: new Date().toISOString(), traceId };
  }

  private async getPayment(id: string, traceId: string): Promise<ApiResponse<Payment>> {
    const payment = await this.fetchPaymentRow(id);
    if (!payment) {
      return { success: false, error: "Payment not found", timestamp: new Date().toISOString(), traceId };
    }
    return { success: true, data: payment, timestamp: new Date().toISOString(), traceId };
  }

  private async listPayments(
    orderId: string | null,
    userId: string | null,
    status: string | null,
    limit: number,
    offset: number,
    traceId: string,
  ): Promise<ApiResponse<Payment[]>> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (orderId) { conditions.push(`order_id = $${idx++}`); params.push(orderId); }
    if (userId) { conditions.push(`user_id = $${idx++}`); params.push(userId); }
    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit, offset);

    const result = await dbClient.queryObject<any>(
      `SELECT id, order_id as "orderId", user_id as "userId", amount, currency, status, provider,
              provider_transaction_id as "providerTransactionId", failure_reason as "failureReason",
              metadata, created_at as "createdAt", updated_at as "updatedAt"
       FROM payments ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      params,
    );

    return { success: true, data: result.rows as Payment[], timestamp: new Date().toISOString(), traceId };
  }

  // --- DB helpers ---

  private async insertPayment(
    id: string,
    req: ChargeRequest,
    status: PaymentStatus,
    provider: string,
    now: Date,
  ): Promise<void> {
    await dbClient.queryArray(
      `INSERT INTO payments (id, order_id, user_id, amount, currency, status, provider, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, req.orderId, req.userId, req.amount, req.currency, status, provider, now, now],
    );
  }

  private async updatePayment(
    id: string,
    status: PaymentStatus,
    providerTransactionId: string | undefined,
    failureReason: string | undefined,
    now: Date,
  ): Promise<void> {
    await dbClient.queryArray(
      `UPDATE payments SET status = $1, provider_transaction_id = COALESCE($2, provider_transaction_id),
       failure_reason = $3, updated_at = $4 WHERE id = $5`,
      [status, providerTransactionId ?? null, failureReason ?? null, now, id],
    );
  }

  private async fetchPaymentRow(id: string): Promise<Payment | null> {
    const result = await dbClient.queryObject<any>(
      `SELECT id, order_id as "orderId", user_id as "userId", amount, currency, status, provider,
              provider_transaction_id as "providerTransactionId", failure_reason as "failureReason",
              metadata, created_at as "createdAt", updated_at as "updatedAt"
       FROM payments WHERE id = $1`,
      [id],
    );
    return result.rows.length > 0 ? (result.rows[0] as Payment) : null;
  }

  private async updateOrderStatus(orderId: string, status: string, traceId: string): Promise<void> {
    try {
      await ordersServiceClient.put(`/api/orders/${orderId}/status`, { status }, { traceId });
    } catch (error) {
      // Log but don't fail the payment response — order status sync is best-effort
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: "payment-gateway",
        traceId,
        error: `Failed to update order ${orderId} status to ${status}: ${error instanceof Error ? error.message : String(error)}`,
      }));
    }
  }

  protected async cleanup(): Promise<void> {
    await dbClient.end();
  }
}

async function initDatabase() {
  dbClient = new Client({
    hostname: Deno.env.get("DB_HOST") || "localhost",
    port: parseInt(Deno.env.get("DB_PORT") || "5432"),
    user: Deno.env.get("DB_USER") || "postgres",
    password: Deno.env.get("DB_PASSWORD") || "postgres",
    database: Deno.env.get("DB_NAME") || "payments",
  });

  await dbClient.connect();

  await dbClient.queryArray(`
    CREATE TABLE IF NOT EXISTS payments (
      id UUID PRIMARY KEY,
      order_id VARCHAR(255) NOT NULL,
      user_id VARCHAR(255) NOT NULL,
      amount DECIMAL(10, 2) NOT NULL,
      currency VARCHAR(3) NOT NULL DEFAULT 'USD',
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      provider VARCHAR(50) NOT NULL,
      provider_transaction_id VARCHAR(255),
      failure_reason TEXT,
      metadata JSONB,
      created_at TIMESTAMP NOT NULL,
      updated_at TIMESTAMP NOT NULL
    )
  `);
}

async function initRedis() {
  redisClient = await connect({
    hostname: Deno.env.get("REDIS_HOST") || "localhost",
    port: parseInt(Deno.env.get("REDIS_PORT") || "6379"),
  });
}

function initProviders() {
  const processorUrl = Deno.env.get("PAYMENT_PROCESSOR_URL") || "http://localhost:3002";
  registerProvider(new MockProvider(processorUrl));
  // To add more providers: registerProvider(new StripeProvider(apiKey));
}

const config: ServiceConfig = {
  name: "payment-gateway",
  port: parseInt(Deno.env.get("PORT") || "3001"),
  version: "1.0.0",
};

ordersServiceClient = new ServiceClient(
  Deno.env.get("ORDERS_SERVICE_URL") || "http://localhost:3004",
  "payment-gateway",
);

await initDatabase();
await initRedis();
initProviders();

const service = new PaymentGatewayService(config);
await service.start();
