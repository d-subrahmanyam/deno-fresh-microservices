import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { BaseService, ServiceConfig } from "../../shared/base-service.ts";
import {
  Product,
  ApiResponse,
  ComponentHealth,
} from "../../shared/types/mod.ts";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

let dbClient: Client;

class ProductsService extends BaseService {
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

    return checks;
  }

  protected setupRoutes() {
    // Create new product (admin)
    this.router.post("/api/products", async (ctx) => {
      const body = await ctx.request.body().value;
      const result = await this.createProduct(body, ctx.state.traceId);

      ctx.response.status = result.success ? 201 : 400;
      ctx.response.body = result;
    });

    // Get product by ID
    this.router.get("/api/products/:id", async (ctx) => {
      const productId = ctx.params.id;
      const result = await this.getProduct(productId, ctx.state.traceId);

      ctx.response.status = result.success ? 200 : 404;
      ctx.response.body = result;
    });

    // List all products with pagination
    this.router.get("/api/products", async (ctx) => {
      const limit = parseInt(
        ctx.request.url.searchParams.get("limit") || "20"
      );
      const offset = parseInt(
        ctx.request.url.searchParams.get("offset") || "0"
      );
      const category = ctx.request.url.searchParams.get("category");
      const result = await this.listProducts(
        limit,
        offset,
        category,
        ctx.state.traceId
      );

      ctx.response.body = result;
    });

    // Update product
    this.router.put("/api/products/:id", async (ctx) => {
      const productId = ctx.params.id;
      const body = await ctx.request.body().value;
      const result = await this.updateProduct(
        productId,
        body,
        ctx.state.traceId
      );

      ctx.response.status = result.success ? 200 : 400;
      ctx.response.body = result;
    });

    // Delete product
    this.router.delete("/api/products/:id", async (ctx) => {
      const productId = ctx.params.id;
      const result = await this.deleteProduct(productId, ctx.state.traceId);

      ctx.response.status = result.success ? 200 : 404;
      ctx.response.body = result;
    });
  }

  private async createProduct(
    data: Partial<Product>,
    traceId: string
  ): Promise<ApiResponse<Product>> {
    if (!data.name || !data.price || !data.category) {
      return {
        success: false,
        error: "Name, price, and category are required",
        timestamp: new Date().toISOString(),
        traceId,
      };
    }

    try {
      const id = crypto.randomUUID();
      const now = new Date();

      await dbClient.queryArray(
        `INSERT INTO products (id, name, description, price, image, category, stock, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          id,
          data.name,
          data.description || "",
          data.price,
          data.image || "",
          data.category,
          data.stock || 0,
          now,
          now,
        ]
      );

      const product: Product = {
        id,
        name: data.name,
        description: data.description || "",
        price: data.price,
        image: data.image || "",
        category: data.category,
        stock: data.stock || 0,
        createdAt: now,
        updatedAt: now,
      };

      return {
        success: true,
        data: product,
        timestamp: new Date().toISOString(),
        traceId,
      };
    } catch (error) {
      throw error;
    }
  }

  private async getProduct(
    productId: string,
    traceId: string
  ): Promise<ApiResponse<Product>> {
    const result = await dbClient.queryObject<Product>(
      `SELECT id, name, description, price, image, category, stock, created_at as "createdAt", updated_at as "updatedAt"
       FROM products WHERE id = $1`,
      [productId]
    );

    if (result.rows.length === 0) {
      return {
        success: false,
        error: "Product not found",
        timestamp: new Date().toISOString(),
        traceId,
      };
    }

    return {
      success: true,
      data: result.rows[0],
      timestamp: new Date().toISOString(),
      traceId,
    };
  }

  private async listProducts(
    limit: number,
    offset: number,
    category: string | null,
    traceId: string
  ): Promise<ApiResponse<Product[]>> {
    let query =
      `SELECT id, name, description, price, image, category, stock, created_at as "createdAt", updated_at as "updatedAt"
       FROM products`;
    const params: unknown[] = [];

    if (category) {
      query += ` WHERE category = $1`;
      params.push(category);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await dbClient.queryObject<Product>(query, params);

    return {
      success: true,
      data: result.rows,
      timestamp: new Date().toISOString(),
      traceId,
    };
  }

  private async updateProduct(
    productId: string,
    data: Partial<Product>,
    traceId: string
  ): Promise<ApiResponse<Product>> {
    const now = new Date();
    const updates: string[] = ["updated_at = $2"];
    const values: unknown[] = [productId, now];
    let paramIndex = 3;

    if (data.name) {
      updates.push(`name = $${paramIndex}`);
      values.push(data.name);
      paramIndex++;
    }

    if (data.price) {
      updates.push(`price = $${paramIndex}`);
      values.push(data.price);
      paramIndex++;
    }

    if (data.stock !== undefined) {
      updates.push(`stock = $${paramIndex}`);
      values.push(data.stock);
      paramIndex++;
    }

    if (data.description) {
      updates.push(`description = $${paramIndex}`);
      values.push(data.description);
      paramIndex++;
    }

    const query = `UPDATE products SET ${updates.join(", ")} WHERE id = $1 RETURNING *`;
    const result = await dbClient.queryObject<Product>(query, values);

    if (result.rows.length === 0) {
      return {
        success: false,
        error: "Product not found",
        timestamp: new Date().toISOString(),
        traceId,
      };
    }

    return {
      success: true,
      data: result.rows[0],
      timestamp: new Date().toISOString(),
      traceId,
    };
  }

  private async deleteProduct(
    productId: string,
    traceId: string
  ): Promise<ApiResponse<{ id: string }>> {
    const result = await dbClient.queryArray(
      `DELETE FROM products WHERE id = $1 RETURNING id`,
      [productId]
    );

    if (result.rows.length === 0) {
      return {
        success: false,
        error: "Product not found",
        timestamp: new Date().toISOString(),
        traceId,
      };
    }

    return {
      success: true,
      data: { id: productId },
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
    database: Deno.env.get("DB_NAME") || "products",
  });

  await dbClient.connect();

  await dbClient.queryArray(`
    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      price DECIMAL(10, 2) NOT NULL,
      image TEXT,
      category VARCHAR(100) NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL,
      updated_at TIMESTAMP NOT NULL
    )
  `);
}

const config: ServiceConfig = {
  name: "products-service",
  port: parseInt(Deno.env.get("PORT") || "3003"),
  version: "1.0.0",
};

await initDatabase();
const service = new ProductsService(config);
await service.start();
