/** @jsxImportSource preact */
import { Handlers, PageProps } from "$fresh/server.ts";
import { SiteLayout } from "../components/layout.tsx";
import { getSessionUser, type SessionUser } from "../utils/auth.ts";
import { fetchCartItemCount, formatCurrency, shopApi } from "../utils/shop.ts";

interface AnalyticsSummary {
  totalEvents: number;
  uniqueUsers: number;
  conversionRate: number;
  counts: Record<string, number>;
  funnel: {
    addToCart: number;
    paymentSucceeded: number;
    paymentDeclined: number;
  };
}

interface AnalyticsEvent {
  id: string;
  event: string;
  userId?: string;
  page?: string;
  properties: Record<string, unknown>;
  createdAt: string;
}

interface AnalyticsData {
  user: SessionUser;
  cartCount: number;
  summary: AnalyticsSummary | null;
  recentEvents: AnalyticsEvent[];
  error?: string;
}

export const handler: Handlers<AnalyticsData> = {
  async GET(req, ctx) {
    const user = await getSessionUser(req);
    if (!user) {
      return Response.redirect(
        new URL(`/login?redirect=${encodeURIComponent("/analytics")}`, req.url),
        303,
      );
    }

    const [summaryResult, eventsResult, cartCount] = await Promise.all([
      shopApi<AnalyticsSummary>("/api/events/summary"),
      shopApi<AnalyticsEvent[]>("/api/events?limit=20"),
      fetchCartItemCount(user.id),
    ]);

    return ctx.render({
      user,
      cartCount,
      summary: summaryResult.success && summaryResult.data ? summaryResult.data : null,
      recentEvents: eventsResult.success && eventsResult.data ? eventsResult.data : [],
      error: summaryResult.success ? undefined : "Could not load analytics data.",
    });
  },
};

function StatCard({ value, label, sub }: { value: string | number; label: string; sub?: string }) {
  return (
    <div class="rounded-2xl bg-white p-6 shadow-md text-center">
      <p class="text-4xl font-bold text-blue-600">{value}</p>
      <p class="mt-2 text-sm font-semibold uppercase tracking-widest text-gray-500">{label}</p>
      {sub && <p class="mt-1 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function FunnelBar({ label, count, max, pct, color }: {
  label: string;
  count: number;
  max: number;
  pct: number;
  color: string;
}) {
  const width = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div class="flex items-center gap-4">
      <span class="w-40 flex-shrink-0 text-sm font-medium text-gray-700">{label}</span>
      <div class="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
        <div
          class={`h-6 rounded-full flex items-center pl-3 text-xs font-semibold text-white transition-all ${color}`}
          style={{ width: `${Math.max(width, count > 0 ? 8 : 0)}%` }}
        >
          {count > 0 ? count : ""}
        </div>
      </div>
      <span class="w-20 flex-shrink-0 text-right text-sm text-gray-500">
        {pct}%
      </span>
    </div>
  );
}

export default function AnalyticsPage(props: PageProps<AnalyticsData>) {
  const { summary, recentEvents, error } = props.data;

  const eventColors: Record<string, string> = {
    add_to_cart: "bg-blue-100 text-blue-700",
    payment_succeeded: "bg-green-100 text-green-700",
    payment_declined: "bg-red-100 text-red-700",
  };

  const funnelMax = summary?.funnel.addToCart || 0;

  return (
    <SiteLayout
      title="Click Analytics"
      currentPath="/analytics"
      user={props.data.user}
      cartCount={props.data.cartCount}
    >
      {error && (
        <div class="mb-6 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {summary && (
        <>
          {/* Stat cards */}
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8">
            <StatCard value={summary.totalEvents} label="Total Events" />
            <StatCard value={summary.uniqueUsers} label="Unique Users" />
            <StatCard
              value={`${summary.conversionRate}%`}
              label="Conversion Rate"
              sub="Add to Cart → Payment"
            />
          </div>

          {/* Funnel */}
          <div class="rounded-2xl bg-white p-6 shadow-md mb-8">
            <h2 class="text-lg font-semibold text-gray-800 mb-5">Conversion Funnel</h2>
            <div class="space-y-4">
              <FunnelBar
                label="Add to Cart"
                count={summary.funnel.addToCart}
                max={funnelMax}
                pct={100}
                color="bg-blue-500"
              />
              <FunnelBar
                label="Payment Succeeded"
                count={summary.funnel.paymentSucceeded}
                max={funnelMax}
                pct={funnelMax > 0
                  ? Math.round((summary.funnel.paymentSucceeded / funnelMax) * 100)
                  : 0}
                color="bg-green-500"
              />
              <FunnelBar
                label="Payment Declined"
                count={summary.funnel.paymentDeclined}
                max={funnelMax}
                pct={funnelMax > 0
                  ? Math.round((summary.funnel.paymentDeclined / funnelMax) * 100)
                  : 0}
                color="bg-red-400"
              />
            </div>
          </div>

          {/* Event breakdown */}
          <div class="rounded-2xl bg-white p-6 shadow-md mb-8">
            <h2 class="text-lg font-semibold text-gray-800 mb-4">Events Breakdown</h2>
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-100 text-left text-xs uppercase tracking-widest text-gray-400">
                  <th class="pb-3 font-medium">Event</th>
                  <th class="pb-3 font-medium text-right">Count</th>
                  <th class="pb-3 font-medium text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary.counts).map(([evt, count]) => (
                  <tr key={evt} class="border-b border-gray-50 last:border-0">
                    <td class="py-3">
                      <span class={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        eventColors[evt] ?? "bg-gray-100 text-gray-600"
                      }`}>
                        {evt}
                      </span>
                    </td>
                    <td class="py-3 text-right font-semibold text-gray-800">{count}</td>
                    <td class="py-3 text-right text-gray-500">
                      {summary.totalEvents > 0
                        ? `${Math.round((count / summary.totalEvents) * 100)}%`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Recent events */}
      <div class="rounded-2xl bg-white p-6 shadow-md mb-8">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-gray-800">Recent Events</h2>
          <a
            href="http://localhost:5601/app/discover"
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Deep-dive in Kibana →
          </a>
        </div>
        {recentEvents.length === 0
          ? (
            <p class="text-sm text-gray-500 py-4 text-center">
              No events recorded yet. Add products to cart and complete a checkout to see data here.
            </p>
          )
          : (
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-gray-100 text-left text-xs uppercase tracking-widest text-gray-400">
                    <th class="pb-3 font-medium">Event</th>
                    <th class="pb-3 font-medium">User</th>
                    <th class="pb-3 font-medium">Page</th>
                    <th class="pb-3 font-medium">Properties</th>
                    <th class="pb-3 font-medium text-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEvents.map((evt) => (
                    <tr key={evt.id} class="border-b border-gray-50 last:border-0">
                      <td class="py-2.5">
                        <span class={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          eventColors[evt.event] ?? "bg-gray-100 text-gray-600"
                        }`}>
                          {evt.event}
                        </span>
                      </td>
                      <td class="py-2.5 text-gray-500 font-mono text-xs">
                        {evt.userId ? evt.userId.slice(0, 8) + "…" : "—"}
                      </td>
                      <td class="py-2.5 text-gray-600">{evt.page || "—"}</td>
                      <td class="py-2.5 text-gray-500 text-xs">
                        {Object.entries(evt.properties).map(([k, v]) => (
                          <span key={k} class="mr-2">
                            <span class="text-gray-400">{k}:</span>{" "}
                            {typeof v === "number"
                              ? (k === "price" || k === "amount" ? formatCurrency(v) : v)
                              : String(v)}
                          </span>
                        ))}
                      </td>
                      <td class="py-2.5 text-right text-gray-400 whitespace-nowrap">
                        {new Date(evt.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {/* Kibana link */}
      <div class="rounded-2xl border border-blue-100 bg-blue-50 p-5 text-sm text-blue-700">
        <strong>Kibana Observability</strong> — HTTP access logs, domain events (
        <code class="font-mono text-xs">payment_charged</code>,{" "}
        <code class="font-mono text-xs">order_created</code>), and click events flow into
        Elasticsearch via the GELF pipeline.{" "}
        <a
          href="http://localhost:5601/app/discover"
          target="_blank"
          rel="noopener noreferrer"
          class="underline font-semibold hover:text-blue-800"
        >
          Open Kibana Discover
        </a>{" "}
        and select the <strong>ShopHub Logs</strong> data view.
      </div>
    </SiteLayout>
  );
}
