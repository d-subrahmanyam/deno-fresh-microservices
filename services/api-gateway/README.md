# API Gateway Service

**Port:** 3000  
**Technology:** Deno + Oak  
**Role:** Central routing hub, request aggregation, rate limiting

## Overview

The API Gateway is the single entry point for all client requests in the microservices architecture. It handles:
- **Request routing** to backend services
- **Rate limiting** to prevent abuse
- **Distributed tracing** for debugging
- **Response aggregation** (e.g., enriching cart data with product details)
- **Error handling** and status monitoring

## Features

### 🔐 Rate Limiting
- **Limit:** 1000 requests per minute per client IP
- **Headers:** Returns `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- **Response:** HTTP 429 when limit exceeded

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1704067200000
```

### 🔍 Distributed Tracing
- **Trace IDs:** Generated per request or forwarded from incoming header
- **Header:** `X-Trace-Id` (UUID v4 format)
- **Logging:** Each request logged with trace ID for correlation

Example log output:
```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "service": "api-gateway",
  "traceId": "123e4567-e89b-12d3-a456-426614174000",
  "method": "GET",
  "path": "/api/products",
  "status": 200,
  "duration": "45ms"
}
```

### 🔄 Service Aggregation
The gateway enriches requests with additional data from multiple services:

**Example: Cart Details Enrichment**
```
GET /api/carts-enriched/:userId
↓
Calls:
  1. Cart Service → GET /api/carts/:userId
  2. Products Service → GET /api/products/:id (for each item)
↓
Returns: Cart with full product details (name, price, description)
```

### 📍 Routing Map

```
┌─ Products Service (3003)
│  ├─ GET    /api/products → proxy
│  ├─ GET    /api/products/{id} → proxy
│  ├─ POST   /api/products → proxy (admin)
│  ├─ PUT    /api/products/{id} → proxy (admin)
│  └─ DELETE /api/products/{id} → proxy (admin)
│
├─ Orders Service (3004)
│  ├─ GET    /api/orders → proxy
│  ├─ GET    /api/orders/{id} → proxy
│  ├─ POST   /api/orders → proxy
│  └─ PUT    /api/orders/{id}/status → proxy (admin)
│
├─ Cart Service (3005)
│  ├─ GET    /api/carts/{userId} → proxy
│  ├─ POST   /api/carts/{userId}/items → proxy
│  ├─ PUT    /api/carts/{userId}/items/{productId} → proxy
│  └─ DELETE /api/carts/{userId} → proxy
│
└─ Gateway Utilities
   ├─ GET /api/carts-enriched/{userId} → aggregated response
   └─ GET /health → health check
```

## Configuration

### Environment Variables
```bash
PORT=3000                                    # Gateway port
PRODUCTS_SERVICE_URL=http://products-service:3003
ORDERS_SERVICE_URL=http://orders-service:3004
CART_SERVICE_URL=http://cart-service:3005
```

### Docker Compose
```yaml
api-gateway:
  build:
    context: .
    dockerfile: ./services/api-gateway/Dockerfile
  ports:
    - "3000:3000"
  environment:
    PORT: "3000"
    PRODUCTS_SERVICE_URL: http://products-service:3003
    ORDERS_SERVICE_URL: http://orders-service:3004
    CART_SERVICE_URL: http://cart-service:3005
  depends_on:
    - products-service
    - orders-service
    - cart-service
```

## API Endpoints

### Authentication (Frontend Only)
```
POST   /api/auth/login        - User login (handled by frontend)
POST   /api/auth/logout       - User logout (handled by frontend)
GET    /api/auth/me           - Current user info (from session)
```

### Products (Proxied to Products Service)
```
GET    /api/products                - List products with pagination
GET    /api/products?search=term    - Search products
GET    /api/products?category=X     - Filter by category
GET    /api/products/{id}           - Get product details
POST   /api/products                - Create product (admin)
PUT    /api/products/{id}           - Update product (admin)
DELETE /api/products/{id}           - Delete product (admin)
```

### Orders (Proxied to Orders Service)
```
POST   /api/orders                  - Create new order
GET    /api/orders                  - List orders
GET    /api/orders/{id}             - Get order details
PUT    /api/orders/{id}/status      - Update order status
```

### Cart (Proxied to Cart Service)
```
GET    /api/carts/{userId}                   - Get cart
POST   /api/carts/{userId}/items             - Add item
PUT    /api/carts/{userId}/items/{id}        - Update quantity
DELETE /api/carts/{userId}/items/{id}        - Remove item
DELETE /api/carts/{userId}                   - Clear cart
```

### Gateway Utilities
```
GET    /api/carts-enriched/{userId}  - Get cart with product details
GET    /health                        - Gateway health check
```

## Health Check Response

```
GET /health

HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "healthy",
  "service": "api-gateway",
  "timestamp": "2024-01-01T12:00:00Z",
  "uptime": 3600000,
  "dependencies": {
    "products-service": "healthy",
    "orders-service": "healthy",
    "cart-service": "healthy"
  }
}
```

## Error Handling

### Rate Limit Exceeded
```
HTTP 429 Too Many Requests

{
  "success": false,
  "error": "Too many requests. Please try again later.",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Service Unavailable
```
HTTP 503 Service Unavailable

{
  "success": false,
  "error": "Backend service unavailable",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Invalid Request
```
HTTP 400 Bad Request

{
  "success": false,
  "error": "Invalid request parameters",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## Development

### Run Locally
```bash
cd services/api-gateway

# With environment variables
deno run --allow-net --allow-env \
  --env-file=../../.env \
  main.ts
```

### Run with Docker
```bash
docker build -t api-gateway:latest -f services/api-gateway/Dockerfile .
docker run -p 3000:3000 \
  -e PRODUCTS_SERVICE_URL=http://localhost:3003 \
  -e ORDERS_SERVICE_URL=http://localhost:3004 \
  -e CART_SERVICE_URL=http://localhost:3005 \
  api-gateway:latest
```

## Testing

### Test Rate Limiting
```bash
# Make 1001 requests in quick succession
for i in {1..1001}; do
  curl -i http://localhost:3000/api/products 2>/dev/null | grep "X-RateLimit"
done
# Should see 429 after 1000 requests
```

### Test Trace IDs
```bash
# Send request and capture trace ID
TRACE=$(curl -s http://localhost:3000/api/products | grep -i trace)
echo $TRACE
```

### Test Aggregation
```bash
# Test enriched cart endpoint
curl http://localhost:3000/api/carts-enriched/user123

# Response should include full product details, not just IDs
```

## Key Implementation Details

### Middleware Stack
1. **Tracing Middleware** - Adds X-Trace-Id and measures request duration
2. **Rate Limiting Middleware** - Enforces per-IP limits and tracks state
3. **Service-Specific Routes** - Route pattern matching for proxy requests

### Service Client
Uses `ServiceClient` utility from `shared/utils/http-client.ts`:
- Handles authentication headers
- Manages retry logic
- Provides typed responses
- Includes error handling

### Performance Considerations
- Rate limiting tracks state in-memory (not distributed - fine for single instance)
- For multi-instance deployment, use Redis-backed rate limiter
- Trace IDs logged to stdout/Docker logs
- No caching layer implemented yet (potential optimization)

## Deployment

### Production Checklist
- [ ] Set all environment variables for backend service URLs
- [ ] Configure rate limits appropriately for expected traffic
- [ ] Set up log aggregation (e.g., ELK, Splunk)
- [ ] Configure health check monitoring
- [ ] Set up alerting for high error rates
- [ ] Enable CORS if frontend on different domain
- [ ] Add request validation middleware

### Scaling Notes
- Stateless design allows horizontal scaling
- Rate limiting state not shared between instances
- For distributed rate limiting, add Redis backend
- Consider API versioning for backward compatibility

## Troubleshooting

### 503 Service Unavailable
- Verify backend services are running: `docker-compose ps`
- Check service URLs in environment variables
- Verify Docker network connectivity: `docker network inspect`

### High Latency
- Check backend service performance
- Monitor rate limit tracking memory
- Look for cascading failures in dependent services

### Trace Logs Missing
- Ensure stdout is captured (Docker logs)
- Check if logs are being piped to file correctly
- Verify JSON logging format is parseable

## Related Documentation
- [Main README](../../README.md) - Project overview
- [Products Service README](../products-service/README.md)
- [Orders Service README](../orders-service/README.md)
- [Cart Service README](../cart-service/README.md)
- [Deployment Guide](../../docs/DEPLOYMENT.md)
