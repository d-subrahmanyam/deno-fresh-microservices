import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { BaseService, ServiceConfig } from "../../shared/base-service.ts";
import {
  ProcessorTransaction,
  ApiResponse,
  ComponentHealth,
} from "../../shared/types/mod.ts";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { getCardOutcome, detectBrand } from "./cards.ts";

let dbClient: Client;

class PaymentProcessorService extends BaseService {
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
    return checks;
  }

  protected setupRoutes() {
    // Single-step charge
    this.router.post("/api/process/charge", async (ctx) => {
      const body = await ctx.request.body().value;
      const result = await this.processCharge(body, "charge", ctx.state.traceId);
      ctx.response.status = result.success ? 200 : 422;
      ctx.response.body = result;
    });

    // Two-step: authorize
    this.router.post("/api/process/authorize", async (ctx) => {
      const body = await ctx.request.body().value;
      const result = await this.processCharge(body, "authorize", ctx.state.traceId);
      ctx.response.status = result.success ? 200 : 422;
      ctx.response.body = result;
    });

    // Two-step: capture
    this.router.post("/api/process/:id/capture", async (ctx) => {
      const body = await ctx.request.body().value;
      const result = await this.processFollowUp(
        ctx.params.id,
        "capture",
        body?.amount,
        ctx.state.traceId,
      );
      ctx.response.status = result.success ? 200 : 422;
      ctx.response.body = result;
    });

    // Void authorization
    this.router.post("/api/process/:id/void", async (ctx) => {
      const result = await this.processFollowUp(
        ctx.params.id,
        "void",
        undefined,
        ctx.state.traceId,
      );
      ctx.response.status = result.success ? 200 : 422;
      ctx.response.body = result;
    });

    // Refund captured charge
    this.router.post("/api/process/:id/refund", async (ctx) => {
      const body = await ctx.request.body().value;
      const result = await this.processFollowUp(
        ctx.params.id,
        "refund",
        body?.amount,
        ctx.state.traceId,
      );
      ctx.response.status = result.success ? 200 : 422;
      ctx.response.body = result;
    });

    // Lookup transaction
    this.router.get("/api/transactions/:id", async (ctx) => {
      const result = await this.getTransaction(ctx.params.id, ctx.state.traceId);
      ctx.response.status = result.success ? 200 : 404;
      ctx.response.body = result;
    });
  }

  private async processCharge(
    data: any,
    type: "charge" | "authorize",
    traceId: string,
  ): Promise<ApiResponse<ProcessorTransaction>> {
    if (!data?.cardNumber || !data?.amount || !data?.currency) {
      return {
        success: false,
        error: "cardNumber, amount, and currency are required",
        timestamp: new Date().toISOString(),
        traceId,
      };
    }

    const outcome = getCardOutcome(data.cardNumber);
    const brand = detectBrand(data.cardNumber);
    const cardLast4 = data.cardNumber.replace(/\s/g, "").slice(-4);
    const id = crypto.randomUUID();
    const now = new Date();

    const status = outcome.status === "error" ? "error"
      : outcome.status === "declined" ? "declined"
      : "success";

    await dbClient.queryArray(
      `INSERT INTO transactions (id, type, amount, currency, status, card_last4, card_brand, decline_code, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, type, data.amount, data.currency, status, cardLast4, brand, outcome.declineCode ?? null, now],
    );

    if (status !== "success") {
      return {
        success: false,
        error: outcome.declineCode ?? "payment_failed",
        data: {
          id,
          type,
          amount: data.amount,
          currency: data.currency,
          status,
          cardLast4,
          cardBrand: brand,
          declineCode: outcome.declineCode,
          createdAt: now,
        },
        timestamp: now.toISOString(),
        traceId,
      };
    }

    const transaction: ProcessorTransaction = {
      id,
      type,
      amount: data.amount,
      currency: data.currency,
      status: "success",
      cardLast4,
      cardBrand: brand,
      createdAt: now,
    };

    return { success: true, data: transaction, timestamp: now.toISOString(), traceId };
  }

  private async processFollowUp(
    parentId: string,
    type: "capture" | "void" | "refund",
    amount: number | undefined,
    traceId: string,
  ): Promise<ApiResponse<ProcessorTransaction>> {
    const parent = await dbClient.queryObject<any>(
      `SELECT * FROM transactions WHERE id = $1`,
      [parentId],
    );

    if (parent.rows.length === 0) {
      return {
        success: false,
        error: "Parent transaction not found",
        timestamp: new Date().toISOString(),
        traceId,
      };
    }

    const p = parent.rows[0];
    const id = crypto.randomUUID();
    const now = new Date();
    const useAmount = amount ?? p.amount;

    await dbClient.queryArray(
      `INSERT INTO transactions (id, type, amount, currency, status, card_last4, card_brand, parent_transaction_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, type, useAmount, p.currency, "success", p.card_last4, p.card_brand, parentId, now],
    );

    const transaction: ProcessorTransaction = {
      id,
      type,
      amount: useAmount,
      currency: p.currency,
      status: "success",
      cardLast4: p.card_last4,
      cardBrand: p.card_brand,
      parentTransactionId: parentId,
      createdAt: now,
    };

    return { success: true, data: transaction, timestamp: now.toISOString(), traceId };
  }

  private async getTransaction(
    id: string,
    traceId: string,
  ): Promise<ApiResponse<ProcessorTransaction>> {
    const result = await dbClient.queryObject<any>(
      `SELECT id, type, amount, currency, status, card_last4 as "cardLast4", card_brand as "cardBrand",
              decline_code as "declineCode", parent_transaction_id as "parentTransactionId", created_at as "createdAt"
       FROM transactions WHERE id = $1`,
      [id],
    );

    if (result.rows.length === 0) {
      return {
        success: false,
        error: "Transaction not found",
        timestamp: new Date().toISOString(),
        traceId,
      };
    }

    return {
      success: true,
      data: result.rows[0] as ProcessorTransaction,
      timestamp: new Date().toISOString(),
      traceId,
    };
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
    database: Deno.env.get("DB_NAME") || "payment_processor",
  });

  await dbClient.connect();

  await dbClient.queryArray(`
    CREATE TABLE IF NOT EXISTS transactions (
      id UUID PRIMARY KEY,
      type VARCHAR(20) NOT NULL,
      amount DECIMAL(10, 2) NOT NULL,
      currency VARCHAR(3) NOT NULL DEFAULT 'USD',
      status VARCHAR(20) NOT NULL,
      card_last4 VARCHAR(4),
      card_brand VARCHAR(50),
      decline_code VARCHAR(100),
      parent_transaction_id UUID,
      created_at TIMESTAMP NOT NULL
    )
  `);
}

const config: ServiceConfig = {
  name: "payment-processor",
  port: parseInt(Deno.env.get("PORT") || "3002"),
  version: "1.0.0",
};

await initDatabase();
const service = new PaymentProcessorService(config);
await service.start();
