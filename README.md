# ShopHub — Microservices Online Store

A production-ready microservices e-commerce platform built with **Deno**, **Fresh**, **PostgreSQL**, and **Redis**. Features a complete shopping workflow — product browsing, cart management, checkout with payment processing, order tracking — plus a full observability stack (OpenTelemetry traces, ELK logs, Plausible analytics).

---

## Quick Start

### Prerequisites

- Docker & Docker Compose
- 6 GB RAM available (8 GB recommended for the full observability stack)

### VS Code / Deno Setup

This repo includes `.vscode/settings.json` wired for the Deno language server. If VS Code shows `Cannot find name 'Deno'` errors:

- Install the official **Deno** VS Code extension
- Open the **repository root** folder (not a subfolder)
- Reload the VS Code window

### Start the Application

```bash
# Core application only (frontend + all backend services)
docker-compose up --build

# With ELK logs + OpenTelemetry traces + Jaeger
docker-compose -f docker-compose.yml -f docker-compose.elk.yml up --build

# Full stack (adds Plausible analytics on top)
docker-compose -f docker-compose.yml -f docker-compose.elk.yml -f docker-compose.plausible.yml up --build
```

The database initialises with sample products and users automatically.

---

## Features

### Application

- **User Authentication** — JWT-based login with HttpOnly cookies; demo accounts pre-seeded
- **Product Browsing** — full-text search, category filtering, pagination
- **Shopping Cart** — add / remove items, update quantities, live totals
- **Checkout & Payment** — shipping address form, card entry, real-time payment processing via mock gateway; user-friendly error cards for decline / insufficient-funds / processing errors
- **Order Management** — create orders, track status (`pending → confirmed → shipped → delivered`), view history
- **Order Confirmation** — instant confirmation with order ID and shipping details
- **Analytics Dashboard** — `/analytics` page showing event funnel, conversion rate, and recent events

### Technical

- **Distributed Tracing (OTel)** — W3C `traceparent` propagation across all services; full parent→child span trees in Jaeger; pluggable backends via OTel Collector
- **Structured Logging (ELK)** — JSON logs shipped via Docker GELF driver → Logstash → Elasticsearch, queryable in Kibana with pre-built saved searches
- **Product Analytics (Plausible)** — self-hosted CE v2.1 tracking page views, login, add-to-cart, checkout, payment success/failure with user and browser metadata
- **API Rate Limiting** — 1 000 requests/minute per client IP at the gateway
- **Health Checks** — `/health`, `/health/live`, `/health/ready` on every service
- **Graceful Shutdown** — 5-second drain window; OTel spans flushed before exit

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Frontend  :8000                              │
│              Fresh SSR · Preact · Tailwind CSS                       │
│   Login · Products · Cart · Checkout · Orders · Analytics Dashboard  │
└────────────────────────────┬─────────────────────────────────────────┘
                             │ HTTP
                    ┌────────▼────────┐
                    │  API Gateway    │  :3000
                    │  Rate limiting  │
                    │  OTel tracing   │
                    └──┬──┬──┬──┬────┘
                       │  │  │  │
          ┌────────────┘  │  │  └──────────────┐
          │               │  │                 │
    ┌─────▼──────┐  ┌─────▼──┐  ┌─────────────▼──────┐  ┌──────────────┐
    │  Products  │  │ Orders │  │  Payment Gateway   │  │  Analytics   │
    │  Service   │  │Service │  │    :3001           │  │  Service     │
    │  :3003     │  │ :3004  │  │  Provider plugin   │  │  :3006       │
    └─────┬──────┘  └────┬───┘  └──────────┬─────────┘  └──────┬───────┘
          │              │                  │                    │
     PostgreSQL     PostgreSQL +       ┌────▼────────┐     PostgreSQL
                      Redis            │  Payment    │
                                       │  Processor  │
                    ┌──────────────────│    :3002    │
                    │    Cart          │  (mock)     │
                    │   Service        └─────────────┘
                    │   :3005
                    │   Redis
                    └──────────────────┐
                                       │
                              Shared Data Layer
                         (PostgreSQL :5432 · Redis :6379)

──────────────────── Observability ───────────────────────────────────

All services ──OTLP/HTTP──► OTel Collector :4318 ──► Jaeger :16686
All services ──GELF/UDP──►  Logstash :12201 ──► Elasticsearch :9200 ──► Kibana :5601
Frontend     ──events──►    Plausible :8001  (ClickHouse + PostgreSQL)
```

---

## Services & Ports

| Service | Port | Description |
|---|---|---|
| **Frontend** | 8000 | Fresh SSR web app |
| **API Gateway** | 3000 | Single ingress — rate limiting, aggregation, OTel tracing |
| **Payment Gateway** | 3001 | Pluggable payment provider facade; persists payments to PostgreSQL |
| **Payment Processor** | 3002 | Deterministic mock — processes test cards, persists transactions |
| **Products Service** | 3003 | Product catalog, search, filtering |
| **Orders Service** | 3004 | Order lifecycle, status tracking, Redis pub/sub |
| **Cart Service** | 3005 | Cart management backed by Redis |
| **Analytics Service** | 3006 | Event ingestion and summary API |
| PostgreSQL | 5432 | Relational storage (one database per service) |
| Redis | 6379 | Cart storage and pub/sub |
| Elasticsearch | 9200 | Log index |
| Kibana | 5601 | Log dashboards |
| Logstash | 12201/udp | GELF log ingestion |
| OTel Collector | 4317/4318 | OTLP gRPC / HTTP trace receiver |
| Jaeger | 16686 | Distributed trace UI |
| Plausible | 8001 | Product analytics UI |

---

## Observability UIs

| UI | URL | Purpose |
|---|---|---|
| **Jaeger** | http://localhost:16686 | Distributed trace explorer — span trees across services |
| **Kibana** | http://localhost:5601 | Log search and pre-built dashboards |
| **Plausible** | http://localhost:8001 | Product analytics — page views, custom events, funnels |

> All three start automatically with the full-stack compose command above.

---

## API Endpoints

All routes are proxied through the API Gateway at `http://localhost:3000`.

### Authentication
```
POST  /api/auth/login       Login with email + password (sets HttpOnly session cookie)
POST  /api/auth/logout      Clear session
GET   /api/auth/me          Current user info
```

### Products
```
GET   /api/products                  List products (limit, offset, category, search)
GET   /api/products/{id}             Single product
POST  /api/products                  Create product (admin)
PUT   /api/products/{id}             Update product (admin)
DELETE /api/products/{id}            Delete product (admin)
```

### Shopping Cart
```
GET   /api/carts/{userId}                    Retrieve cart
POST  /api/carts/{userId}/items              Add item
PUT   /api/carts/{userId}/items/{productId}  Update quantity
DELETE /api/carts/{userId}/items/{productId} Remove item
DELETE /api/carts/{userId}                   Clear cart
```

### Orders
```
POST  /api/orders                    Create order
GET   /api/orders                    List orders (?userId=, ?status=)
GET   /api/orders/{id}               Order details
PUT   /api/orders/{id}/status        Update status (admin)
```

### Payments
```
POST  /api/payments/charge           Charge card — creates payment record, updates order status
POST  /api/payments/authorize        Authorize (hold) a payment
POST  /api/payments/{id}/capture     Capture an authorized payment
POST  /api/payments/{id}/void        Void an authorization
POST  /api/payments/{id}/refund      Refund a captured payment
GET   /api/payments/{id}             Payment details
GET   /api/payments                  List payments (?orderId=, ?userId=, ?status=)
```

### Analytics
```
POST  /api/events                    Record a click/page event
GET   /api/events                    List recent events (?limit=)
GET   /api/events/summary            Aggregated stats — total events, unique users, conversion rate, funnel
```

### Health
```
GET   /health                        Full health status (all dependency checks)
GET   /health/live                   Liveness probe
GET   /health/ready                  Readiness probe
```

---

## Payment Test Cards

All card numbers use expiry `12/28` and CVV `123`.

| Card Number | Outcome | Error code |
|---|---|---|
| `4242424242424242` | Success | — |
| `4111111111111111` | Success | — |
| `4000000000000002` | Declined | `card_declined` |
| `4000000000009995` | Declined | `insufficient_funds` |
| `4000000000000119` | Error | `processing_error` |
| Any other number | Success | — |

---

## Data Models

### Payment

```typescript
interface Payment {
  id: string;
  orderId: string;
  userId: string;
  amount: number;
  currency: string;                 // "USD"
  status: PaymentStatus;            // pending | processing | captured | failed | refunded
  provider: string;                 // "mock" by default
  providerTransactionId?: string;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface PaymentMethod {
  cardNumber: string;
  cardExpiry: string;               // "MM/YY"
  cardCvv: string;
  cardHolder: string;
}
```

### Order

```typescript
type OrderStatus = "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";

interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  shippingAddress: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Cart

```typescript
interface CartItem { productId: string; quantity: number; price: number; }
interface Cart {
  id: string; userId: string;
  items: CartItem[]; total: number;
  createdAt: Date; updatedAt: Date;
}
```

---

## Sample Data

**Demo users** (password: `password123`):
- `john@example.com`
- `jane@example.com`
- `bob@example.com`

**Products** — 15+ items across: Electronics, Home & Kitchen, Sports & Outdoors, Books, Clothing, Toys, Health & Beauty

**Pricing rules:**
```
Subtotal < $50  →  shipping $5.00
Subtotal ≥ $50  →  shipping free
Tax: 8% of subtotal
```

---

## Project Structure

```
microservices/
├── shared/
│   ├── types/mod.ts                # Shared types — Product, Order, Payment, ApiResponse …
│   ├── utils/
│   │   ├── http-client.ts          # ServiceClient — retry, timeout, OTel CLIENT spans
│   │   └── telemetry.ts            # OTel init — provider, OTLP exporter, W3C propagator
│   └── base-service.ts             # BaseService — OTel SERVER spans, logging, health routes
│
├── services/
│   ├── api-gateway/                # :3000  Rate limiting, route aggregation, OTel tracing
│   ├── payment-gateway/            # :3001  Pluggable PaymentProvider facade
│   │   └── providers/
│   │       ├── mod.ts              # Provider interface + registry (register / get / list)
│   │       └── mock.ts             # MockProvider → calls payment-processor
│   ├── payment-processor/          # :3002  Deterministic mock, test-card table
│   ├── products-service/           # :3003  Product catalog + search
│   ├── orders-service/             # :3004  Order lifecycle + Redis pub/sub
│   ├── cart-service/               # :3005  Cart backed by Redis
│   └── analytics-service/          # :3006  Event ingestion + summary API
│
├── frontend/
│   ├── routes/
│   │   ├── _app.tsx                # Layout — Plausible script injection
│   │   ├── products.tsx            # Product browse + Login event tracking
│   │   ├── cart.tsx                # Cart with CartRemoveButton island
│   │   ├── checkout.tsx            # Checkout form + payment error cards
│   │   ├── order-confirmation/     # Payment Success event tracking
│   │   ├── analytics.tsx           # Internal analytics dashboard
│   │   └── api/events.ts           # Proxy route → analytics-service
│   ├── islands/
│   │   ├── AsyncAddToCartButton.tsx
│   │   ├── CartRemoveButton.tsx    # Fires Plausible "Remove from Cart" before submit
│   │   ├── CheckoutSubmitTracker.tsx # Fires Plausible "Payment Submitted" before navigate
│   │   └── PlausibleTracker.tsx    # Mount-time custom event emitter
│   └── Dockerfile
│
├── observability/
│   ├── logstash.conf               # GELF input → JSON parse → Elasticsearch output
│   ├── otel-collector.yml          # OTLP receivers → batch → Jaeger exporter
│   ├── kibana-setup.sh             # Auto-creates data view + 4 saved searches
│   └── plausible/
│       ├── clickhouse-config.xml
│       └── clickhouse-ipv4.xml     # Binds ClickHouse to 0.0.0.0 (rootless Docker fix)
│
├── database/init.sql               # Schema for all 6 PostgreSQL databases
├── docker-compose.yml              # Core application services
├── docker-compose.elk.yml          # ELK + OTel Collector + Jaeger overlay
├── docker-compose.plausible.yml    # Plausible CE overlay
└── deno.json                       # Workspace tasks and import map
```

---

## Environment Variables

### Core services (`docker-compose.yml`)

| Variable | Service | Description |
|---|---|---|
| `PORT` | all | Listening port |
| `DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME` | postgres-backed services | Database connection |
| `REDIS_HOST / REDIS_PORT` | orders, cart, payment-gateway | Redis connection |
| `PAYMENT_PROCESSOR_URL` | payment-gateway | Internal URL of payment-processor |
| `ORDERS_SERVICE_URL` | payment-gateway | Used to update order status on charge result |
| `PAYMENT_PROVIDER` | payment-gateway | Active provider name (default: `mock`) |
| `API_URL` | frontend | Internal URL of api-gateway |
| `PAYMENT_GATEWAY_SERVICE_URL` | api-gateway | Internal URL of payment-gateway |

### Observability overlay (`docker-compose.elk.yml`)

| Variable | Description |
|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collector URL, e.g. `http://otel-collector:4318` |
| `OTEL_SERVICE_NAME` | Service label in Jaeger, e.g. `api-gateway` |

### Plausible overlay (`docker-compose.plausible.yml`)

| Variable | Description |
|---|---|
| `PLAUSIBLE_URL` | Browser-reachable Plausible URL, e.g. `http://localhost:8001` |
| `PLAUSIBLE_DOMAIN` | Site domain registered in Plausible (e.g. `localhost`) |

---

## Testing the Application

### Manual end-to-end flow

```
1. Open http://localhost:8000
2. Log in with john@example.com / password123
3. Browse products — search or filter by category
4. Add items to cart
5. Go to Cart → click Checkout
6. Fill shipping address
7. Enter card number 4242424242424242, expiry 12/28, CVV 123
8. Click "Place Order & Pay"
9. Confirm the order confirmation page shows your order ID
10. Visit /orders to see order history
```

Try a declined payment by using card `4000000000000002` — the checkout page shows a user-friendly error card instead of a raw error code.

### Verify all services are healthy

```bash
curl http://localhost:3000/health   # API Gateway
curl http://localhost:3001/health   # Payment Gateway
curl http://localhost:3002/health   # Payment Processor
curl http://localhost:3003/health   # Products Service
curl http://localhost:3004/health   # Orders Service
curl http://localhost:3005/health   # Cart Service
curl http://localhost:3006/health   # Analytics Service
```

### Health response format

```json
{
  "status": "healthy",
  "service": "payment-gateway",
  "version": "1.0.0",
  "uptime": 42,
  "checks": {
    "database": { "status": "healthy", "latency": 3 },
    "redis":    { "status": "healthy", "latency": 1 }
  }
}
```

---

## Database Access

```bash
# PostgreSQL — connect to any database
docker exec -it microservices-postgres-1 psql -U postgres -d payments

# Useful databases: products, orders, analytics, payments, payment_processor
\dt                        # list tables
SELECT * FROM payments;    # view payment records
SELECT * FROM orders;      # view orders

# Redis — inspect cart data
docker exec -it microservices-redis-1 redis-cli
KEYS *
GET cart:user-id-here
```

---

## Local Development (without Docker)

Each service runs independently. You need PostgreSQL and Redis running locally.

```bash
# Products Service
deno run --allow-net --allow-env --allow-read services/products-service/main.ts

# Orders Service
deno run --allow-net --allow-env --allow-read services/orders-service/main.ts

# Cart Service
deno run --allow-net --allow-env --allow-read services/cart-service/main.ts

# Payment Processor
deno run --allow-net --allow-env --allow-read services/payment-processor/main.ts

# Payment Gateway
deno run --allow-net --allow-env --allow-read services/payment-gateway/main.ts

# Analytics Service
deno run --allow-net --allow-env --allow-read services/analytics-service/main.ts

# API Gateway
deno run --allow-net --allow-env --allow-read services/api-gateway/main.ts

# Frontend
cd frontend && deno task start
```

---

## Deployment Guides

| Document | Description |
|---|---|
| [Quick Start](docs/QUICKSTART.md) | Get running in 5 minutes |
| [Architecture](docs/ARCHITECTURE.md) | System design, data model, service contracts |
| [User & Request Flows](docs/FLOWS.md) | Mermaid sequence diagrams for every user journey |
| [OpenTelemetry Tracing](docs/OTEL.md) | OTel implementation, span tree walkthrough, plugging in new backends |
| [Observability & ELK](docs/OBSERVABILITY.md) | GELF pipeline, Logstash config, Kibana dashboards |
| [Payment Services](docs/PAYMENT_SERVICES.md) | Gateway + processor architecture, provider plugin pattern |
| [Plausible Analytics](docs/PLAUSIBLE.md) | Self-hosted analytics setup and event catalogue |
| [Analytics Dashboard](docs/ANALYTICS.md) | Internal `/analytics` route and event schema |
| [Deployment Guide](docs/DEPLOYMENT.md) | Production Kubernetes deployment |
| [Scaling Plan](docs/SCALING_PLAN.md) | Moving to per-service release cycles |
| [Kubernetes Target Structure](docs/KUBERNETES_TARGET_STRUCTURE.md) | Proposed K8s layout and migration path |
| [Local Kubernetes](kubernetes/local/README.md) | Build and deploy to a local cluster |
| [Project Summary](docs/PROJECT_SUMMARY.md) | Full component inventory |
| [Service Ownership & Release Checklist](docs/SERVICE_OWNERSHIP_AND_RELEASE_CHECKLIST.md) | Ownership matrix and release template |

---

## Technologies

| Category | Technology |
|---|---|
| Runtime | Deno 1.40+ |
| Frontend framework | Fresh 1.6 + Preact |
| HTTP framework | Oak v12 |
| Styling | Tailwind CSS |
| Database | PostgreSQL 15 (one DB per service) |
| Cache / pub-sub | Redis 7 |
| Auth | djwt (JWT) |
| Tracing SDK | OpenTelemetry (`sdk-trace-base`, `context-async-hooks`) |
| Trace collector | OTel Collector contrib 0.96 |
| Trace UI | Jaeger all-in-one 1.54 |
| Log pipeline | Logstash 8.11 (GELF input → Elasticsearch output) |
| Log storage | Elasticsearch 8.11 |
| Log UI | Kibana 8.11 |
| Product analytics | Plausible CE v2.1 (ClickHouse 24.3 + PostgreSQL 16) |
| Containerisation | Docker + Docker Compose |
| Orchestration | Kubernetes (optional, YAMLs in `kubernetes/`) |

---

## Troubleshooting

**Services won't start**
```bash
docker-compose logs -f api-gateway
docker-compose logs -f payment-gateway
```

**OTel spans not appearing in Jaeger**
```bash
# Check collector is receiving spans
curl http://localhost:8888/metrics | grep accepted_spans
# Check Jaeger is reachable
curl http://localhost:16686/api/services
```

**Plausible shows "Awaiting first pageview"**
Ensure you're running with the Plausible overlay and using `script.local.js` (automatically selected when `PLAUSIBLE_DOMAIN=localhost`). The standard `script.js` silently drops all localhost traffic.

**Payment always returns processing_error**
Use one of the test cards in the table above. Any unlisted 16-digit number defaults to success.

**High memory usage**
```bash
docker stats   # identify the culprit
# ELK stack uses ~1.5 GB; Plausible (ClickHouse) uses ~1 GB
# Reduce Elasticsearch heap: ES_JAVA_OPTS=-Xms256m -Xmx256m in docker-compose.elk.yml
```

---

## Contributing

1. Fork and create a branch from `main`: `feat/your-feature`
2. Run the full stack locally and validate the happy path (login → add to cart → checkout with `4242…` → order confirmation)
3. Check Jaeger that your changes produce correct span trees
4. Update docs when APIs, environment variables, or architecture change
5. Open a PR with a summary of what changed and why

---

## License

MIT — open source and free to use.
