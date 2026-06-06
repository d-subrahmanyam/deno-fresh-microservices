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
  type Payment,
} from "../utils/shop.ts";
import { trackEvent } from "../utils/analytics.ts";
import PlausibleTracker from "../islands/PlausibleTracker.tsx";
import CheckoutSubmitTracker from "../islands/CheckoutSubmitTracker.tsx";

interface CheckoutValues {
  fullName: string;
  email: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  cardHolder: string;
  cardNumber: string;
  cardExpiry: string;
  cardCvv: string;
}

interface CheckoutData {
  user: SessionUser;
  cart: CartDetails;
  values: CheckoutValues;
  errors: Partial<Record<keyof CheckoutValues, string>>;
  formError?: string;
  paymentError?: PaymentErrorInfo;
  cartCount: number;
}

const EMPTY_VALUES: CheckoutValues = {
  fullName: "",
  email: "",
  street: "",
  city: "",
  state: "",
  postalCode: "",
  cardHolder: "",
  cardNumber: "",
  cardExpiry: "",
  cardCvv: "",
};

function redirectToLogin(req: Request) {
  return Response.redirect(new URL(`/login?redirect=${encodeURIComponent("/checkout")}`, req.url), 303);
}

interface PaymentErrorInfo {
  title: string;
  message: string;
  hint: string;
}

const PAYMENT_ERRORS: Record<string, PaymentErrorInfo> = {
  card_declined: {
    title: "Card Declined",
    message: "Your card was declined by the issuing bank.",
    hint: "Please try a different card or contact your bank for more information.",
  },
  insufficient_funds: {
    title: "Insufficient Funds",
    message: "Your card doesn't have enough funds to complete this purchase.",
    hint: "Please use a different card or top up your account and try again.",
  },
  processing_error: {
    title: "Processing Error",
    message: "We encountered a technical issue while processing your payment.",
    hint: "This is usually temporary — please wait a moment and try again.",
  },
  payment_failed: {
    title: "Payment Failed",
    message: "Your payment could not be completed.",
    hint: "Please check your card details and try again.",
  },
  order_failed: {
    title: "Order Could Not Be Placed",
    message: "We were unable to create your order at this time.",
    hint: "Please try again. If the problem persists, contact our support team.",
  },
  checkout_error: {
    title: "Something Went Wrong",
    message: "An unexpected error occurred during checkout.",
    hint: "Please refresh the page and try again.",
  },
};

function resolvePaymentError(code?: string): PaymentErrorInfo {
  if (!code) return PAYMENT_ERRORS.payment_failed;
  return PAYMENT_ERRORS[code] ?? {
    title: "Payment Unsuccessful",
    message: "Your payment could not be processed.",
    hint: "Please try again or use a different payment method.",
  };
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

  if (!values.cardHolder.trim()) errors.cardHolder = "Cardholder name is required.";
  const rawCard = values.cardNumber.replace(/\s/g, "");
  if (!rawCard || rawCard.length < 13 || rawCard.length > 19 || !/^\d+$/.test(rawCard)) {
    errors.cardNumber = "Enter a valid card number (13–19 digits).";
  }
  if (!values.cardExpiry.trim() || !/^\d{2}\/\d{2}$/.test(values.cardExpiry.trim())) {
    errors.cardExpiry = "Enter expiry as MM/YY.";
  }
  if (!values.cardCvv.trim() || !/^\d{3,4}$/.test(values.cardCvv.trim())) {
    errors.cardCvv = "Enter a 3 or 4 digit CVV.";
  }

  return errors;
}

async function buildData(
  user: SessionUser,
  values: CheckoutValues,
  errors: CheckoutData["errors"],
  formError?: string,
  paymentError?: PaymentErrorInfo,
): Promise<CheckoutData> {
  const cart = await fetchCartDetails(user.id);
  const cartCount = cart.cart.items.reduce((sum, item) => sum + item.quantity, 0);
  return { user, cart, values, errors, formError, paymentError, cartCount };
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
        cardHolder: String(form.get("cardHolder") || ""),
        cardNumber: String(form.get("cardNumber") || ""),
        cardExpiry: String(form.get("cardExpiry") || ""),
        cardCvv: String(form.get("cardCvv") || ""),
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
        return ctx.render(await buildData(user, values, {}, undefined, PAYMENT_ERRORS.order_failed));
      }

      const summary = buildOrderSummary(cart.cart.total);

      const paymentResult = await shopApi<Payment>("/api/payments/charge", {
        method: "POST",
        body: JSON.stringify({
          orderId: orderResult.data.id,
          userId: user.id,
          amount: summary.total,
          currency: "USD",
          paymentMethod: {
            cardNumber: values.cardNumber.replace(/\s/g, ""),
            cardExpiry: values.cardExpiry,
            cardCvv: values.cardCvv,
            cardHolder: values.cardHolder,
          },
        }),
      });

      if (!paymentResult.success) {
        trackEvent({
          event: "payment_declined",
          userId: user.id,
          page: "/checkout",
          properties: {
            orderId: orderResult.data.id,
            error: paymentResult.error,
          },
        });
        return ctx.render(await buildData(
          user,
          values,
          {},
          undefined,
          resolvePaymentError(paymentResult.error),
        ));
      }

      trackEvent({
        event: "payment_succeeded",
        userId: user.id,
        page: "/checkout",
        properties: {
          orderId: orderResult.data.id,
          amount: summary.total,
        },
      });
      await shopApi("/api/carts/" + user.id, { method: "DELETE" });
      return Response.redirect(new URL(`/order-confirmation/${orderResult.data.id}`, req.url), 303);
    } catch (error) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: "frontend",
        level: "error",
        event: "checkout_error",
        message: error instanceof Error ? error.message : String(error),
      }));
      const user = await getSessionUser(req);
      return ctx.render(await buildData(
        user || { id: "", email: "", name: "", role: "customer" },
        {} as any,
        {},
        undefined,
        PAYMENT_ERRORS.checkout_error,
      ));
    }
  },
};

export default function CheckoutPage(props: PageProps<CheckoutData>) {
  const summary = buildOrderSummary(props.data.cart.cart.total);

  return (
    <SiteLayout title="Checkout" currentPath="/checkout" user={props.data.user} cartCount={props.data.cartCount}>
      {props.data.cart.itemsWithDetails.length > 0 && (
        <>
          <PlausibleTracker
            event="Checkout Started"
            props={{ userId: props.data.user.id, cartTotal: String(summary.total) }}
          />
          <CheckoutSubmitTracker
            userId={props.data.user.id}
            amount={String(summary.total)}
          />
          {props.data.paymentError && (
            <PlausibleTracker
              event="Payment Failed"
              props={{
                userId: props.data.user.id,
                amount: String(summary.total),
                reason: props.data.paymentError.title,
              }}
            />
          )}
        </>
      )}
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
            {props.data.paymentError && (
              <div class="rounded-xl border border-red-200 bg-red-50 p-4">
                <div class="flex gap-3">
                  <svg class="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd" />
                  </svg>
                  <div>
                    <p class="text-sm font-semibold text-red-800">{props.data.paymentError.title}</p>
                    <p class="mt-0.5 text-sm text-red-700">{props.data.paymentError.message}</p>
                    <p class="mt-1.5 text-xs text-red-600">{props.data.paymentError.hint}</p>
                  </div>
                </div>
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
            <div class="border-t border-gray-200 pt-5">
              <h2 class="mb-4 text-lg font-semibold text-gray-900">Payment</h2>
              <p class="mb-4 text-xs text-gray-500">
                Test cards: <code class="rounded bg-gray-100 px-1">4242424242424242</code> success &nbsp;·&nbsp;
                <code class="rounded bg-gray-100 px-1">4000000000000002</code> declined &nbsp;·&nbsp;
                <code class="rounded bg-gray-100 px-1">4000000000009995</code> insufficient funds
              </p>
              <div class="grid gap-5 md:grid-cols-2">
                {([
                  ["cardHolder", "Cardholder name"],
                  ["cardNumber", "Card number"],
                  ["cardExpiry", "Expiry (MM/YY)"],
                  ["cardCvv", "CVV"],
                ] as const).map(([name, label]) => (
                  <label class={name === "cardHolder" || name === "cardNumber" ? "block md:col-span-2" : "block"}>
                    <span class="mb-2 block text-sm font-medium text-gray-700">{label}</span>
                    <input
                      type={name === "cardCvv" ? "password" : "text"}
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
            </div>
            <button type="submit" class="rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700">
              Place Order &amp; Pay
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
