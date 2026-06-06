import { BasicTracerProvider, BatchSpanProcessor } from "npm:@opentelemetry/sdk-trace-base@1.21.0";
import { OTLPTraceExporter } from "npm:@opentelemetry/exporter-trace-otlp-http@0.48.0";
import { Resource } from "npm:@opentelemetry/resources@1.21.0";
import { AsyncLocalStorageContextManager } from "npm:@opentelemetry/context-async-hooks@1.21.0";
import { W3CTraceContextPropagator } from "npm:@opentelemetry/core@1.21.0";
import { trace, propagation, context, SpanKind, SpanStatusCode, ROOT_CONTEXT } from "npm:@opentelemetry/api@1.7.0";

export { trace, propagation, context, SpanKind, SpanStatusCode, ROOT_CONTEXT };
export type { Span } from "npm:@opentelemetry/api@1.7.0";

let _provider: BasicTracerProvider | null = null;

/**
 * Initialise OpenTelemetry tracing.
 * No-op when OTEL_EXPORTER_OTLP_ENDPOINT is not set, so services run fine
 * without the collector (e.g. `docker-compose.yml` without the ELK overlay).
 */
export function initTelemetry(serviceName: string, serviceVersion = "1.0.0"): void {
  const endpoint = Deno.env.get("OTEL_EXPORTER_OTLP_ENDPOINT");
  if (!endpoint) return;

  const provider = new BasicTracerProvider({
    resource: new Resource({
      "service.name": serviceName,
      "service.version": serviceVersion,
    }),
  });

  provider.addSpanProcessor(
    new BatchSpanProcessor(new OTLPTraceExporter({ url: `${endpoint}/v1/traces` })),
  );

  provider.register({
    contextManager: new AsyncLocalStorageContextManager(),
    propagator: new W3CTraceContextPropagator(),
  });

  _provider = provider;
}

/** Flush pending spans and shut down the exporter. Called on graceful shutdown. */
export async function shutdownTelemetry(): Promise<void> {
  if (_provider) {
    await _provider.shutdown();
    _provider = null;
  }
}

export function getTracer(name: string) {
  return trace.getTracer(name);
}
