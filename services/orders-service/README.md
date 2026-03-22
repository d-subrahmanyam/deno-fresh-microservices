# Orders Service

**Port:** 3004  
**Technology:** Deno + Oak + PostgreSQL + Redis  
**Role:** Order creation, status management, event publishing

## Overview

The Orders Service manages the complete order lifecycle. It provides:
- **Order Creation** - Convert carts to orders with validation
- **Order Tracking** - Retrieve order status and details
- **Status Management** - Update order fulfillment status
- **Order History** - Query orders by user or status
- **Event Publishing** - Publish order events to Redis for other services
- **Persistence** - Long-term order storage with PostgreSQL

## Features

### 📋 Order Lifecycle
1. **Pending** - Order created, awaiting confirmation
2. **Confirmed** - Payment verified, ready for fulfillment
3. **Shipped** - Order dispatched to customer
4. **Delivered** - Order received by customer
5. **Cancelled** - Order cancelled by user or system

### 💳 Order Components
- **Order Items** - Products ordered with quantities and prices
- **Shipping Address** - Delivery location details
- **Pricing** - Subtotal, shipping ($5 if <$50 else free), tax (8%), total
- **Timestamps** - Creation and update timestamps
- **Status History** - Track status changes over time

### 🔔 Event Publishing
Orders publishes events to Redis pub/sub for:
- `order.created` - New order created
- `order.confirmed` - Payment confirmed
- `order.shipped` - Order dispatched
- `order.delivered` - Order received
- `order.cancelled` - Order cancelled

Example event payload:
```json
{
  "eventType": "order.created",
  "orderId": "order-123",
  "userId": "user-456",
  "total": 87.40,
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## API Endpoints

### Create Order
```
POST /api/orders

Request Body:
{
  "userId": "user-123",
  "items": [
    {
      "productId": "prod-001",
      "quantity": 2,
      "price": 79.99
    },
    {
      "productId": "prod-002",
      "quantity": 1,
      "price": 12.99
    }
  ],
  "shippingAddress": {
    "street": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zipCode": "10001",
    "country": "USA"
  }
}

Response:
{
  "success": true,
  "data": {
    "id": "order-abc123def456",
    "userId": "user-123",
    "items": [
      {
        "productId": "prod-001",
        "quantity": 2,
        "price": 79.99,
        "subtotal": 159.98
      },
      {
        "productId": "prod-002",
        "quantity": 1,
        "price": 12.99,
        "subtotal": 12.99
      }
    ],
    "subtotal": 172.97,
    "shipping": 0.00,        # Free shipping (>= $50)
    "tax": 13.84,             # 8% of subtotal
    "total": 186.81,
    "shippingAddress": {
      "street": "123 Main St",
      "city": "New York",
      "state": "NY",
      "zipCode": "10001",
      "country": "USA"
    },
    "status": "pending",
    "createdAt": "2024-01-01T12:00:00Z",
    "updatedAt": "2024-01-01T12:00:00Z"
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Get Order by ID
```
GET /api/orders/{id}

Response:
{
  "success": true,
  "data": {
    "id": "order-abc123def456",
    "userId": "user-123",
    "items": [...],
    "subtotal": 172.97,
    "shipping": 0.00,
    "tax": 13.84,
    "total": 186.81,
    "shippingAddress": {...},
    "status": "pending",
    "createdAt": "2024-01-01T12:00:00Z",
    "updatedAt": "2024-01-01T12:00:00Z"
  }
}
```

### List Orders
```
GET /api/orders?userId=user-123&status=pending&limit=20&offset=0

Query Parameters:
  - userId: Filter by user ID (optional)
  - status: Filter by status - pending|confirmed|shipped|delivered|cancelled (optional)
  - limit: Results per page (default: 20)
  - offset: Starting position (default: 0)

Response:
{
  "success": true,
  "data": {
    "orders": [
      { ...order... },
      { ...order... }
    ],
    "total": 42,
    "limit": 20,
    "offset": 0
  }
}
```

### Update Order Status (Admin)
```
PUT /api/orders/{id}/status

Request Body:
{
  "status": "confirmed"
}

Allowed Transitions:
  pending → confirmed
  confirmed → shipped
  shipped → delivered
  any → cancelled

Response:
{
  "success": true,
  "data": {
    "id": "order-abc123def456",
    "status": "confirmed",
    "updatedAt": "2024-01-01T12:05:00Z",
    ...
  }
}
```

## Data Model

### Order Schema
```typescript
interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
  subtotal: number;
}

interface ShippingAddress {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

interface Order {
  id: string;                    // Unique order ID (UUID)
  userId: string;                // User who placed order
  items: OrderItem[];            // Ordered products
  subtotal: number;              // Sum of item prices
  shipping: number;              // $5 if subtotal < $50, else $0
  tax: number;                   // 8% of subtotal
  total: number;                 // subtotal + shipping + tax
  shippingAddress: ShippingAddress;
  status: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
  createdAt: Date;
  updatedAt: Date;
}
```

### Database Schema (PostgreSQL)
```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(100) NOT NULL,
  subtotal DECIMAL(10, 2) NOT NULL,
  shipping DECIMAL(10, 2) DEFAULT 0,
  tax DECIMAL(10, 2) NOT NULL,
  total DECIMAL(10, 2) NOT NULL,
  shipping_address JSONB NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  product_id VARCHAR(100) NOT NULL,
  quantity INTEGER NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  subtotal DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
```

## Pricing Calculation

### Example 1: Small Order (Gets Fixed Shipping)
```
Items:
  - Wireless Headphones × 2 @ $79.99 = $159.98
  - USB-C Cable × 1 @ $12.99 = $12.99

Subtotal:        $172.97
Shipping:        $0.00    (>= $50, so FREE)
Tax (8%):        $13.84   (0.08 × $172.97)
─────────────────────────
Total:           $186.81
```

### Example 2: Large Order (Gets Free Shipping)
```
Items:
  - Coffee Maker × 1 @ $49.99 = $49.99
  - Running Shoes × 1 @ $89.99 = $89.99

Subtotal:        $139.98
Shipping:        $0.00    (>= $50, so FREE)
Tax (8%):        $11.20   (0.08 × $139.98)
─────────────────────────
Total:           $151.18
```

### Example 3: Small Order (Fixed Shipping Fee)
```
Items:
  - Book × 1 @ $29.99 = $29.99

Subtotal:        $29.99
Shipping:        $5.00    (< $50, so FIXED)
Tax (8%):        $2.40    (0.08 × $29.99)
─────────────────────────
Total:           $37.39
```

## Configuration

### Environment Variables
```bash
PORT=3004                        # Service port
DB_HOST=postgres                 # PostgreSQL host
DB_PORT=5432                     # PostgreSQL port
DB_USER=postgres                 # Database user
DB_PASSWORD=postgres             # Database password
DB_NAME=products                 # Database name
REDIS_URL=redis://redis:6379     # Redis connection
```

### Docker Compose
```yaml
orders-service:
  build:
    context: .
    dockerfile: ./services/orders-service/Dockerfile
  ports:
    - "3004:3004"
  environment:
    PORT: "3004"
    DB_HOST: postgres
    DB_PORT: "5432"
    DB_USER: postgres
    DB_PASSWORD: postgres
    DB_NAME: products
    REDIS_URL: redis://redis:6379
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
  networks:
    - microservices
```

## Health Check

```
GET /health

Response:
{
  "status": "healthy",
  "service": "orders-service",
  "timestamp": "2024-01-01T12:00:00Z",
  "dependencies": {
    "database": {
      "status": "healthy",
      "latency": 3
    },
    "redis": {
      "status": "healthy",
      "latency": 1
    }
  }
}
```

## Error Responses

### Invalid Order Data
```
POST /api/orders
{ "items": [] }  # Missing required fields

HTTP 400 Bad Request

{
  "success": false,
  "error": "Invalid order data: userId required, items must not be empty",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Order Not Found
```
GET /api/orders/invalid-id

HTTP 404 Not Found

{
  "success": false,
  "error": "Order not found",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Invalid Status Transition
```
PUT /api/orders/{id}/status
{ "status": "delivered" }  # From pending

HTTP 400 Bad Request

{
  "success": false,
  "error": "Invalid status transition from pending to delivered",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## Development

### Run Locally
```bash
cd services/orders-service

# Ensure PostgreSQL and Redis are running
deno run --allow-net --allow-env \
  --env-file=../../.env \
  main.ts
```

### Run with Docker
```bash
docker build -t orders-service:latest -f services/orders-service/Dockerfile .
docker run -p 3004:3004 \
  -e DB_HOST=postgres \
  -e DB_PORT=5432 \
  -e DB_USER=postgres \
  -e DB_PASSWORD=postgres \
  -e DB_NAME=products \
  -e REDIS_URL=redis://redis:6379 \
  orders-service:latest
```

## Testing

### Create Order
```bash
curl -X POST http://localhost:3004/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "items": [
      {"productId": "prod-001", "quantity": 1, "price": 79.99}
    ],
    "shippingAddress": {
      "street": "123 Main St",
      "city": "New York",
      "state": "NY",
      "zipCode": "10001",
      "country": "USA"
    }
  }'
```

### List User Orders
```bash
curl "http://localhost:3004/api/orders?userId=user-123"
```

### Get Order Details
```bash
curl http://localhost:3004/api/orders/order-abc123
```

### Update Order Status
```bash
curl -X PUT http://localhost:3004/api/orders/order-abc123/status \
  -H "Content-Type: application/json" \
  -d '{"status": "confirmed"}'
```

### Check Health
```bash
curl http://localhost:3004/health
```

## Database Queries

### View Orders in PostgreSQL
```bash
# Connect to database
docker exec -it microservices-postgres-1 psql -U postgres -d products

# List all orders
SELECT id, user_id, total, status, created_at FROM orders;

# Get specific user's orders
SELECT * FROM orders WHERE user_id = 'user-123' ORDER BY created_at DESC;

# Get pending orders
SELECT id, user_id, total, created_at FROM orders WHERE status = 'pending';

# Check low total orders (below $50)
SELECT id, user_id, total, status FROM orders WHERE subtotal < 50;
```

### Add Order Manually
```sql
INSERT INTO orders (user_id, subtotal, shipping, tax, total, shipping_address, status)
VALUES (
  'user-123',
  50.00,
  5.00,
  4.00,
  59.00,
  '{"street": "123 Main St", "city": "NYC", "state": "NY", "zipCode": "10001", "country": "USA"}',
  'pending'
);
```

## Performance Considerations

### Query Optimization
- **User Orders** - Fast lookup via user_id index
- **Status Filtering** - Index on status column
- **Date Range** - Index on created_at for historical queries
- **Pagination** - LIMIT/OFFSET for efficient browsing

### Event Publishing
- **Asynchronous** - Redis pub/sub is non-blocking
- **Loose Coupling** - Services can subscribe to order events independently
- **Event Format** - JSON serialization for language-agnostic integration

### Scalability
- **Stateless** - Each instance independent
- **Database Connection** - Managed by Deno Postgres driver
- **Redis Connection** - Persistent pub/sub channel
- **Horizontal Scaling** - Add instances behind load balancer

## Known Limitations

1. **Product Names** - Currently stored as "Unknown product" in order_items (needs product service integration)
2. **Inventory Decrement** - Product stock not decremented upon order creation
3. **Payment Processing** - No actual payment handling (mock only)
4. **Order Refunds** - No refund/cancellation workflow implemented
5. **Export** - No invoice generation or export capabilities

## Future Enhancements

- [ ] Payment gateway integration (Stripe, PayPal)
- [ ] Invoice generation and email
- [ ] Refund/return workflow
- [ ] Order notifications (email, SMS)
- [ ] Analytics dashboard
- [ ] Order fulfillment tracking
- [ ] Batch order operations
- [ ] Subscription orders

## Related Documentation
- [Main README](../../README.md) - Project overview
- [API Gateway README](../api-gateway/README.md)
- [Products Service README](../products-service/README.md)
- [Cart Service README](../cart-service/README.md)
- [Deployment Guide](../../docs/DEPLOYMENT.md)
