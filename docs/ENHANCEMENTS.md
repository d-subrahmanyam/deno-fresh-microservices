# Future Enhancements Roadmap

This document captures proposed enhancements to ShopHub in priority order, with the files to create or modify for each. Items within a phase can be worked in parallel; phases should be done in order because later phases depend on earlier ones.

---

## Phase 1 — Foundation (no user-facing features; unblocks everything else)

### 1.1 CI/CD Pipeline

**Why first:** Every subsequent change benefits from automated validation. Without CI, any phase-2+ feature risks silent breakage.

**Files to create:**
- `.github/workflows/ci.yml` — lint, type-check, build Docker images, run unit tests on every PR
- `.github/workflows/release.yml` — build and push images to GHCR on merge to `main`

**Files to modify:**
- `deno.json` — add a `"check"` task that runs `deno check` across all service entry points
- Each `services/*/main.ts` — confirm `--check` passes (no new code, just validation)

**Key steps:**
1. `deno check` job runs `deno check services/*/main.ts shared/**/*.ts`
2. Docker build matrix (one job per service image) validates Dockerfiles
3. On green: images tagged `ghcr.io/<org>/shophub-<service>:<sha>`

---

### 1.2 Secret Management

**Why second:** Postgres passwords and `SECRET_KEY_BASE` are in plaintext in compose files. Before adding more credentials (Stripe keys, SMTP passwords) they need a safe home.

**Files to modify:**
- `docker-compose.yml` — replace hardcoded `DB_PASSWORD: postgres` with `${DB_PASSWORD}` references
- `docker-compose.elk.yml` — same for ELK credentials
- `.env.example` — document every required variable (does not exist yet — create it)

**Files to create:**
- `.env.example` — template with placeholder values and comments; committed to git
- `docs/SECRETS.md` — explains the `.env` pattern for local dev and links to Kubernetes `Secret` objects for production

**Note:** `.env` is already in `.gitignore`. The work is adding `.env.example` and auditing every hardcoded credential in the compose files.

---

## Phase 2 — Observability Completeness

The stack has traces and logs. Phase 2 adds the missing pillar: metrics.

### 2.1 Prometheus + Grafana

**Files to create:**
- `observability/prometheus.yml` — scrape config targeting the OTel Collector metrics endpoint (`otel-collector:8888`) and each service's `/metrics` endpoint if added
- `observability/grafana/provisioning/datasources/prometheus.yml` — auto-provision Prometheus datasource
- `observability/grafana/provisioning/dashboards/shophub.json` — pre-built dashboard: request rate, error rate, p95 latency per service, payment funnel conversion

**Files to modify:**
- `docker-compose.elk.yml` — add `prometheus` (port 9090) and `grafana` (port 3100) services
- `observability/otel-collector.yml` — add `prometheusexporter` to the pipeline:
  ```yaml
  exporters:
    prometheus:
      endpoint: "0.0.0.0:8889"
  service:
    pipelines:
      metrics:
        receivers: [otlp]
        processors: [batch]
        exporters: [prometheus]
  ```

**No service code changes required** — the OTel Collector exposes metrics from the existing OTLP pipeline.

---

### 2.2 Alerting Rules

**Files to create:**
- `observability/prometheus-alerts.yml` — alert rules for:
  - Error rate > 5% over 5 min per service
  - p99 latency > 2s
  - Payment failure rate > 10%
  - Service health endpoint returning non-200

**Files to modify:**
- `observability/prometheus.yml` — add `rule_files` reference
- `docker-compose.elk.yml` — optionally add Alertmanager service for Slack/email routing

---

## Phase 3 — Authentication Completeness

### 3.1 User Registration

**Files to modify:**
- `services/auth-service/main.ts` — add `POST /api/auth/register` route:
  - Validates email format, password strength
  - Checks for duplicate email
  - Hashes password with `bcrypt` (already used for login)
  - Inserts into `users` table
  - Returns JWT (same shape as `/api/auth/login` response)
- `database/init.sql` — verify `users` table has no NOT NULL columns without defaults that would block inserts (currently seeded with fixed UUIDs; `INSERT` from register needs to generate its own)

**Files to create:**
- `frontend/routes/register.tsx` — registration form (email, password, confirm password); `POST` handler calls auth service; on success redirects to `/`

---

### 3.2 Password Reset Flow

**Files to modify:**
- `services/auth-service/main.ts` — add:
  - `POST /api/auth/forgot-password` — generates a time-limited token, stores in a `password_reset_tokens` table, triggers notification event via Redis pub/sub
  - `POST /api/auth/reset-password` — validates token, updates password hash, invalidates token
- `database/init.sql` — add `password_reset_tokens` table:
  ```sql
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP
  );
  ```

**Files to create:**
- `frontend/routes/forgot-password.tsx` — email input form
- `frontend/routes/reset-password.tsx` — new password form (reads `?token=` from query string)

**Depends on:** Phase 4.1 (email notifications) to actually deliver the reset link; can stub without email.

---

## Phase 4 — Commerce Completeness

### 4.1 Email Notifications

**New service: `services/notification-service/`**

This service subscribes to Redis pub/sub channels already published by existing services and sends transactional email.

**Files to create:**
- `services/notification-service/main.ts` — extends `BaseService`; subscribes to Redis channels `order_created`, `payment_charged`, `payment_declined`; sends email via HTTP to transactional provider API
- `services/notification-service/templates.ts` — plain-text + HTML templates for order confirmation, payment failure, password reset
- `services/notification-service/Dockerfile` — same multi-stage pattern as existing services

**Files to modify:**
- `docker-compose.yml` — add `notification-service` with `SMTP_API_KEY`, `FROM_EMAIL` env vars
- `.env.example` — document `SMTP_PROVIDER` (resend | postmark | smtp), `SMTP_API_KEY`, `FROM_EMAIL`

**Redis channels already published (no changes needed to publishers):**
- `orders-service` publishes `order_created` — contains `orderId`, `userId`, `total`, `items`
- `payment-gateway` publishes `payment_charged` / `payment_declined` — contains `orderId`, `amount`, `failureReason`

---

### 4.2 Inventory Management

Stock quantities exist on the `Product` model but are never decremented.

**Files to modify:**
- `services/products-service/main.ts` — add internal `POST /api/products/:id/reserve` route (not exposed through API Gateway):
  - Atomically decrements `stock_quantity` where `stock_quantity >= requested`
  - Returns 409 if insufficient stock
- `services/payment-gateway/main.ts` — after a successful charge, publish `inventory_reserve` event via Redis OR call products-service directly via `ServiceClient`
- `services/orders-service/main.ts` — subscribe to `inventory_reserve_failed` to cancel the order and trigger a refund

**Files to modify (database):**
- `database/init.sql` — products table already has `stock_quantity`; add index:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock_quantity) WHERE stock_quantity > 0;
  ```

**Files to create:**
- None — changes are confined to existing services

---

### 4.3 Refund UI

The API already supports `POST /api/payments/:id/refund` but there is no frontend surface.

**Files to modify:**
- `frontend/routes/orders/[id].tsx` — add a "Request Refund" button visible when `order.status === "confirmed"` and `payment.status === "captured"`; button POSTs to `/api/payments/:paymentId/refund` and re-renders with updated status
- `services/api-gateway/main.ts` — confirm the `/api/payments/:path*` proxy already forwards `POST /api/payments/:id/refund` (it should, given the wildcard route)

---

### 4.4 Order Cancellation

**Files to modify:**
- `services/orders-service/main.ts` — add `POST /api/orders/:id/cancel` route; only allowed when `status === "pending"`; updates status to `"cancelled"`, publishes `order_cancelled` to Redis
- `services/payment-gateway/main.ts` — subscribe to `order_cancelled`; if a payment exists in `authorized` state, call `void`; if `captured`, call `refund`
- `frontend/routes/orders/[id].tsx` — add "Cancel Order" button visible when `status === "pending"`

---

## Phase 5 — Product Catalogue Improvements

### 5.1 Sorting and Filtering

**Files to modify:**
- `services/products-service/main.ts` — extend `GET /api/products` to accept:
  - `?sort=price_asc | price_desc | newest | name`
  - `?minPrice=&maxPrice=`
  - `?inStock=true`
  - Update the SQL query to add `ORDER BY` and `WHERE` clauses accordingly
- `frontend/islands/ProductFilters.tsx` — new Preact island (client-side interactivity required); renders sort dropdown and price range inputs; updates URL query params on change, triggering server re-render
- `frontend/routes/index.tsx` — pass sort/filter params from `req.url.searchParams` through to the products API call

---

### 5.2 Product Reviews and Ratings

**New service: `services/reviews-service/`**

**Files to create:**
- `services/reviews-service/main.ts` — routes:
  - `POST /api/reviews` — create review `{ productId, userId, rating, body }`
  - `GET /api/reviews?productId=` — list reviews with pagination
  - `GET /api/reviews/summary/:productId` — returns `{ averageRating, count }` for product cards
- `services/reviews-service/Dockerfile`

**Files to modify:**
- `shared/types/mod.ts` — add `Review`, `ReviewSummary` types
- `docker-compose.yml` — add `reviews-service` on port 3006 with its own PostgreSQL DB
- `database/init.sql` — add `reviews` DB and table
- `services/api-gateway/main.ts` — add `/api/reviews/:path*` proxy route
- `frontend/routes/products/[id].tsx` — render reviews list and star rating input (requires a new island for the interactive star widget)
- `frontend/routes/index.tsx` — fetch `ReviewSummary` for each product and pass to product cards

---

### 5.3 Product Image Upload

**Files to modify:**
- `services/products-service/main.ts` — add `POST /api/products/:id/image` route; accepts `multipart/form-data`; uploads to S3-compatible storage (Cloudflare R2 or MinIO in local dev); stores the public URL in `products.image_url`
- `docker-compose.yml` — add MinIO service for local dev (S3-compatible, free)
- `database/init.sql` — `products` table already has `image_url TEXT`; no schema change needed
- `frontend/components/ProductCard.tsx` — replace emoji fallback with `<img src={product.imageUrl} />` when `imageUrl` is set

**Files to create:**
- `services/products-service/storage.ts` — thin wrapper around the S3 `PutObject` API using `fetch` (no SDK needed for simple upload)

---

## Phase 6 — Search and Discovery

### 6.1 Search Improvements (short-term)

Without a dedicated search engine, improve the existing PostgreSQL search.

**Files to modify:**
- `database/init.sql` — add full-text search index:
  ```sql
  ALTER TABLE products ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english', name || ' ' || coalesce(description, ''))
    ) STORED;
  CREATE INDEX IF NOT EXISTS idx_products_fts ON products USING GIN(search_vector);
  ```
- `services/products-service/main.ts` — replace `ILIKE '%query%'` with `search_vector @@ plainto_tsquery('english', $1)` and add `ts_rank` ordering

---

### 6.2 Dedicated Search Service (long-term)

Replace PostgreSQL FTS with Elasticsearch (already in the ELK stack) or Typesense for relevance ranking and faceted filters.

**Files to create:**
- `services/search-service/main.ts` — indexes product data from Postgres; exposes `GET /api/search?q=&category=&minPrice=&maxPrice=&sort=`
- `services/search-service/indexer.ts` — subscribes to `product_created` / `product_updated` Redis events; maintains search index

**Files to modify:**
- `docker-compose.elk.yml` — optionally add Typesense (if not reusing Elasticsearch)
- `services/api-gateway/main.ts` — route `/api/search` to `search-service`
- `frontend/routes/index.tsx` — update search call to hit `/api/search` instead of `/api/products?search=`

---

## Phase 7 — API Hardening

### 7.1 API Versioning

**Files to modify:**
- `services/api-gateway/main.ts` — prefix all proxy routes with `/v1/`:
  ```
  /v1/products/:path*  →  products-service
  /v1/orders/:path*    →  orders-service
  ...
  ```
- `frontend/utils/shop.ts` — update base path to `/api/v1/`
- All `curl` examples in `README.md` and `docs/` — update paths

**Note:** Keep unversioned routes as aliases returning `Deprecation` response headers for one release cycle.

---

### 7.2 OpenAPI Documentation

**Files to create:**
- `docs/openapi.yml` — hand-authored OpenAPI 3.1 spec covering all API Gateway routes (products, orders, cart, payments, auth, search)
- `docker-compose.yml` — add Swagger UI service pointing at `docs/openapi.yml`

**Files to modify:**
- `README.md` — add link to Swagger UI at `http://localhost:3050`

---

### 7.3 Per-User Rate Limiting

The current rate limiter in `api-gateway/main.ts` is IP-based. After login, a JWT is available.

**Files to modify:**
- `services/api-gateway/main.ts` — extract `userId` from the JWT (already decoded for auth middleware); use `userId` as the Redis rate-limit key for authenticated requests, falling back to IP for unauthenticated ones

**No new files required.** The Redis client and rate-limit middleware already exist in the gateway.

---

## Phase 8 — Admin Capabilities

### 8.1 Admin UI

**Files to create:**
- `frontend/routes/admin/index.tsx` — dashboard (total orders, revenue, low-stock products)
- `frontend/routes/admin/products.tsx` — product list with edit/delete; links to create form
- `frontend/routes/admin/products/new.tsx` — product creation form
- `frontend/routes/admin/products/[id].tsx` — product edit form
- `frontend/routes/admin/orders.tsx` — order list with status filter; inline status update
- `frontend/middleware/admin-auth.ts` — Fresh middleware checking `user.role === "admin"` on all `/admin/*` routes

**Files to modify:**
- `services/auth-service/main.ts` — JWT payload already includes `role`; confirm admin role is set on seeded admin user
- `database/init.sql` — update seeded user to have `role = 'admin'`
- `services/products-service/main.ts` — `PUT /api/products/:id` and `DELETE /api/products/:id` already exist; add `POST /api/products` for creation
- `services/orders-service/main.ts` — confirm `PUT /api/orders/:id/status` exists and accepts all valid transitions

---

## Build Order Summary

| Phase | Enhancement | Depends On |
|-------|-------------|------------|
| 1.1 | CI/CD Pipeline | — |
| 1.2 | Secret Management | — |
| 2.1 | Prometheus + Grafana | 1.1 |
| 2.2 | Alerting Rules | 2.1 |
| 3.1 | User Registration | 1.2 |
| 3.2 | Password Reset | 3.1, 4.1 |
| 4.1 | Email Notifications | 1.2 |
| 4.2 | Inventory Management | — |
| 4.3 | Refund UI | — |
| 4.4 | Order Cancellation | 4.3 |
| 5.1 | Sort and Filter | — |
| 5.2 | Product Reviews | — |
| 5.3 | Product Image Upload | 1.2 |
| 6.1 | PostgreSQL FTS Improvements | — |
| 6.2 | Dedicated Search Service | 6.1 |
| 7.1 | API Versioning | — |
| 7.2 | OpenAPI Docs | 7.1 |
| 7.3 | Per-User Rate Limiting | 3.1 |
| 8.1 | Admin UI | 3.1, 5.3 |

---

## Port Reference (after all phases)

| Port | Service |
|------|---------|
| 3000 | API Gateway |
| 3001 | Payment Gateway |
| 3002 | Payment Processor |
| 3003 | Products Service |
| 3004 | Orders Service |
| 3005 | Cart Service |
| 3006 | Reviews Service (new) |
| 3007 | Notification Service (new) |
| 3008 | Search Service (new, phase 6.2) |
| 3009 | Auth Service |
| 3010 | Analytics Service |
| 8080 | Frontend (Fresh) |
| 9200 | Elasticsearch |
| 5601 | Kibana |
| 16686 | Jaeger |
| 9090 | Prometheus (new) |
| 3100 | Grafana (new) |
| 9000 | MinIO (new, phase 5.3) |
