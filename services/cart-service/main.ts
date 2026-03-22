import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { BaseService, ServiceConfig } from "../../shared/base-service.ts";
import {
  Cart,
  CartItem,
  ApiResponse,
  ComponentHealth,
} from "../../shared/types/mod.ts";
import { connect } from "https://deno.land/x/redis@v0.32.3/mod.ts";

let redisClient: any;

class CartService extends BaseService {
  constructor(config: ServiceConfig) {
    super(config);
  }

  protected async checkDependencies(): Promise<
    Record<string, ComponentHealth>
  > {
    const checks: Record<string, ComponentHealth> = {};

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
    // Get user's cart
    this.router.get("/api/carts/:userId", async (ctx) => {
      const userId = ctx.params.userId;
      const result = await this.getCart(userId, ctx.state.traceId);

      ctx.response.status = result.success ? 200 : 404;
      ctx.response.body = result;
    });

    // Add item to cart
    this.router.post("/api/carts/:userId/items", async (ctx) => {
      const userId = ctx.params.userId;
      const body = await ctx.request.body().value;
      const result = await this.addItemToCart(
        userId,
        body,
        ctx.state.traceId
      );

      ctx.response.status = result.success ? 200 : 400;
      ctx.response.body = result;
    });

    // Remove item from cart
    this.router.delete("/api/carts/:userId/items/:productId", async (ctx) => {
      const userId = ctx.params.userId;
      const productId = ctx.params.productId;
      const result = await this.removeItemFromCart(
        userId,
        productId,
        ctx.state.traceId
      );

      ctx.response.status = result.success ? 200 : 400;
      ctx.response.body = result;
    });

    // Update item quantity
    this.router.put("/api/carts/:userId/items/:productId", async (ctx) => {
      const userId = ctx.params.userId;
      const productId = ctx.params.productId;
      const body = await ctx.request.body().value;
      const result = await this.updateItemQuantity(
        userId,
        productId,
        body.quantity,
        ctx.state.traceId
      );

      ctx.response.status = result.success ? 200 : 400;
      ctx.response.body = result;
    });

    // Clear cart
    this.router.delete("/api/carts/:userId", async (ctx) => {
      const userId = ctx.params.userId;
      const result = await this.clearCart(userId, ctx.state.traceId);

      ctx.response.status = result.success ? 200 : 400;
      ctx.response.body = result;
    });
  }

  private async getCart(
    userId: string,
    traceId: string
  ): Promise<ApiResponse<Cart>> {
    const cartKey = `cart:${userId}`;
    const cartData = await redisClient.get(cartKey);

    if (!cartData) {
      const cart: Cart = {
        id: crypto.randomUUID(),
        userId,
        items: [],
        total: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await redisClient.setex(
        cartKey,
        86400 * 7, // 7 days
        JSON.stringify(cart)
      );

      return {
        success: true,
        data: cart,
        timestamp: new Date().toISOString(),
        traceId,
      };
    }

    const cart = JSON.parse(cartData);

    return {
      success: true,
      data: cart,
      timestamp: new Date().toISOString(),
      traceId,
    };
  }

  private async addItemToCart(
    userId: string,
    item: CartItem,
    traceId: string
  ): Promise<ApiResponse<Cart>> {
    if (!item.productId || !item.quantity || !item.price) {
      return {
        success: false,
        error: "productId, quantity, and price are required",
        timestamp: new Date().toISOString(),
        traceId,
      };
    }

    const cartKey = `cart:${userId}`;
    let cart: Cart;

    const cartData = await redisClient.get(cartKey);
    if (!cartData) {
      cart = {
        id: crypto.randomUUID(),
        userId,
        items: [],
        total: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } else {
      cart = JSON.parse(cartData);
    }

    // Check if item already exists
    const existingItem = cart.items.find((i) => i.productId === item.productId);
    if (existingItem) {
      existingItem.quantity += item.quantity;
    } else {
      cart.items.push(item);
    }

    // Calculate total
    cart.total = cart.items.reduce(
      (sum, i) => sum + i.price * i.quantity,
      0
    );
    cart.updatedAt = new Date();

    await redisClient.setex(
      cartKey,
      86400 * 7,
      JSON.stringify(cart)
    );

    return {
      success: true,
      data: cart,
      timestamp: new Date().toISOString(),
      traceId,
    };
  }

  private async removeItemFromCart(
    userId: string,
    productId: string,
    traceId: string
  ): Promise<ApiResponse<Cart>> {
    const cartKey = `cart:${userId}`;
    const cartData = await redisClient.get(cartKey);

    if (!cartData) {
      return {
        success: false,
        error: "Cart not found",
        timestamp: new Date().toISOString(),
        traceId,
      };
    }

    const cart = JSON.parse(cartData);
    cart.items = cart.items.filter((i: CartItem) => i.productId !== productId);

    // Calculate new total
    cart.total = cart.items.reduce(
      (sum: number, i: CartItem) => sum + i.price * i.quantity,
      0
    );
    cart.updatedAt = new Date();

    if (cart.items.length === 0) {
      await redisClient.del(cartKey);
    } else {
      await redisClient.setex(
        cartKey,
        86400 * 7,
        JSON.stringify(cart)
      );
    }

    return {
      success: true,
      data: cart,
      timestamp: new Date().toISOString(),
      traceId,
    };
  }

  private async updateItemQuantity(
    userId: string,
    productId: string,
    quantity: number,
    traceId: string
  ): Promise<ApiResponse<Cart>> {
    if (quantity <= 0) {
      return {
        success: false,
        error: "Quantity must be greater than 0",
        timestamp: new Date().toISOString(),
        traceId,
      };
    }

    const cartKey = `cart:${userId}`;
    const cartData = await redisClient.get(cartKey);

    if (!cartData) {
      return {
        success: false,
        error: "Cart not found",
        timestamp: new Date().toISOString(),
        traceId,
      };
    }

    const cart = JSON.parse(cartData);
    const item = cart.items.find((i: CartItem) => i.productId === productId);

    if (!item) {
      return {
        success: false,
        error: "Item not found in cart",
        timestamp: new Date().toISOString(),
        traceId,
      };
    }

    item.quantity = quantity;

    // Calculate new total
    cart.total = cart.items.reduce(
      (sum: number, i: CartItem) => sum + i.price * i.quantity,
      0
    );
    cart.updatedAt = new Date();

    await redisClient.setex(
      cartKey,
      86400 * 7,
      JSON.stringify(cart)
    );

    return {
      success: true,
      data: cart,
      timestamp: new Date().toISOString(),
      traceId,
    };
  }

  private async clearCart(
    userId: string,
    traceId: string
  ): Promise<ApiResponse<{ status: string }>> {
    const cartKey = `cart:${userId}`;
    await redisClient.del(cartKey);

    return {
      success: true,
      data: { status: "cleared" },
      timestamp: new Date().toISOString(),
      traceId,
    };
  }

  protected async cleanup(): Promise<void> {
    // Redis connection will be closed automatically
  }
}

async function initRedis() {
  redisClient = await connect({
    hostname: Deno.env.get("REDIS_HOST") || "localhost",
    port: parseInt(Deno.env.get("REDIS_PORT") || "6379"),
  });
}

const config: ServiceConfig = {
  name: "cart-service",
  port: parseInt(Deno.env.get("PORT") || "3005"),
  version: "1.0.0",
};

await initRedis();
const service = new CartService(config);
await service.start();
