/** @jsxImportSource preact */
import { Handlers, PageProps } from "$fresh/server.ts";
import { SiteLayout } from "../components/layout.tsx";
import { getSessionUser, type SessionUser } from "../utils/auth.ts";
import {
  fetchAllProducts,
  formatCurrency,
  normalizeOrder,
  shopApi,
  type Order,
} from "../utils/shop.ts";

interface OrdersData {
  user: SessionUser;
  orders: Order[];
}

export const handler: Handlers<OrdersData> = {
  async GET(req, ctx) {
    const user = await getSessionUser(req);
    if (!user) {
      return Response.redirect(new URL(`/login?redirect=${encodeURIComponent("/orders")}`, req.url), 303);
    }

    const [ordersResult, products] = await Promise.all([
      shopApi<Record<string, unknown>[]>(`/api/orders?userId=${encodeURIComponent(user.id)}`),
      fetchAllProducts(),
    ]);
    const productMap = new Map(products.map((product) => [product.id, product]));
    const orders = !ordersResult.success || !ordersResult.data
      ? []
      : ordersResult.data.map((order) => {
          const normalized = normalizeOrder(order);
          normalized.items = normalized.items.map((item) => ({
            ...item,
            productName: item.productName || productMap.get(item.productId)?.name || "Product",
          }));
          return normalized;
        });

    return ctx.render({ user, orders });
  },
};

export default function OrdersPage(props: PageProps<OrdersData>) {
  return (
    <SiteLayout title="Order History" currentPath="/orders" user={props.data.user}>
      {props.data.orders.length === 0 ? (
        <div class="rounded-2xl bg-white p-10 text-center shadow-md">
          <p class="text-lg text-gray-600">You have not placed any orders yet.</p>
          <a href="/products" class="mt-4 inline-block rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700">
            Start Shopping
          </a>
        </div>
      ) : (
        <div class="space-y-6">
          {props.data.orders.map((order) => (
            <div class="rounded-2xl bg-white p-6 shadow-md">
              <div class="flex flex-col gap-3 border-b border-gray-100 pb-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p class="text-sm uppercase tracking-[0.2em] text-blue-600">Order {order.id.slice(0, 8)}</p>
                  <p class="mt-1 text-sm text-gray-500">Placed {order.createdAt ? new Date(order.createdAt).toLocaleString() : "recently"}</p>
                </div>
                <div class="flex items-center gap-4">
                  <span class="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700 capitalize">{order.status}</span>
                  <a href={`/order-confirmation/${order.id}`} class="text-sm font-semibold text-blue-600 hover:text-blue-700">View Details</a>
                </div>
              </div>
              <div class="mt-5 space-y-3">
                {order.items.map((item) => (
                  <div class="flex items-center justify-between gap-4 text-sm text-gray-600">
                    <span>{item.productName} × {item.quantity}</span>
                    <span class="font-medium text-gray-900">{formatCurrency(item.quantity * item.price)}</span>
                  </div>
                ))}
              </div>
              <div class="mt-5 border-t border-gray-100 pt-4 text-right font-semibold text-gray-900">
                Total {formatCurrency(order.total)}
              </div>
            </div>
          ))}
        </div>
      )}
    </SiteLayout>
  );
}
