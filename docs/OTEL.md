# ShopHub — OpenTelemetry Distributed Tracing

## Overview

ShopHub uses the [OpenTelemetry](https://opentelemetry.io/) standard for distributed tracing across all backend microservices. Every HTTP request that enters the system produces a **trace** — a tree of spans that records the exact path the request took across services, with per-span timing and attributes.

The backend for storing and visualising traces is **pluggable**: the OTel Collector receives spans in the OTLP format and fans them out to one or more exporters. Swapping to Datadog, Honeycomb, Grafana Tempo, or Zipkin requires only a change to the collector config — no service code changes.

---

## Architecture

```
Browser / curl
      │
      ▼
API Gateway (port 3000)          ← SERVER span
      │  X-Source-Service + traceparent
      ▼
products-service / orders-service / ...   ← SERVER span (child)
      │  (each service-to-service call is a CLIENT span)
      ▼
payment-gateway → payment-processor      ← SERVER + CLIENT spans

All services ──OTLP/HTTP──► OTel Collector (port 4318)
                                    │
                          ┌─────────┴──────────┐
                          ▼                    ▼
                   Jaeger (port 16686)    [add more exporters here]
                   Trace UI               Datadog / Honeycomb / Tempo
```

---

## How It Works

### 1. `shared/utils/telemetry.ts` — initialisation

All tracing machinery lives in one file:

```typescript
import { BasicTracerProvider, BatchSpanProcessor } from "npm:@opentelemetry/sdk-trace-base@1.21.0";
import { OTLPTraceExporter } from "npm:@opentelemetry/exporter-trace-otlp-http@0.48.0";
import { AsyncLocalStorageContextManager } from "npm:@opentelemetry/context-async-hooks@1.21.0";
import { W3CTraceContextPropagator } from "npm:@opentelemetry/core@1.21.0";
```

- **`BasicTracerProvider`** — creates and manages spans
- **`BatchSpanProcessor`** — buffers spans and flushes them to the exporter every 5 s or 512 spans
- **`OTLPTraceExporter`** — sends spans via HTTP to the OTel Collector at `OTEL_EXPORTER_OTLP_ENDPOINT/v1/traces`
- **`AsyncLocalStorageContextManager`** — uses Node.js `AsyncLocalStorage` (available in Deno 1.40+ via Node compat) so the active span is automatically available to any `await`ed code within a request, without passing it explicitly
- **`W3CTraceContextPropagator`** — reads/writes the `traceparent` and `tracestate` HTTP headers per the [W3C Trace Context](https://www.w3.org/TR/trace-context/) spec

`initTelemetry()` is a no-op when `OTEL_EXPORTER_OTLP_ENDPOINT` is not set, so all services run cleanly without the ELK overlay.

### 2. `shared/base-service.ts` — server spans

Every `BaseService` subclass automatically gets OTel instrumentation. The `tracingMiddleware` is the outermost middleware, so it wraps the entire request lifecycle:

```typescript
// 1. Extract incoming traceparent header
const parentCtx = propagation.extract(ROOT_CONTEXT, incomingHeaders);

// 2. Create SERVER span
const span = tracer.startSpan(`${method} ${path}`, { kind: SpanKind.SERVER }, parentCtx);

// 3. Run the rest of the middleware stack inside the OTel context
await context.with(trace.setSpan(parentCtx, span), async () => { await next(); });

// 4. Set status and end the span
span.setAttribute("http.status_code", response.status);
span.setStatus({ code: status >= 500 ? SpanStatusCode.ERROR : SpanStatusCode.OK });
span.end();
```

The `context.with()` call is what enables automatic propagation: because `AsyncLocalStorageContextManager` is registered, every `await` inside that callback inherits the active span — route handlers, database calls, and ServiceClient requests all run within the same OTel context.

The `X-Trace-Id` legacy header is preserved alongside `traceparent` for backward compatibility with Kibana log correlation.

### 3. `shared/utils/http-client.ts` — client spans

`ServiceClient` creates a **CLIENT span** for every outgoing service-to-service call and injects the `traceparent` header, which causes the receiving service to parent its SERVER span under this CLIENT span:

```typescript
const span = tracer.startSpan(`HTTP ${method} ${serviceName}`, {
  kind: SpanKind.CLIENT,
  attributes: { "http.method": method, "http.url": url },
}, context.active());   // ← picks up the parent SERVER span via AsyncLocalStorage

propagation.inject(trace.setSpan(context.active(), span), requestHeaders);
// → adds "traceparent: 00-<traceId>-<spanId>-01" to the outgoing request
```

This produces a full trace tree like:

```
api-gateway: GET /api/products            root SERVER span
  └── api-gateway: HTTP GET api-gateway   CLIENT span (ServiceClient)
        └── products-service: GET /api/products   remote SERVER span
```

### 4. OTel Collector — `observability/otel-collector.yml`

The collector is the **pluggability hub**. It receives spans over OTLP and routes them to any number of backends:

```yaml
receivers:
  otlp:
    protocols:
      grpc:  { endpoint: 0.0.0.0:4317 }
      http:  { endpoint: 0.0.0.0:4318 }   # ← services send here

processors:
  batch:
    timeout: 5s
    send_batch_size: 512

exporters:
  otlp/jaeger:
    endpoint: jaeger:4317
    tls: { insecure: true }

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp/jaeger]   # ← add exporters here to fan out
```

---

## Adding a New Trace Backend

No service code changes required. Edit only `observability/otel-collector.yml`:

### Datadog

```yaml
exporters:
  datadog:
    api:
      site: datadoghq.com
      key: ${DD_API_KEY}

service:
  pipelines:
    traces:
      exporters: [otlp/jaeger, datadog]
```

### Grafana Tempo

```yaml
exporters:
  otlp/tempo:
    endpoint: tempo:4317
    tls: { insecure: true }

service:
  pipelines:
    traces:
      exporters: [otlp/jaeger, otlp/tempo]
```

### Honeycomb

```yaml
exporters:
  otlp/honeycomb:
    endpoint: api.honeycomb.io:443
    headers:
      x-honeycomb-team: ${HONEYCOMB_API_KEY}

service:
  pipelines:
    traces:
      exporters: [otlp/honeycomb]
```

Restart only the collector after the config change:
```bash
docker-compose -f docker-compose.yml -f docker-compose.elk.yml restart otel-collector
```

---

## Environment Variables

| Variable | Set in | Description |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `docker-compose.elk.yml` | Collector URL; unset → OTel disabled |
| `OTEL_SERVICE_NAME` | `docker-compose.elk.yml` | Service label in Jaeger (e.g. `api-gateway`) |

---

## Ports

| Service | Port | Purpose |
|---|---|---|
| OTel Collector | 4317 | OTLP gRPC receiver |
| OTel Collector | 4318 | OTLP HTTP receiver (used by Deno services) |
| OTel Collector | 8888 | Prometheus self-metrics |
| Jaeger UI | 16686 | Trace browser |

---

## Running the Full Stack

```bash
# Start everything including ELK + OTel + Plausible
docker-compose \
  -f docker-compose.yml \
  -f docker-compose.elk.yml \
  -f docker-compose.plausible.yml \
  up --build

# Jaeger trace UI
open http://localhost:16686

# Kibana log UI (traces correlated by traceId)
open http://localhost:5601
```

### Exploring a Trace in Jaeger

1. Open [http://localhost:16686](http://localhost:16686)
2. Select a service (e.g. `api-gateway`) from the **Service** dropdown
3. Click **Find Traces**
4. Click any trace to open the span waterfall — parent and child spans are shown with service labels and durations

### Correlating a Trace with Kibana Logs

Every log line carries `traceId` (the 32-character OTel trace ID). Copy a `traceId` from a Jaeger span and search for it in Kibana Discover:

```
traceId: "fbdedca15de42e86476da5c253375893"
```

This shows every log line across all services that were part of that request.

---

## OTel Collector Self-Metrics

The collector exposes its own Prometheus metrics on port 8888. Check span throughput:

```bash
curl http://localhost:8888/metrics | grep -E "accepted_spans|sent_spans"
# otelcol_receiver_accepted_spans{...} 157
# otelcol_exporter_sent_spans{exporter="otlp/jaeger",...} 157
```

---

## Files Changed

| File | Role |
|---|---|
| `shared/utils/telemetry.ts` | OTel SDK init, provider, exporter, propagator |
| `shared/base-service.ts` | SERVER spans + `context.with()` for all `BaseService` subclasses |
| `shared/utils/http-client.ts` | CLIENT spans + `traceparent` injection per outgoing call |
| `services/api-gateway/main.ts` | OTel instrumentation for the standalone gateway |
| `observability/otel-collector.yml` | Collector pipeline config (the pluggability point) |
| `docker-compose.elk.yml` | Adds `otel-collector` + `jaeger` services; injects `OTEL_*` env vars into all app services |
