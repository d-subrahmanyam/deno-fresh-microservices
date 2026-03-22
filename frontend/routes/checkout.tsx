/** @jsxImportSource preact */
import { Handlers, PageProps } from "$fresh/server.ts";
import { SiteLayout } from "../components/layout.tsx";
import { getSessionUser, type SessionUser } from "../utils/auth.ts";
import {
  buildOrderSummary,
  fetchCartDetails,
  formatCurrency,
  shopApi,
  type CartDetails,
  type Order,
} from "../utils/shop.ts";

interface CheckoutValues {
  fullName: string;
  email: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
}

interface CheckoutData {
  user: SessionUser;
  cart: CartDetails;
  values: CheckoutValues;
  errors: Partial<Record<keyof CheckoutValues, string>>;
  formError?: string;
}

const EMPTY_VALUES: CheckoutValues = {
  fullName: "",
  email: "",
  street: "",
  city: "",
  state: "",
  postalCode: "",
};

function redirectToLogin(req: Request) {
  return Response.redirect(new URL(`/login?redirect=${encodeURIComponent("/checkout")}`, req.url), 303);
}

function validate(values: CheckoutValues) {
  const errors: Partial<Record<keyof CheckoutValues, string>> = {};

  if (!values.fullName.trim()) errors.fullName = "Full name is required.";
  if (!values.email.trim() || !values.email.includes("@")) errors.email = "A valid email address is required.";
  if (!values.street.trim()) errors.street = "Street address is required.";
  if (!values.city.trim()) errors.city = "City is required.";
  if (!values.state.trim()) errors.state = "State is required.";
  if (!values.postalCode.trim() || values.postalCode.trim().length < 5) {
    errors.postalCode = "Postal code must be at least 5 characters.";
  }

  return errors;
}

async function buildData(user: SessionUser, values: CheckoutValues, errors: CheckoutData["errors"], formError?: string): Promise<CheckoutData> {
  const cart = await fetchCartDetails(user.id);
  return { user, cart, values, errors, formError };
}

export const handler: Handlers<CheckoutData> = {
  async GET(req, ctx) {
    const user = await getSessionUser(req);
    if (!user) return redirectToLogin(req);
    return ctx.render(await buildData(user, EMPTY_VALUES, {}));
  },
  async POST(req, ctx) {
    try {
      const user = await getSessionUser(req);
      if (!user) return redirectToLogin(req);

      const form = await req.formData();
      const values: CheckoutValues = {
        fullName: String(form.get("fullName") || ""),
        email: String(form.get("email") || ""),
        street: String(form.get("street") || ""),
        city: String(form.get("city") || ""),
        state: String(form.get("state") || ""),
        postalCode: String(form.get("postalCode") || ""),
      };
      const errors = validate(values);
      const cart = await fetchCartDetails(user.id);

      if (cart.itemsWithDetails.length === 0) {
        return ctx.render(await buildData(user, values, errors, "Your cart is empty."));
      }

      if (Object.keys(errors).length > 0) {
        return ctx.render(await buildData(user, values, errors));
      }

      const orderItems = cart.itemsWithDetails.map((item) => ({
        productId: item.productId,
        productName: item.product?.name || "Unknown product",
        quantity: item.quantity,
        price: item.price,
      }));

      const shippingAddress = `${values.fullName}\n${values.street}\n${values.city}, ${values.state} ${values.postalCode}\n${values.email}`;
      const orderResult = await shopApi<Order>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          userId: user.id,
          items: orderItems,
          shippingAddress,
        }),
      });

      if (!orderResult.success || !orderResult.data) {
        return ctx.render(await buildData(user, values, {}, orderResult.error || "Unable to create the order."));
      }

      await shopApi("/api/carts/" + user.id, { method: "DELETE" });
      return Response.redirect(new URL(`/order-confirmation/${orderResult.data.id}`, req.url), 303);
    } catch (error) {
      console.error("[Checkout POST Error]", error);
      const user = await getSessionUser(req);
      return ctx.render(await buildData(
        user || { id: "", email: "", name: "", role: "customer" },
        {} as any,
        {},
        `Checkout error: ${error instanceof Error ? error.message : String(error)}`
      ));
    }
  },
};

export default function CheckoutPage(props: PageProps<CheckoutData>) {
  const summary = buildOrderSummary(props.data.cart.cart.total);

  return (
    <SiteLayout title="Checkout" currentPath="/checkout" user={props.data.user}>
      {props.data.cart.itemsWithDetails.length === 0 ? (
        <div class="rounded-2xl bg-white p-10 text-center shadow-md">
          <p class="text-lg text-gray-600">Your cart is empty.</p>
          <a href="/products" class="mt-4 inline-block rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700">
            Browse Products
          </a>
        </div>
      ) : (
        <div class="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
          <form method="POST" class="rounded-2xl bg-white p-8 shadow-md space-y-5">
            {props.data.formError && (
              <div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {props.data.formError}
              </div>
            )}
            <div class="grid gap-5 md:grid-cols-2">
              {([
                ["fullName", "Full name"],
                ["email", "Email address"],
                ["street", "Street address"],
                ["city", "City"],
                ["state", "State"],
                ["postalCode", "Postal code"],
              ] as const).map(([name, label]) => (
                <label class={name === "street" ? "block md:col-span-2" : "block"}>
                  <span class="mb-2 block text-sm font-medium text-gray-700">{label}</span>
                  <input
                    type={name === "email" ? "email" : "text"}
                    name={name}
                    value={props.data.values[name]}
                    class="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none transition focus:border-blue-500"
                    required
                  />
                  {props.data.errors[name] && (
                    <span class="mt-2 block text-sm text-red-600">{props.data.errors[name]}</span>
                  )}
                </label>
              ))}
            </div>
            <button type="submit" class="rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700">
              Place Order
            </button>
          </form>

          <div class="space-y-6">
            <div class="rounded-2xl bg-white p-6 shadow-md">
              <h2 class="text-xl font-semibold text-gray-900">Order Summary</h2>
              <div class="mt-5 space-y-4">
                {props.data.cart.itemsWithDetails.map((item) => (
                  <div class="flex items-center justify-between gap-4 border-b border-gray-100 pb-4">
                    <div>
                      <p class="font-medium text-gray-900">{item.product?.name || "Product"}</p>
                      <p class="text-sm text-gray-500">Qty {item.quantity}</p>
                    </div>
                    <p class="font-semibold text-gray-900">{formatCurrency(item.price * item.quantity)}</p>
                  </div>
                ))}
              </div>
              <div class="mt-6 space-y-3 text-sm text-gray-600">
                <div class="flex justify-between"><span>Subtotal</span><span>{formatCurrency(summary.subtotal)}</span></div>
                <div class="flex justify-between"><span>Shipping</span><span>{summary.shipping === 0 ? "Free" : formatCurrency(summary.shipping)}</span></div>
                <div class="flex justify-between"><span>Tax</span><span>{formatCurrency(summary.tax)}</span></div>
                <div class="flex justify-between border-t border-gray-200 pt-3 text-lg font-semibold text-gray-900"><span>Total</span><span>{formatCurrency(summary.total)}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </SiteLayout>
  );
}
