import { BaseService, ServiceConfig } from "../../shared/base-service.ts";
import { ApiResponse, ComponentHealth } from "../../shared/types/mod.ts";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

let dbClient: Client;

interface AnalyticsEvent {
  id: string;
  event: string;
  sessionId?: string;
  userId?: string;
  traceId?: string;
  properties: Record<string, unknown>;
  page?: string;
  userAgent?: string;
  createdAt: Date;
}

class AnalyticsService extends BaseService {
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
    // Ingest an analytics event (callers fire-and-forget)
    this.router.post("/api/events", async (ctx) => {
      const body = await ctx.request.body().value;
      const id = crypto.randomUUID();
      const now = new Date();

      await dbClient.queryArray(
        `INSERT INTO events (id, event, session_id, user_id, trace_id, properties, page, user_agent, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          id,
          body?.event || "unknown",
          body?.sessionId || null,
          body?.userId || null,
          body?.traceId || ctx.state.traceId,
          JSON.stringify(body?.properties || {}),
          body?.page || null,
          ctx.request.headers.get("user-agent"),
          now,
        ],
      );

      // Emit structured log so the event flows via GELF → Logstash → Elasticsearch → Kibana
      console.log(JSON.stringify({
        timestamp: now.toISOString(),
        service: "analytics-service",
        traceId: body?.traceId || ctx.state.traceId,
        level: "info",
        event: body?.event || "unknown",
        eventType: "click_event",
        userId: body?.userId || null,
        sessionId: body?.sessionId || null,
        page: body?.page || null,
        properties: body?.properties || {},
      }));

      ctx.response.status = 201;
      ctx.response.body = {
        success: true,
        id,
        timestamp: now.toISOString(),
        traceId: ctx.state.traceId,
      };
    });

    // Aggregated summary stats for the analytics dashboard
    this.router.get("/api/events/summary", async (ctx) => {
      const [countResult, uniqueResult] = await Promise.all([
        dbClient.queryObject<{ event: string; count: string }>(
          `SELECT event, COUNT(*) as count FROM events GROUP BY event ORDER BY count DESC`,
        ),
        dbClient.queryObject<{ unique_users: string }>(
          `SELECT COUNT(DISTINCT user_id) as unique_users FROM events WHERE user_id IS NOT NULL`,
        ),
      ]);

      const counts: Record<string, number> = {};
      for (const row of countResult.rows) {
        counts[row.event] = parseInt(row.count, 10);
      }

      const totalEvents = Object.values(counts).reduce((a, b) => a + b, 0);
      const uniqueUsers = parseInt(uniqueResult.rows[0]?.unique_users || "0", 10);
      const addToCart = counts["add_to_cart"] || 0;
      const paymentSucceeded = counts["payment_succeeded"] || 0;
      const paymentDeclined = counts["payment_declined"] || 0;
      const conversionRate = addToCart > 0
        ? Math.round((paymentSucceeded / addToCart) * 100)
        : 0;

      ctx.response.body = {
        success: true,
        data: {
          totalEvents,
          uniqueUsers,
          conversionRate,
          counts,
          funnel: { addToCart, paymentSucceeded, paymentDeclined },
        },
        timestamp: new Date().toISOString(),
        traceId: ctx.state.traceId,
      };
    });

    // Query events for analytics/debugging
    this.router.get("/api/events", async (ctx) => {
      const event = ctx.request.url.searchParams.get("event");
      const userId = ctx.request.url.searchParams.get("userId");
      const limit = parseInt(ctx.request.url.searchParams.get("limit") || "100");
      const offset = parseInt(ctx.request.url.searchParams.get("offset") || "0");

      const conditions: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (event) { conditions.push(`event = $${idx++}`); params.push(event); }
      if (userId) { conditions.push(`user_id = $${idx++}`); params.push(userId); }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      params.push(limit, offset);

      const result = await dbClient.queryObject<any>(
        `SELECT id, event, session_id as "sessionId", user_id as "userId",
                trace_id as "traceId", properties, page, created_at as "createdAt"
         FROM events ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        params,
      );

      ctx.response.body = {
        success: true,
        data: result.rows as AnalyticsEvent[],
        timestamp: new Date().toISOString(),
        traceId: ctx.state.traceId,
      } satisfies ApiResponse<AnalyticsEvent[]>;
    });
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
    database: Deno.env.get("DB_NAME") || "analytics",
  });

  await dbClient.connect();

  await dbClient.queryArray(`
    CREATE TABLE IF NOT EXISTS events (
      id UUID PRIMARY KEY,
      event VARCHAR(100) NOT NULL,
      session_id VARCHAR(255),
      user_id VARCHAR(255),
      trace_id VARCHAR(255),
      properties JSONB NOT NULL DEFAULT '{}',
      page TEXT,
      user_agent TEXT,
      created_at TIMESTAMP NOT NULL
    )
  `);

  await dbClient.queryArray(`CREATE INDEX IF NOT EXISTS idx_events_event ON events(event)`);
  await dbClient.queryArray(`CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id)`);
  await dbClient.queryArray(`CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC)`);
}

const config: ServiceConfig = {
  name: "analytics-service",
  port: parseInt(Deno.env.get("PORT") || "3006"),
  version: "1.0.0",
};

await initDatabase();
const service = new AnalyticsService(config);
await service.start();
