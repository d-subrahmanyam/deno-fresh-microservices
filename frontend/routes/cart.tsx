/** @jsxImportSource preact */
import { Handlers, PageProps } from "$fresh/server.ts";
import { SiteLayout } from "../components/layout.tsx";
import { OrderSummary } from "../components/order-summary.tsx";
import { EmptyState } from "../components/empty-state.tsx";
import { getSessionUser, loginRedirect, type SessionUser } from "../utils/auth.ts";
import CartRemoveButton from "../islands/CartRemoveButton.tsx";
import {
  buildOrderSummary,
  fetchCartDetails,
  formatCurrency,
  getCartCount,
  shopApi,
  type CartDetails,
} from "../utils/shop.ts";

interface CartData {
  user: SessionUser;
  cart: CartDetails;
  cartCount: number;
}

export const handler: Handlers<CartData> = {
  async GET(req, ctx) {
    const user = await getSessionUser(req);
    if (!user) return loginRedirect(req, "/cart");
    const cart = await fetchCartDetails(user.id);
    return ctx.render({ user, cart, cartCount: getCartCount(cart) });
  },
  async POST(req) {
    const user = await getSessionUser(req);
    if (!user) return loginRedirect(req, "/cart");

    const form = await req.formData();
    const action = String(form.get("action") || "update");
    const productId = String(form.get("productId") || "");

    if (action === "remove") {
      await shopApi(`/api/carts/${user.id}/items/${productId}`, { method: "DELETE" });
    } else {
      const quantity = Math.max(1, Number(form.get("quantity") || "1"));
      await shopApi(`/api/carts/${user.id}/items/${productId}`, {
        method: "PUT",
        body: JSON.stringify({ quantity }),
      });
    }

    return Response.redirect(new URL("/cart", req.url), 303);
  },
};

export default function CartPage(props: PageProps<CartData>) {
  const { user, cart, cartCount } = props.data;
  const summary = buildOrderSummary(cart.cart.total);

  if (cart.itemsWithDetails.length === 0) {
    return (
      <SiteLayout title="Shopping Cart" currentPath="/cart" user={user} cartCount={cartCount}>
        <EmptyState
          message="Your cart is empty."
          href="/products"
          linkText="Continue Shopping"
        />
      </SiteLayout>
    );
  }

  return (
    <SiteLayout title="Shopping Cart" currentPath="/cart" user={user} cartCount={cartCount}>
      <div class="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div class="rounded-2xl bg-white p-6 shadow-md">
          <div class="space-y-5">
            {cart.itemsWithDetails.map((item) => (
              <div class="grid gap-4 rounded-2xl border border-gray-100 p-4 md:grid-cols-[110px_1fr_auto] md:items-center">
                <img
                  src={item.product?.image || "/images/headphones.svg"}
                  alt={item.product?.name || "Product"}
                  class="h-28 w-full rounded-xl object-cover"
                />
                <div>
                  <h2 class="text-lg font-semibold text-gray-900">
                    {item.product?.name || "Product"}
                  </h2>
                  <p class="mt-1 text-sm text-gray-500">
                    {item.product?.description || "No description available."}
                  </p>
                  <p class="mt-3 text-sm font-medium text-gray-700">
                    Unit price {formatCurrency(item.price)}
                  </p>
                  <p class="mt-1 text-lg font-bold text-gray-900">
                    Line total {formatCurrency(item.price * item.quantity)}
                  </p>
                </div>
                <div class="flex flex-col gap-3">
                  <form method="POST" class="space-y-3 rounded-xl bg-gray-50 p-4">
                    <input type="hidden" name="action" value="update" />
                    <input type="hidden" name="productId" value={item.productId} />
                    <label class="block text-sm font-medium text-gray-700">
                      Quantity
                      <input
                        type="number"
                        min="1"
                        name="quantity"
                        value={item.quantity.toString()}
                        class="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2"
                      />
                    </label>
                    <button
                      type="submit"
                      class="w-full rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
                    >
                      Update
                    </button>
                  </form>
                  <form method="POST">
                    <input type="hidden" name="action" value="remove" />
                    <input type="hidden" name="productId" value={item.productId} />
                    <CartRemoveButton productId={item.productId} userId={user.id} />
                  </form>
                </div>
              </div>
            ))}
            <div class="pt-2 text-right">
              <a href="/products" class="text-sm font-semibold text-blue-600 hover:text-blue-700">
                Continue Shopping
              </a>
            </div>
          </div>
        </div>

        <aside class="h-fit rounded-2xl bg-white p-6 shadow-md">
          <h2 class="text-xl font-semibold text-gray-900">Order Summary</h2>
          <div class="mt-6">
            <OrderSummary summary={summary} />
          </div>
          <a
            href="/checkout"
            class="mt-6 block rounded-lg bg-blue-600 px-4 py-3 text-center font-semibold text-white hover:bg-blue-700"
          >
            Proceed to Checkout
          </a>
          {summary.shipping === 0 && (
            <p class="mt-4 text-center text-sm text-gray-500">Free shipping applied.</p>
          )}
        </aside>
      </div>
    </SiteLayout>
  );
}
