/** @jsxImportSource preact */
import { Handlers, PageProps } from "$fresh/server.ts";
import { AdminLayout } from "../../components/admin-layout.tsx";
import { getSessionUser, type SessionUser } from "../../utils/auth.ts";
import { formatCurrency, normalizeOrder, normalizeProduct, shopApi } from "../../utils/shop.ts";

interface DashboardData {
  user: SessionUser;
  totalOrders: number;
  totalRevenue: number;
  pendingOrders: number;
  lowStockCount: number;
  recentOrders: Array<{
    id: string;
    total: number;
    status: string;
    createdAt?: string;
  }>;
}

export const handler: Handlers<DashboardData> = {
  async GET(req, ctx) {
    const user = await getSessionUser(req);

    const [ordersResult, productsResult] = await Promise.all([
      shopApi<Record<string, unknown>[]>("/api/orders?limit=1000"),
      shopApi<Record<string, unknown>[]>("/api/products?limit=100"),
    ]);

    const orders = ordersResult.success && ordersResult.data
      ? ordersResult.data.map((o) => normalizeOrder(o))
      : [];

    const products = productsResult.success && productsResult.data
      ? productsResult.data.map((p) => normalizeProduct(p))
      : [];

    const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
    const pendingOrders = orders.filter((o) => o.status === "pending").length;
    const lowStockCount = products.filter((p) => p.stock < 5).length;

    const recentOrders = orders
      .slice()
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
      .slice(0, 10)
      .map((o) => ({ id: o.id, total: o.total, status: o.status, createdAt: o.createdAt }));

    return ctx.render({
      user: user!,
      totalOrders: orders.length,
      totalRevenue,
      pendingOrders,
      lowStockCount,
      recentOrders,
    });
  },
};

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div class="rounded-2xl bg-white p-6 shadow-sm">
      <p class="text-sm font-medium uppercase tracking-widest text-gray-400">{label}</p>
      <p class="mt-2 text-3xl font-bold text-gray-900">{value}</p>
      {sub && <p class="mt-1 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-50 text-yellow-700",
  confirmed: "bg-blue-50 text-blue-700",
  shipped: "bg-indigo-50 text-indigo-700",
  delivered: "bg-green-50 text-green-700",
  cancelled: "bg-red-50 text-red-700",
};

export default function AdminDashboard(props: PageProps<DashboardData>) {
  const { totalOrders, totalRevenue, pendingOrders, lowStockCount, recentOrders, user } =
    props.data;

  return (
    <AdminLayout title="Dashboard" currentPath="/admin" user={user}>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Orders" value={totalOrders} />
        <KpiCard label="Total Revenue" value={formatCurrency(totalRevenue)} />
        <KpiCard label="Pending Orders" value={pendingOrders} sub="awaiting processing" />
        <KpiCard
          label="Low Stock"
          value={lowStockCount}
          sub="products with fewer than 5 units"
        />
      </div>

      <div class="mt-8 rounded-2xl bg-white p-6 shadow-sm">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-900">Recent Orders</h2>
          <a href="/admin/orders" class="text-sm font-medium text-blue-600 hover:text-blue-700">
            View all →
          </a>
        </div>
        {recentOrders.length === 0
          ? <p class="py-6 text-center text-sm text-gray-500">No orders yet.</p>
          : (
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-100 text-left text-xs uppercase tracking-widest text-gray-400">
                  <th class="pb-3 font-medium">Order ID</th>
                  <th class="pb-3 font-medium">Date</th>
                  <th class="pb-3 font-medium">Total</th>
                  <th class="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id} class="border-b border-gray-50 last:border-0">
                    <td class="py-3 font-mono text-xs text-gray-600">{order.id.slice(0, 8)}…</td>
                    <td class="py-3 text-gray-500">
                      {order.createdAt
                        ? new Date(order.createdAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td class="py-3 font-medium text-gray-900">{formatCurrency(order.total)}</td>
                    <td class="py-3">
                      <span
                        class={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                          STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {order.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </AdminLayout>
  );
}
