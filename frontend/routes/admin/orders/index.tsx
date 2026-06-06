/** @jsxImportSource preact */
import { Handlers, PageProps } from "$fresh/server.ts";
import { AdminLayout } from "../../../components/admin-layout.tsx";
import { AlertBanner } from "../../../components/alert-banner.tsx";
import { EmptyState } from "../../../components/empty-state.tsx";
import { getSessionUser, type SessionUser } from "../../../utils/auth.ts";
import { formatCurrency, normalizeOrder, shopApi, type Order } from "../../../utils/shop.ts";

const ORDER_STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"] as const;
type OrderStatus = typeof ORDER_STATUSES[number];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-50 text-yellow-700",
  confirmed: "bg-blue-50 text-blue-700",
  shipped: "bg-indigo-50 text-indigo-700",
  delivered: "bg-green-50 text-green-700",
  cancelled: "bg-red-50 text-red-700",
};

interface AdminOrdersData {
  user: SessionUser;
  orders: Order[];
  statusFilter: string;
  error?: string;
  success?: boolean;
}

export const handler: Handlers<AdminOrdersData> = {
  async GET(req, ctx) {
    const user = await getSessionUser(req);
    const url = new URL(req.url);
    const statusFilter = url.searchParams.get("status") || "all";

    const apiUrl = statusFilter === "all"
      ? "/api/orders?limit=100"
      : `/api/orders?status=${encodeURIComponent(statusFilter)}&limit=100`;

    const result = await shopApi<Record<string, unknown>[]>(apiUrl);
    const orders = result.success && result.data ? result.data.map(normalizeOrder) : [];
    const sorted = orders.slice().sort((a, b) =>
      (b.createdAt ?? "").localeCompare(a.createdAt ?? "")
    );

    return ctx.render({
      user: user!,
      orders: sorted,
      statusFilter,
      error: result.success ? undefined : "Failed to load orders.",
      success: url.searchParams.has("success"),
    });
  },
  async POST(req) {
    const form = await req.formData();
    const orderId = String(form.get("orderId") || "");
    const status = String(form.get("status") || "");

    if (orderId && ORDER_STATUSES.includes(status as OrderStatus)) {
      await shopApi(`/api/orders/${orderId}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
    }

    return Response.redirect(new URL("/admin/orders?success", req.url), 303);
  },
};

export default function AdminOrdersPage(props: PageProps<AdminOrdersData>) {
  const { user, orders, statusFilter, error, success } = props.data;

  return (
    <AdminLayout title="Orders" currentPath="/admin/orders" user={user}>
      {/* Status filter */}
      <form method="GET" class="mb-4 flex items-center gap-3">
        <label class="text-sm font-medium text-gray-700">Filter by status:</label>
        <select
          name="status"
          class="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        >
          <option value="all" selected={statusFilter === "all"}>All orders</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s} selected={statusFilter === s} class="capitalize">
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          class="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          Apply
        </button>
      </form>

      {success && (
        <div class="mb-4">
          <AlertBanner variant="success" message="Order status updated." />
        </div>
      )}
      {error && (
        <div class="mb-4">
          <AlertBanner variant="error" message={error} />
        </div>
      )}

      {orders.length === 0
        ? (
          <EmptyState
            message="No orders found."
            href="/admin/orders"
            linkText="View all orders"
          />
        )
        : (
          <div class="rounded-2xl bg-white shadow-sm overflow-hidden">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-100 text-left text-xs uppercase tracking-widest text-gray-400">
                  <th class="px-6 py-4 font-medium">Order ID</th>
                  <th class="px-6 py-4 font-medium">Date</th>
                  <th class="px-6 py-4 font-medium">Items</th>
                  <th class="px-6 py-4 font-medium text-right">Total</th>
                  <th class="px-6 py-4 font-medium">Status</th>
                  <th class="px-6 py-4 font-medium">Update</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} class="border-b border-gray-50 last:border-0">
                    <td class="px-6 py-4 font-mono text-xs text-gray-600">
                      {order.id.slice(0, 8)}…
                    </td>
                    <td class="px-6 py-4 text-gray-500">
                      {order.createdAt
                        ? new Date(order.createdAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td class="px-6 py-4 text-gray-500">{order.items.length} item(s)</td>
                    <td class="px-6 py-4 text-right font-medium text-gray-900">
                      {formatCurrency(order.total)}
                    </td>
                    <td class="px-6 py-4">
                      <span
                        class={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                          STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td class="px-6 py-4">
                      <form method="POST" class="flex items-center gap-2">
                        <input type="hidden" name="orderId" value={order.id} />
                        <select
                          name="status"
                          class="rounded-lg border border-gray-300 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
                        >
                          {ORDER_STATUSES.map((s) => (
                            <option key={s} value={s} selected={order.status === s} class="capitalize">
                              {s.charAt(0).toUpperCase() + s.slice(1)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          class="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                        >
                          Save
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </AdminLayout>
  );
}
