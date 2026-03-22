import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { BaseService, ServiceConfig } from "../../shared/base-service.ts";
import {
  Order,
  OrderStatus,
  ApiResponse,
  ComponentHealth,
} from "../../shared/types/mod.ts";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { connect } from "https://deno.land/x/redis@v0.32.3/mod.ts";

let dbClient: Client;
let redisClient: any;

class OrdersService extends BaseService {
  constructor(config: ServiceConfig) {
    super(config);
  }

  protected async checkDependencies(): Promise<
    Record<string, ComponentHealth>
  > {
    const checks: Record<string, ComponentHealth> = {};

    try {
      const start = Date.now();
      await dbClient.queryArray("SELECT 1");
      checks.database = {
        status: "healthy",
        latency: Date.now() - start,
      };
    } catch (error) {
      checks.database = {
        status: "unhealthy",
        message: error instanceof Error ? error.message : "Database error",
      };
    }

    try {
      const start = Date.now();
      await redisClient.ping();
      checks.redis = {
        status: "healthy",
        latency: Date.now() - start,
      };
    } catch (error) {
      checks.redis = {
        status: "unhealthy",
        message: error instanceof Error ? error.message : "Redis error",
      };
    }

    return checks;
  }

  protected setupRoutes() {
    // Create new order
    this.router.post("/api/orders", async (ctx) => {
      const body = await ctx.request.body().value;
      const result = await this.createOrder(body, ctx.state.traceId);

      ctx.response.status = result.success ? 201 : 400;
      ctx.response.body = result;
    });

    // Get order by ID
    this.router.get("/api/orders/:id", async (ctx) => {
      const orderId = ctx.params.id;
      const result = await this.getOrder(orderId, ctx.state.traceId);

      ctx.response.status = result.success ? 200 : 404;
      ctx.response.body = result;
    });

    // Get user's orders
    this.router.get("/api/orders", async (ctx) => {
      const userId = ctx.request.url.searchParams.get("userId");
      const status = ctx.request.url.searchParams.get("status");
      const limit = parseInt(
        ctx.request.url.searchParams.get("limit") || "20"
      );
      const offset = parseInt(
        ctx.request.url.searchParams.get("offset") || "0"
      );

      const result = await this.listOrders(
        userId,
        status,
        limit,
        offset,
        ctx.state.traceId
      );

      ctx.response.body = result;
    });

    // Update order status
    this.router.put("/api/orders/:id/status", async (ctx) => {
      const orderId = ctx.params.id;
      const body = await ctx.request.body().value;
      const result = await this.updateOrderStatus(
        orderId,
        body.status,
        ctx.state.traceId
      );

      ctx.response.status = result.success ? 200 : 400;
      ctx.response.body = result;
    });
  }

  private async createOrder(
    data: any,
    traceId: string
  ): Promise<ApiResponse<Order>> {
    if (!data.userId || !data.items || data.items.length === 0) {
      return {
        success: false,
        error: "UserId and items are required",
        timestamp: new Date().toISOString(),
        traceId,
      };
    }

    try {
      const id = crypto.randomUUID();
      const now = new Date();
      const total = data.items.reduce(
        (sum: number, item: any) => sum + item.price * item.quantity,
        0
      );

      await dbClient.queryArray(
        `INSERT INTO orders (id, user_id, items, total, status, shipping_address, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          data.userId,
          JSON.stringify(data.items),
          total,
          "pending",
          data.shippingAddress || "",
          now,
          now,
        ]
      );

      // Publish order created event to Redis
      await redisClient.publish(
        "orders:created",
        JSON.stringify({ orderId: id, userId: data.userId })
      );

      const order: Order = {
        id,
        userId: data.userId,
        items: data.items,
        total,
        status: OrderStatus.PENDING,
        shippingAddress: data.shippingAddress || "",
        createdAt: now,
        updatedAt: now,
      };

      return {
        success: true,
        data: order,
        timestamp: new Date().toISOString(),
        traceId,
      };
    } catch (error) {
      throw error;
    }
  }

  private async getOrder(
    orderId: string,
    traceId: string
  ): Promise<ApiResponse<Order>> {
    const result = await dbClient.queryObject<any>(
      `SELECT id, user_id as "userId", items, total, status, shipping_address as "shippingAddress", created_at as "createdAt", updated_at as "updatedAt"
       FROM orders WHERE id = $1`,
      [orderId]
    );

    if (result.rows.length === 0) {
      return {
        success: false,
        error: "Order not found",
        timestamp: new Date().toISOString(),
        traceId,
      };
    }

    const row = result.rows[0];
    const order: Order = {
      ...row,
      items: typeof row.items === "string" ? JSON.parse(row.items) : row.items,
    };

    return {
      success: true,
      data: order,
      timestamp: new Date().toISOString(),
      traceId,
    };
  }

  private async listOrders(
    userId: string | null,
    status: string | null,
    limit: number,
    offset: number,
    traceId: string
  ): Promise<ApiResponse<Order[]>> {
    let query =
      `SELECT id, user_id as "userId", items, total, status, shipping_address as "shippingAddress", created_at as "createdAt", updated_at as "updatedAt"
       FROM orders`;
    const params: unknown[] = [];
    let paramIndex = 1;

    if (userId) {
      query += ` WHERE user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    if (status) {
      query += userId ? ` AND status = $${paramIndex}` : ` WHERE status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await dbClient.queryObject<any>(query, params);

    const orders = result.rows.map((row) => ({
      ...row,
      items: typeof row.items === "string" ? JSON.parse(row.items) : row.items,
    }));

    return {
      success: true,
      data: orders,
      timestamp: new Date().toISOString(),
      traceId,
    };
  }

  private async updateOrderStatus(
    orderId: string,
    newStatus: string,
    traceId: string
  ): Promise<ApiResponse<Order>> {
    const validStatuses = Object.values(OrderStatus);
    if (!validStatuses.includes(newStatus)) {
      return {
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        timestamp: new Date().toISOString(),
        traceId,
      };
    }

    const now = new Date();
    const result = await dbClient.queryObject<any>(
      `UPDATE orders SET status = $1, updated_at = $2 WHERE id = $3 RETURNING *`,
      [newStatus, now, orderId]
    );

    if (result.rows.length === 0) {
      return {
        success: false,
        error: "Order not found",
        timestamp: new Date().toISOString(),
        traceId,
      };
    }

    const row = result.rows[0];
    const order: Order = {
      userId: row.user_id,
      id: row.id,
      items: typeof row.items === "string" ? JSON.parse(row.items) : row.items,
      total: row.total,
      status: row.status,
      shippingAddress: row.shipping_address,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    // Publish order status changed event
    await redisClient.publish(
      "orders:status-changed",
      JSON.stringify({ orderId, status: newStatus })
    );

    return {
      success: true,
      data: order,
      timestamp: new Date().toISOString(),
      traceId,
    };
  }

  protected async cleanup(): Promise<void> {
    await dbClient.end();
    // Note: Redis connection will be closed automatically
  }
}

async function initDatabase() {
  dbClient = new Client({
    hostname: Deno.env.get("DB_HOST") || "localhost",
    port: parseInt(Deno.env.get("DB_PORT") || "5432"),
    user: Deno.env.get("DB_USER") || "postgres",
    password: Deno.env.get("DB_PASSWORD") || "postgres",
    database: Deno.env.get("DB_NAME") || "orders",
  });

  await dbClient.connect();

  await dbClient.queryArray(`
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      items JSONB NOT NULL,
      total DECIMAL(10, 2) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      shipping_address TEXT,
      created_at TIMESTAMP NOT NULL,
      updated_at TIMESTAMP NOT NULL
    )
  `);

  await dbClient.queryArray(
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address TEXT`
  );
}

async function initRedis() {
  redisClient = await connect({
    hostname: Deno.env.get("REDIS_HOST") || "localhost",
    port: parseInt(Deno.env.get("REDIS_PORT") || "6379"),
  });
}

const config: ServiceConfig = {
  name: "orders-service",
  port: parseInt(Deno.env.get("PORT") || "3004"),
  version: "1.0.0",
};

await initDatabase();
await initRedis();
const service = new OrdersService(config);
await service.start();
