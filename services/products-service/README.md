# Products Service

**Port:** 3003  
**Technology:** Deno + Oak + PostgreSQL  
**Role:** Product catalog management, search, filtering, inventory

## Overview

The Products Service manages the online store's product catalog. It provides:
- **CRUD operations** for products
- **Search and filtering** by category, name, and attributes
- **Pagination** for browsing large product sets
- **Inventory tracking** (stock quantities)
- **Database persistence** with PostgreSQL

## Features

### 📦 Product Management
- **Create Products** - Add new products with full metadata
- **Read Products** - Retrieve single or bulk product data
- **Update Products** - Modify product details and pricing
- **Delete Products** - Remove products from catalog
- **Category System** - Organize products by category

### 🔍 Search & Filtering
- **Full-text Search** - Search by product name and description
- **Category Filtering** - Filter products by category
- **Pagination** - Browse large result sets efficiently
- **Stock Tracking** - View available inventory

### 📊 Sample Data
Pre-loaded with 20+ products across 7 categories:

| Category | Examples | Price Range |
|----------|----------|-------------|
| Electronics | Wireless Headphones, USB-C Cable | $12.99 - $99.99 |
| Home & Kitchen | Coffee Maker, Blender | $29.99 - $89.99 |
| Sports & Outdoors | Running Shoes, Yoga Mat | $39.99 - $129.99 |
| Books | Technical Guides, Biographies | $9.99 - $45.99 |
| Clothing | T-Shirts, Jeans | $19.99 - $79.99 |
| Toys | Board Games, Building Sets | $14.99 - $69.99 |
| Health & Beauty | Vitamins, Skincare | $12.99 - $49.99 |

## API Endpoints

### Get All Products
```
GET /api/products?limit=20&offset=0

Query Parameters:
  - limit: Number of products per page (default: 20, max: 100)
  - offset: Starting position (default: 0)
  - category: Filter by category (optional)
  - search: Search text (optional)

Response:
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "prod-001",
        "name": "Wireless Headphones",
        "description": "Premium noise-cancelling headphones",
        "price": 79.99,
        "image": "https://images.example.com/headphones.jpg",
        "category": "Electronics",
        "stock": 45,
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-01T00:00:00Z"
      },
      ...
    ],
    "total": 125,
    "limit": 20,
    "offset": 0
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Search Products
```
GET /api/products?search=headphones&limit=10

Response:
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "prod-001",
        "name": "Wireless Headphones",
        "description": "Premium noise-cancelling headphones",
        "price": 79.99,
        ...
      }
    ],
    "total": 1,
    "limit": 10,
    "offset": 0
  }
}
```

### Filter by Category
```
GET /api/products?category=Electronics&limit=20

Response: Same structure with filtered products
```

### Get Single Product
```
GET /api/products/{id}

Response:
{
  "success": true,
  "data": {
    "id": "prod-001",
    "name": "Wireless Headphones",
    "description": "Premium noise-cancelling headphones",
    "price": 79.99,
    "image": "https://images.example.com/headphones.jpg",
    "category": "Electronics",
    "stock": 45,
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Create Product (Admin)
```
POST /api/products

Request Body:
{
  "name": "New Product",
  "description": "Product description",
  "price": 49.99,
  "category": "Electronics",
  "image": "https://images.example.com/product.jpg",
  "stock": 100
}

Response:
{
  "success": true,
  "data": {
    "id": "prod-new",
    "name": "New Product",
    ...
  }
}
```

### Update Product (Admin)
```
PUT /api/products/{id}

Request Body: (partial updates allowed)
{
  "price": 59.99,
  "stock": 50,
  "description": "Updated description"
}

Response:
{
  "success": true,
  "data": { ...updated product... }
}
```

### Delete Product (Admin)
```
DELETE /api/products/{id}

Response:
{
  "success": true,
  "data": {
    "id": "prod-xxx",
    "message": "Product deleted successfully"
  }
}
```

## Data Model

### Product Schema
```typescript
interface Product {
  id: string;                    // Unique identifier (UUID)
  name: string;                  // Product name
  description: string;           // Product description
  price: number;                 // Price in USD
  image: string;                 // Product image URL
  category: string;              // Product category
  stock: number;                 // Available quantity
  createdAt: Date;               // Creation timestamp
  updatedAt: Date;               // Last update timestamp
}
```

### Database Schema (PostgreSQL)
```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  image VARCHAR(500),
  category VARCHAR(100),
  stock INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_created_at ON products(created_at);
```

## Configuration

### Environment Variables
```bash
PORT=3003                    # Service port
DB_HOST=postgres             # PostgreSQL host
DB_PORT=5432                 # PostgreSQL port
DB_USER=postgres             # Database user
DB_PASSWORD=postgres         # Database password
DB_NAME=products             # Database name
```

### Docker Compose
```yaml
products-service:
  build:
    context: .
    dockerfile: ./services/products-service/Dockerfile
  ports:
    - "3003:3003"
  environment:
    PORT: "3003"
    DB_HOST: postgres
    DB_PORT: "5432"
    DB_USER: postgres
    DB_PASSWORD: postgres
    DB_NAME: products
  depends_on:
    postgres:
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
  "service": "products-service",
  "timestamp": "2024-01-01T12:00:00Z",
  "dependencies": {
    "database": {
      "status": "healthy",
      "latency": 2
    }
  }
}
```

## Error Responses

### Product Not Found
```
GET /api/products/invalid-id

HTTP 404 Not Found

{
  "success": false,
  "error": "Product not found",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Invalid Request
```
POST /api/products
{ "name": "" }  # Missing required fields

HTTP 400 Bad Request

{
  "success": false,
  "error": "Invalid product data: name is required",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Database Error
```
HTTP 500 Internal Server Error

{
  "success": false,
  "error": "Database error: connection failed",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## Development

### Run Locally
```bash
cd services/products-service

# With PostgreSQL running locally
deno run --allow-net --allow-env \
  --env-file=../../.env \
  main.ts
```

### Run with Docker
```bash
# Start PostgreSQL first
docker run -d \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  postgres:15-alpine

# Build and run service
docker build -t products-service:latest -f services/products-service/Dockerfile .
docker run -p 3003:3003 \
  -e DB_HOST=localhost \
  -e DB_PORT=5432 \
  -e DB_USER=postgres \
  -e DB_PASSWORD=postgres \
  -e DB_NAME=products \
  products-service:latest
```

## Testing

### List Products
```bash
curl http://localhost:3003/api/products
```

### Search Products
```bash
curl "http://localhost:3003/api/products?search=headphones"
```

### Filter by Category
```bash
curl "http://localhost:3003/api/products?category=Electronics"
```

### Pagination
```bash
# Get next 20 items
curl "http://localhost:3003/api/products?limit=20&offset=20"
```

### Get Single Product
```bash
curl http://localhost:3003/api/products/prod-001
```

### Check Health
```bash
curl http://localhost:3003/health
```

## Performance Considerations

### Database Queries
- **Pagination:** Uses `LIMIT` and `OFFSET` for efficient browsing
- **Indexes:** Created on category, name, and creation date
- **Search:** Case-insensitive LIKE queries (could upgrade to full-text search)
- **Connection Pooling:** Handled by Postgres driver

### Optimization Opportunities
1. **Full-Text Search** - Replace LIKE with PostgreSQL `tsvector` for better performance
2. **Caching** - Add Redis layer for frequently accessed products
3. **Lazy Loading** - Only fetch product details as needed
4. **Sorting** - Add sort parameter for popularity, price, rating
5. **Batch Operations** - Support bulk product updates

### Query Costs (Approximate)
- List all products: ~50ms (with pagination)
- Get single product: ~5ms
- Search by name: ~30ms (depends on dataset size)
- Filter by category: ~10ms

## Database Maintenance

### View Products in PostgreSQL
```bash
# Connect to database
docker exec -it microservices-postgres-1 psql -U postgres -d products

# List all products
SELECT id, name, price, category, stock FROM products;

# Find products by category
SELECT * FROM products WHERE category = 'Electronics';

# Check product count
SELECT COUNT(*) FROM products;

# Check low stock items
SELECT name, stock FROM products WHERE stock < 10;
```

### Add Sample Product
```sql
INSERT INTO products (name, description, price, category, stock, image)
VALUES (
  'Laptop Stand',
  'Adjustable aluminum laptop stand',
  39.99,
  'Electronics',
  50,
  'https://images.example.com/stand.jpg'
);
```

## Known Limitations

1. **Stock Management** - Quantities not auto-decremented when orders are created
2. **Image Storage** - Only URLs supported, not file uploads
3. **Search** - Basic text search, no fuzzy matching or typo tolerance
4. **Ratings** - No product ratings or reviews system
5. **Variants** - No support for product variants (size, color, etc.)

## Future Enhancements

- [ ] Full-text search with PostgreSQL tsvector
- [ ] Product ratings and reviews
- [ ] Image upload and storage
- [ ] Product variants (size, color, etc.)
- [ ] Inventory reservations
- [ ] Stock notifications
- [ ] Related products recommendations
- [ ] Bulk operations (import/export)

## Related Documentation
- [Main README](../../README.md) - Project overview
- [API Gateway README](../api-gateway/README.md)
- [Orders Service README](../orders-service/README.md)
- [Cart Service README](../cart-service/README.md)
- [Deployment Guide](../../docs/DEPLOYMENT.md)
