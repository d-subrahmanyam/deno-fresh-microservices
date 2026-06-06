# Plausible Analytics — Fitment Assessment & Implementation

## What Plausible Is

[Plausible Analytics](https://github.com/plausible/analytics) is an open-source, privacy-first web analytics platform. The **Community Edition (CE)** is free under AGPLv3 and ships as a Docker image backed by ClickHouse for event storage and PostgreSQL for metadata. It comes with a purpose-built dashboard — not Kibana, not Grafana, a proper product analytics UI with real-time traffic, geography, devices, and custom events.

---

## Dashboard

Yes — Plausible has its own polished UI at `http://localhost:8001` after self-hosting:

- **Real-time visitor count**
- **Top pages** (which pages get the most visits)
- **Traffic sources** (referrers, UTM campaigns, search engines)
- **Locations** (country, region, city — via IP geolocation)
- **Devices** (browser, OS, screen size)
- **Custom events** with property breakdowns
- **Funnel analysis** (CE v2.x) — visualise add_to_cart → checkout → payment_success drop-off

---

## Fitment Assessment

### What Plausible Covers Out of the Box

| Requirement | Plausible | Notes |
|---|---|---|
| Page visits | **Auto** | Every page view tracked, no code needed |
| Browser type | **Auto** | User-Agent parsed server-side |
| OS / Device | **Auto** | Desktop / mobile / tablet + OS name |
| Country / Region / City | **Auto** | IP geolocation, privacy-safe (no IP stored) |
| Referrer / UTM | **Auto** | Campaign attribution built in |
| Custom events | **Yes** | `plausible('Event Name', {props: {key: 'value'}})` |
| Event properties | **Yes** | String key/value pairs, shown as breakdowns in UI |
| User identity tagging | **Partial** | Pass `userId` as a custom prop on events; no session stitching or user journey replay by design |
| Funnel visualisation | **Yes (CE v2+)** | Multi-step funnels in the Goals tab |
| Real-time dashboard | **Yes** | Live visitor count and top pages |

### What Plausible Does NOT Do

| Limitation | Workaround |
|---|---|
| No persistent user identity / session replay | Keep PostgreSQL `analytics-service` for user-level journeys |
| Custom props must be strings | Stringify numbers before passing |
| Goals must be registered in the dashboard | One-time setup per event name |
| No A/B testing | Out of scope |

### Verdict

Plausible **replaces** Kibana for product analytics (page views, funnels, geography, devices) and **complements** the existing `analytics-service` (user-level event log, Kibana for ops/infra metrics). The two tools cover different concerns and co-exist without overlap.

---

## Architecture After Integration

```
Browser
  │
  ├── page load  ──► Plausible tracker script ──► Plausible CE (port 8001)
  │                        auto: page views, browser, OS, country
  │
  ├── custom event ──► window.plausible('Add to Cart', {props:{...}})
  │                        tracked in Plausible dashboard + Funnel analysis
  │
  └── server handler ──► analytics-service (port 3006, PostgreSQL)
                               user-level event log, traceId linkage

Ops logs ──► GELF ──► Logstash ──► Elasticsearch ──► Kibana
               HTTP spans, domain events, error rates, latency
```

---

## Events Tracked

| Event Name | Trigger | Props Sent |
|---|---|---|
| *(page view)* | Every page load — automatic | — |
| `Login` | Successful authentication | `userId` |
| `Add to Cart` | Add to Cart button click | `userId`, `productId`, `price`, `quantity` |
| `Remove from Cart` | Remove button in cart | `userId`, `productId` |
| `Checkout Started` | Checkout page loads with items | `userId`, `cartTotal` |
| `Payment Submitted` | Place Order & Pay button clicked | `userId`, `amount` |
| `Payment Success` | Order confirmation page loads | `userId`, `orderId`, `amount` |
| `Payment Failed` | Checkout re-renders with payment error | `userId`, `orderId`, `reason` |

---

## Setup — First Run

```bash
# Start the full stack including Plausible
docker-compose -f docker-compose.yml \
               -f docker-compose.elk.yml \
               -f docker-compose.plausible.yml \
               up -d

# 1. Open http://localhost:8001
# 2. Register an admin account (first registration is always open)
# 3. Add a new website — set domain to: localhost
# 4. Skip the script snippet step (already injected by the frontend)
# 5. Visit http://localhost:8000 — you should see a live visitor appear in Plausible

# Register Goals for custom events (one-time, in Plausible dashboard):
#   Goals → Add Goal → Custom Event → name each event exactly:
#     Login, Add to Cart, Remove from Cart,
#     Checkout Started, Payment Submitted, Payment Success, Payment Failed
```

---

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `PLAUSIBLE_URL` | frontend service | URL of the Plausible instance visible from the browser. Default: `http://localhost:8001` |
| `PLAUSIBLE_DOMAIN` | frontend service | Domain registered in Plausible. Must match exactly. Default: `localhost` |

---

## Files Changed

| File | Change |
|---|---|
| `docker-compose.plausible.yml` | New overlay: Plausible CE + ClickHouse + dedicated Postgres |
| `observability/plausible/clickhouse-config.xml` | ClickHouse logging config (reduces noise) |
| `frontend/routes/_app.tsx` | Injects `<script defer data-domain=... src=.../js/script.js>` |
| `frontend/islands/PlausibleTracker.tsx` | Island: fires one event on mount, optionally strips URL query param |
| `frontend/islands/CartRemoveButton.tsx` | Island: fires Remove from Cart event then submits form |
| `frontend/islands/CheckoutSubmitTracker.tsx` | Island: intercepts checkout form submit to fire Payment Submitted |
| `frontend/routes/login.tsx` | POST success redirect appends `?from=login` |
| `frontend/routes/products.tsx` | Renders `PlausibleTracker` for Login event when `?from=login` present |
| `frontend/routes/checkout.tsx` | Renders `PlausibleTracker` for Checkout Started / Payment Failed; adds CheckoutSubmitTracker |
| `frontend/routes/order-confirmation/[id].tsx` | Renders `PlausibleTracker` for Payment Success |
| `frontend/routes/cart.tsx` | Replaces Remove button with `CartRemoveButton` island |
| `frontend/islands/AsyncAddToCartButton.tsx` | Adds `window.plausible('Add to Cart', ...)` call |
| `frontend/fresh.gen.ts` | Adds 3 new islands to the Fresh manifest |
