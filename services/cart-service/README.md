# Cart Service

**Port:** 3005  
**Technology:** Deno + Oak + Redis  
**Role:** Shopping cart management with session-based persistence

## Overview

The Cart Service manages user shopping carts with temporary persistence. It provides:
- **Cart Creation** - Automatic cart per user
- **Add/Remove Items** - Manage products in cart
- **Quantity Updates** - Modify item quantities
- **Cart Persistence** - Redis-backed storage
- **Automatic Expiry** - 7-day TTL for abandoned carts
- **Fast Operations** - In-memory Redis for instant response times

## Features

### 🛒 Shopping Cart Operations
- **View Cart** - Retrieve user's current cart
- **Add Items** - Add products with quantity
- **Update Quantity** - Modify item quantities dynamically
- **Remove Items** - Delete specific products
- **Clear Cart** - Remove all items
- **Automatic Totals** - Real-time cart total calculation

### ⏰ Session Management
- **7-Day Expiry** - Carts auto-expire after 7 days of inactivity
- **No Database** - Redis provides high-speed operations
- **Session Isolation** - Per-user cart isolation
- **Automatic Sync** - Cart updates reflected immediately

### 💰 Price Tracking
- **Item Pricing** - Tracks price at time of addition
- **Cart Total** - Automatic sum of all item subtotals
- **No Tax/Shipping** - Applied at checkout (order service responsibility)

### 📊 Cart Data Structure
```json
{
  "id": "cart:user-123",
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
  "total": 172.97,
  "expiresAt": "2024-01-08T12:00:00Z",
  "createdAt": "2024-01-01T12:00:00Z",
  "updatedAt": "2024-01-01T12:05:00Z"
}
```

## API Endpoints

### Get User's Cart
```
GET /api/carts/{userId}

Response:
HTTP 200 OK

{
  "success": true,
  "data": {
    "id": "cart:user-123",
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
    "total": 172.97,
    "expiresAt": "2024-01-08T12:00:00Z",
    "createdAt": "2024-01-01T12:00:00Z",
    "updatedAt": "2024-01-01T12:05:00Z"
  },
  "timestamp": "2024-01-01T12:05:00Z"
}
```

### Get Empty Cart
```
GET /api/carts/{userId}

Response (when cart doesn't exist):
HTTP 200 OK

{
  "success": true,
  "data": {
    "id": "cart:user-123",
    "userId": "user-123",
    "items": [],
    "total": 0,
    "expiresAt": "2024-01-08T12:00:00Z",
    "createdAt": "2024-01-01T12:00:00Z",
    "updatedAt": "2024-01-01T12:00:00Z"
  }
}
```

### Add Item to Cart
```
POST /api/carts/{userId}/items

Request Body:
{
  "productId": "prod-001",
  "quantity": 2,
  "price": 79.99
}

Response:
HTTP 200 OK

{
  "success": true,
  "data": {
    "id": "cart:user-123",
    "userId": "user-123",
    "items": [
      {
        "productId": "prod-001",
        "quantity": 2,
        "price": 79.99,
        "subtotal": 159.98
      }
    ],
    "total": 159.98
  }
}
```

### Update Item Quantity
```
PUT /api/carts/{userId}/items/{productId}

Request Body:
{
  "quantity": 5
}

Response:
HTTP 200 OK

{
  "success": true,
  "data": {
    "id": "cart:user-123",
    "userId": "user-123",
    "items": [
      {
        "productId": "prod-001",
        "quantity": 5,
        "price": 79.99,
        "subtotal": 399.95
      }
    ],
    "total": 399.95
  }
}
```

### Remove Item from Cart
```
DELETE /api/carts/{userId}/items/{productId}

Response:
HTTP 200 OK

{
  "success": true,
  "data": {
    "id": "cart:user-123",
    "userId": "user-123",
    "items": [],
    "total": 0
  }
}
```

### Clear Entire Cart
```
DELETE /api/carts/{userId}

Response:
HTTP 200 OK

{
  "success": true,
  "data": {
    "id": "cart:user-123",
    "userId": "user-123",
    "items": [],
    "total": 0
  }
}
```

## Data Model

### CartItem
```typescript
interface CartItem {
  productId: string;    // Product identifier
  quantity: number;     // Number of items
  price: number;        // Price per unit
  subtotal: number;     // quantity × price
}
```

### Cart
```typescript
interface Cart {
  id: string;              // Cart ID (cart:userId)
  userId: string;          // Owner of cart
  items: CartItem[];       // Items in cart
  total: number;           // Cart total (sum of subtotals)
  expiresAt: Date;         // Expiration timestamp (7 days)
  createdAt: Date;         // Cart creation time
  updatedAt: Date;         // Last modification time
}
```

### Redis Storage Format
```
Key: cart:user-123
Value: JSON serialized Cart object
TTL: 604800 seconds (7 days)

Example:
SETEX cart:user-123 604800 '{"userId":"user-123","items":[...],"total":172.97,...}'
```

## Configuration

### Environment Variables
```bash
PORT=3005                     # Service port
REDIS_URL=redis://redis:6379  # Redis connection string

# Alternative format:
REDIS_HOST=redis              # Redis hostname
REDIS_PORT=6379               # Redis port
REDIS_PASSWORD=                # Optional password
```

### Docker Compose
```yaml
cart-service:
  build:
    context: .
    dockerfile: ./services/cart-service/Dockerfile
  ports:
    - "3005:3005"
  environment:
    PORT: "3005"
    REDIS_URL: redis://redis:6379
  depends_on:
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
  "service": "cart-service",
  "timestamp": "2024-01-01T12:00:00Z",
  "dependencies": {
    "redis": {
      "status": "healthy",
      "latency": 1
    }
  }
}
```

## Error Responses

### Invalid Product ID
```
POST /api/carts/user-123/items
{ "productId": "", "quantity": 1, "price": 10 }

HTTP 400 Bad Request

{
  "success": false,
  "error": "Invalid product ID",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Invalid Quantity
```
PUT /api/carts/user-123/items/prod-001
{ "quantity": 0 }

HTTP 400 Bad Request

{
  "success": false,
  "error": "Quantity must be greater than 0",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Redis Connection Error
```
GET /api/carts/user-123

HTTP 503 Service Unavailable

{
  "success": false,
  "error": "Redis connection failed",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## Development

### Run Locally
```bash
cd services/cart-service

# Ensure Redis is running
deno run --allow-net --allow-env \
  --env-file=../../.env \
  main.ts
```

### Run with Docker
```bash
# Start Redis first
docker run -d -p 6379:6379 redis:7-alpine

# Build and run service
docker build -t cart-service:latest -f services/cart-service/Dockerfile .
docker run -p 3005:3005 \
  -e REDIS_URL=redis://localhost:6379 \
  cart-service:latest
```

## Testing

### Add Item to Cart
```bash
curl -X POST http://localhost:3005/api/carts/user-123/items \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "prod-001",
    "quantity": 2,
    "price": 79.99
  }'
```

### View Cart
```bash
curl http://localhost:3005/api/carts/user-123
```

### Update Quantity
```bash
curl -X PUT http://localhost:3005/api/carts/user-123/items/prod-001 \
  -H "Content-Type: application/json" \
  -d '{"quantity": 5}'
```

### Remove Item
```bash
curl -X DELETE http://localhost:3005/api/carts/user-123/items/prod-001 \
  -H "Content-Type: application/json"
```

### Clear Cart
```bash
curl -X DELETE http://localhost:3005/api/carts/user-123 \
  -H "Content-Type: application/json"
```

### Check Health
```bash
curl http://localhost:3005/health
```

## Redis Administration

### View Cart Data
```bash
# Connect to Redis CLI
docker exec -it microservices-redis-1 redis-cli

# List all cart keys
KEYS cart:*

# View specific cart
GET cart:user-123

# Check TTL (seconds remaining)
TTL cart:user-123

# Get all carts with metadata
SCAN 0 MATCH "cart:*"
```

### Manually Create Cart
```bash
SETEX cart:user-456 604800 '{"userId":"user-456","items":[],"total":0,"createdAt":"2024-01-01T12:00:00Z","updatedAt":"2024-01-01T12:00:00Z"}'
```

### Clear All Carts
```bash
# WARNING: Clears all carts - use with caution
FLUSHDB
```

## Performance Characteristics

### Operation Latency
| Operation | Latency | Scaling |
|-----------|---------|---------|
| GET cart | 1-2ms | O(1) |
| Add item | 2-3ms | O(1) |
| Update quantity | 2-3ms | O(1) |
| Remove item | 2-3ms | O(1) |
| Clear cart | 1-2ms | O(1) |

### Memory Usage (Approximate)
- Empty cart: ~200 bytes
- 10 items: ~1 KB
- 100 items: ~10 KB
- 1000 items: ~100 KB

### Throughput
- **Single instance:** 10,000+ requests/second
- **With database:** Limited only by network bandwidth
- **Scaling:** Linear with Redis cluster

## Session Expiry

### TTL Behavior
- **Initial TTL:** 604,800 seconds (7 days)
- **On Update:** TTL automatically refreshed (extends expiration)
- **Expired Carts:** Automatically deleted by Redis

### Examples
```
Cart created at Mon → Expires next Mon
Cart updated Fri → Now expires next Fri
Cart never accessed → Deleted after 7 days
```

## Known Limitations

1. **Single User Carts** - No shared carts between users
2. **No Cart History** - Previous carts not retained after expiry
3. **Limited Quantities** - Designed for typical e-commerce quantities (< 1000 items)
4. **Single Redis Instance** - No replication for high availability
5. **No Persistence** - Data lost if Redis crashes (run with RDB snapshots)

## Future Enhancements

- [ ] Cart sharing between users
- [ ] Wishlist functionality
- [ ] Cart save/restore (abandoned carts recovery)
- [ ] Redis cluster support for HA
- [ ] Cart analytics (popular items, abandoned carts)
- [ ] Coupon/discount code application
- [ ] Stock reservation during cart hold
- [ ] Cart merge on login (guest to user)

## Best Practices

### For Clients
1. **Read cart after each mutation** - Verify changes reflected
2. **Handle stale data** - Cart may have changed since last read
3. **Validate prices** - Don't trust prices from old cart snapshots
4. **Check quantity limits** - Enforce max quantities client-side

### For Deployment
1. **Enable RDB snapshots** - Persist Redis data to disk
2. **Monitor Redis memory** - Prevent eviction of active carts
3. **Set maxmemory-policy** - Determine eviction strategy
4. **Use AUTH** - Require Redis password in production
5. **Backup daily** - Persist cart data off-server

## Related Documentation
- [Main README](../../README.md) - Project overview
- [API Gateway README](../api-gateway/README.md)
- [Products Service README](../products-service/README.md)
- [Orders Service README](../orders-service/README.md)
- [Deployment Guide](../../docs/DEPLOYMENT.md)
