/** @jsxImportSource preact */
import { Handlers, PageProps } from "$fresh/server.ts";
import { SiteLayout } from "../../components/layout.tsx";
import { getSessionUser, type SessionUser } from "../../utils/auth.ts";
import {
  fetchAllProducts,
  fetchCartItemCount,
  formatCurrency,
  normalizeOrder,
  shopApi,
  type Order,
} from "../../utils/shop.ts";

interface OrderConfirmationData {
  user: SessionUser;
  order: Order | null;
  cartCount: number;
}

export const handler: Handlers<OrderConfirmationData> = {
  async GET(req, ctx) {
    const user = await getSessionUser(req);
    if (!user) {
      return Response.redirect(new URL(`/login?redirect=${encodeURIComponent(new URL(req.url).pathname)}`, req.url), 303);
    }

    const orderId = ctx.params.id!;
    const [orderResult, products, cartCount] = await Promise.all([
      shopApi<Record<string, unknown>>(`/api/orders/${orderId}`),
      fetchAllProducts(),
      fetchCartItemCount(user.id),
    ]);

    if (!orderResult.success || !orderResult.data) {
      return ctx.render({ user, order: null, cartCount });
    }

    const productMap = new Map(products.map((product) => [product.id, product]));
    const order = normalizeOrder(orderResult.data);
    order.items = order.items.map((item) => ({
      ...item,
      productName: item.productName || productMap.get(item.productId)?.name || "Product",
    }));

    return ctx.render({ user, order, cartCount });
  },
};

export default function OrderConfirmationPage(props: PageProps<OrderConfirmationData>) {
  if (!props.data.order) {
    return (
      <SiteLayout title="Order Confirmation" currentPath="/orders" user={props.data.user} cartCount={props.data.cartCount}>
        <div class="rounded-2xl bg-white p-10 text-center shadow-md">
          <p class="text-lg text-gray-600">We could not find that order.</p>
          <a href="/orders" class="mt-4 inline-block rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700">
            View Order History
          </a>
        </div>
      </SiteLayout>
    );
  }

  const order = props.data.order;
  return (
    <SiteLayout title="Order Confirmation" currentPath="/orders" user={props.data.user} cartCount={props.data.cartCount}>
      <div class="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div class="rounded-2xl bg-white p-8 shadow-md">
          <div class="rounded-xl bg-green-50 px-4 py-3 text-green-700">
            Your order has been placed successfully.
          </div>
          <div class="mt-6 grid gap-4 md:grid-cols-2">
            <div class="rounded-xl bg-gray-50 p-4">
              <p class="text-sm uppercase tracking-[0.2em] text-gray-500">Order ID</p>
              <p class="mt-2 font-semibold text-gray-900">{order.id}</p>
            </div>
            <div class="rounded-xl bg-gray-50 p-4">
              <p class="text-sm uppercase tracking-[0.2em] text-gray-500">Status</p>
              <p class="mt-2 font-semibold capitalize text-gray-900">{order.status}</p>
            </div>
          </div>
          <div class="mt-6 rounded-xl border border-gray-200 p-5">
            <h2 class="text-lg font-semibold text-gray-900">Items</h2>
            <div class="mt-4 space-y-4">
              {order.items.map((item) => (
                <div class="flex items-center justify-between gap-4 border-b border-gray-100 pb-4 text-sm">
                  <div>
                    <p class="font-medium text-gray-900">{item.productName}</p>
                    <p class="text-gray-500">Quantity {item.quantity}</p>
                  </div>
                  <p class="font-semibold text-gray-900">{formatCurrency(item.quantity * item.price)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div class="space-y-6">
          <div class="rounded-2xl bg-white p-6 shadow-md">
            <h2 class="text-lg font-semibold text-gray-900">Shipping</h2>
            <pre class="mt-4 whitespace-pre-wrap font-sans text-sm text-gray-600">{order.shippingAddress || "Shipping address not available."}</pre>
          </div>
          <div class="rounded-2xl bg-white p-6 shadow-md">
            <div class="flex items-center justify-between text-lg font-semibold text-gray-900">
              <span>Order Total</span>
              <span>{formatCurrency(order.total)}</span>
            </div>
            <a href="/orders" class="mt-5 inline-block rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700">
              View All Orders
            </a>
          </div>
        </div>
      </div>
    </SiteLayout>
  );
}
