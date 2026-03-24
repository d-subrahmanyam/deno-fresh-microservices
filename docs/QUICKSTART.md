# Quick Start Guide

Get the ShopHub microservices application up and running in minutes!

## VS Code / Deno Setup

This repository includes workspace settings in `.vscode/settings.json` so VS Code can use the Deno language server for the `services`, `shared`, and `frontend` folders.

If VS Code shows errors such as `Cannot find name 'Deno'` or cannot resolve remote imports from `deno.land`:

- Install the official Deno VS Code extension
- Reload the VS Code window after opening the workspace
- Open the repository root folder, not an individual subfolder

Once the Deno extension is active, files such as `services/api-gateway/main.ts` should resolve `Deno` globals and Oak imports correctly.

## 🚀 Start with Docker Compose (Recommended for Development)

### 1. Clone or download the project

```bash
cd microservices
```

### 2. Start all services

```bash
docker-compose up --build
```

This will start:
- **API Gateway**: http://localhost:3000
- **Frontend**: http://localhost:8000
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

### 3. Access the application

Open your browser and go to:
```
http://localhost:8000
```

### 4. Try the API (Optional)

```bash
# Get all products
curl http://localhost:3000/api/products

# Get specific product
curl http://localhost:3000/api/products/650e8400-e29b-41d4-a716-446655440000

# Create an order
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "items": [
      {
        "productId": "650e8400-e29b-41d4-a716-446655440000",
        "quantity": 1,
        "price": 79.99
      }
    ]
  }'
```

### 5. Stop services

```bash
docker-compose down
```

## 📊 Sample Data

The application comes with pre-loaded sample data:

**Products** (10 sample products):
- Wireless Headphones - $79.99
- USB-C Cable - $12.99
- Coffee Maker - $49.99
- Running Shoes - $89.99
- Water Bottle - $29.99
- Yoga Mat - $34.99
- Laptop Stand - $44.99
- Wireless Mouse - $24.99
- Blue Light Glasses - $39.99
- Desk Lamp - $54.99

**Users** (3 sample users):
- john@example.com
- jane@example.com
- bob@example.com

**Orders** (2 sample orders):
- Order 1: Wireless Headphones (confirmed)
- Order 2: USB-C Cable + Coffee Maker (pending)

## 🔧 Development Workflow

### Option 1: Using Docker Compose

```bash
# Watch logs
docker-compose logs -f

# Watch specific service
docker-compose logs -f products-service

# Scale a service
docker-compose up -d --scale products-service=3

# Rebuild a specific service
docker-compose build --no-cache products-service
```

### Option 2: Local Deno Development

Requires: Deno, PostgreSQL, Redis

```bash
# Terminal 1: PostgreSQL
docker run --rm -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres \
  postgres:15-alpine

# Terminal 2: Redis
docker run --rm -p 6379:6379 redis:7-alpine

# Terminal 3: Products Service
cd services/products-service
deno run --allow-all main.ts

# Terminal 4: Orders Service
cd services/orders-service
deno run --allow-all main.ts

# Terminal 5: Cart Service
cd services/cart-service
deno run --allow-all main.ts

# Terminal 6: API Gateway
cd services/api-gateway
deno run --allow-all main.ts

# Terminal 7: Frontend
cd frontend
deno run -A --watch=static/,routes/ dev.ts
```

### Option 3: Local Kubernetes Cluster

Use the dedicated local Kubernetes profile that builds and deploys local images:

```bash
# From repository root
./kubernetes/local/scripts/deploy.sh

# In another terminal (for local access)
./kubernetes/local/scripts/port-forward.sh
```

Then open:

- Frontend: http://localhost:8000
- API Gateway: http://localhost:3000

For details, troubleshooting, and cleanup:

- `kubernetes/local/README.md`

## 🗄️ Database Access

### Connect to PostgreSQL

```bash
# Using Docker Compose
docker exec -it microservices-postgres-1 psql -U postgres

# List databases
\l

# Connect to products database
\c products

# View products table
SELECT * FROM products;

# View orders table
\c orders
SELECT * FROM orders;
```

### Connect to Redis

```bash
# Using docker-compose
docker exec -it microservices-redis-1 redis-cli

# List all keys
keys *

# Get a specific key
get cart:550e8400-e29b-41d4-a716-446655440000

# Monitor commands
monitor
```

## 📝 API Reference

### Products Service

```bash
# List all products
GET /api/products

# List products by category
GET /api/products?category=Electronics

# Get specific product
GET /api/products/{id}

# Create product
POST /api/products
Body: {
  "name": "Product Name",
  "description": "...",
  "price": 99.99,
  "category": "Electronics",
  "stock": 10,
  "image": "url-to-image"
}

# Update product
PUT /api/products/{id}

# Delete product
DELETE /api/products/{id}
```

### Cart Service

```bash
# Get cart
GET /api/carts/{userId}

# Add to cart
POST /api/carts/{userId}/items
Body: {
  "productId": "...",
  "quantity": 1,
  "price": 99.99
}

# Update quantity
PUT /api/carts/{userId}/items/{productId}
Body: { "quantity": 2 }

# Remove from cart
DELETE /api/carts/{userId}/items/{productId}

# Clear cart
DELETE /api/carts/{userId}
```

### Orders Service

```bash
# List all orders
GET /api/orders

# List user's orders
GET /api/orders?userId={userId}

# Get specific order
GET /api/orders/{orderId}

# Create order
POST /api/orders
Body: {
  "userId": "...",
  "items": [
    {
      "productId": "...",
      "quantity": 1,
      "price": 79.99
    }
  ]
}

# Update order status
PUT /api/orders/{orderId}/status
Body: { "status": "shipped" }

# Valid statuses:
# - pending
# - confirmed
# - shipped
# - delivered
# - cancelled
```

## 🐛 Troubleshooting

### "Connection refused" error

```bash
# Check if Docker is running
docker ps

# Check container logs
docker-compose logs postgres
docker-compose logs api-gateway
```

### Port already in use

```bash
# Find and stop the process
lsof -i :3000  # for API Gateway
lsof -i :8000  # for Frontend
lsof -i :5432  # for PostgreSQL

kill -9 <PID>
```

### Database connection error

```bash
# Check PostgreSQL is healthy
docker exec microservices-postgres-1 pg_isready

# Verify credentials
docker-compose exec postgres psql -U postgres -c "SELECT 1"
```

### Frontend not loading

```bash
# Check frontend logs
docker-compose logs frontend

# Verify Fresh dependencies
docker-compose rebuild frontend
```

### High memory usage

```bash
# Check resource usage
docker stats

# Increase limits in docker-compose.yml
# Under services > [service-name] > deploy
```

## 🚀 Next Steps

### 1. Customize Products

Edit `sample data in database/init.sql`:

```sql
INSERT INTO products (...) VALUES
  ('custom-id', 'My Product', 'Description', 49.99, ...);
```

Then restart: `docker-compose down && docker-compose up`

### 2. Add Real Images

Place images in `frontend/static/images/` and update product URLs in frontend code.

### 3. Deploy to Kubernetes

See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment.

### 4. Add Authentication

Implement JWT in the API Gateway for user management.

### 5. Add Payment Processing

Integrate Stripe, PayPal, or Square for payments.

## 📚 Learn More

- [Architecture Overview](./README.md)
- [Production Deployment](./DEPLOYMENT.md)
- [Full README](./README.md)

## 🆘 Getting Help

- Check service logs: `docker-compose logs [service-name]`
- Check health endpoints: `curl http://localhost:3000/health`
- Review error messages in console

## 📞 Support

For questions or issues:
1. Check the troubleshooting section
2. Review service logs
3. Check API endpoints
4. Read the main README.md

Happy coding! 🎉
