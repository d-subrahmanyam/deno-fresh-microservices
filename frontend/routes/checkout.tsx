/** @jsxImportSource preact */
import { Handlers, PageProps } from "$fresh/server.ts";
import { SiteLayout } from "../components/layout.tsx";
import { FormField } from "../components/form-field.tsx";
import { OrderSummary } from "../components/order-summary.tsx";
import { EmptyState } from "../components/empty-state.tsx";
import {
  PaymentErrorBanner,
  type PaymentErrorInfo,
} from "../components/payment-error-banner.tsx";
import { getSessionUser, loginRedirect, type SessionUser } from "../utils/auth.ts";
import {
  buildOrderSummary,
  fetchCartDetails,
  formatCurrency,
  getCartCount,
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
  if (!values.email.trim() || !values.email.includes("@")) {
    errors.email = "A valid email address is required.";
  }
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
  return { user, cart, values, errors, formError, paymentError, cartCount: getCartCount(cart) };
}

export const handler: Handlers<CheckoutData> = {
  async GET(req, ctx) {
    const user = await getSessionUser(req);
    if (!user) return loginRedirect(req, "/checkout");
    return ctx.render(
      await buildData(user, { ...EMPTY_VALUES, fullName: user.name, email: user.email }, {}),
    );
  },
  async POST(req, ctx) {
    try {
      const user = await getSessionUser(req);
      if (!user) return loginRedirect(req, "/checkout");

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

      const shippingAddress =
        `${values.fullName}\n${values.street}\n${values.city}, ${values.state} ${values.postalCode}\n${values.email}`;

      const orderResult = await shopApi<Order>("/api/orders", {
        method: "POST",
        body: JSON.stringify({ userId: user.id, items: orderItems, shippingAddress }),
      });

      if (!orderResult.success || !orderResult.data) {
        return ctx.render(
          await buildData(user, values, {}, undefined, PAYMENT_ERRORS.order_failed),
        );
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
          properties: { orderId: orderResult.data.id, error: paymentResult.error },
        });
        return ctx.render(
          await buildData(user, values, {}, undefined, resolvePaymentError(paymentResult.error)),
        );
      }

      trackEvent({
        event: "payment_succeeded",
        userId: user.id,
        page: "/checkout",
        properties: { orderId: orderResult.data.id, amount: summary.total },
      });
      await shopApi("/api/carts/" + user.id, { method: "DELETE" });
      return Response.redirect(
        new URL(`/order-confirmation/${orderResult.data.id}`, req.url),
        303,
      );
    } catch (error) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: "frontend",
        level: "error",
        event: "checkout_error",
        message: error instanceof Error ? error.message : String(error),
      }));
      const user = await getSessionUser(req);
      return ctx.render(
        await buildData(
          user || { id: "", email: "", name: "", role: "customer" },
          EMPTY_VALUES,
          {},
          undefined,
          PAYMENT_ERRORS.checkout_error,
        ),
      );
    }
  },
};

export default function CheckoutPage(props: PageProps<CheckoutData>) {
  const { user, cart, values, errors, paymentError, cartCount } = props.data;
  const summary = buildOrderSummary(cart.cart.total);

  return (
    <SiteLayout title="Checkout" currentPath="/checkout" user={user} cartCount={cartCount}>
      {cart.itemsWithDetails.length > 0 && (
        <>
          <PlausibleTracker
            event="Checkout Started"
            props={{ userId: user.id, cartTotal: String(summary.total) }}
          />
          <CheckoutSubmitTracker userId={user.id} amount={String(summary.total)} />
          {paymentError && (
            <PlausibleTracker
              event="Payment Failed"
              props={{ userId: user.id, amount: String(summary.total), reason: paymentError.title }}
            />
          )}
        </>
      )}

      {cart.itemsWithDetails.length === 0
        ? <EmptyState message="Your cart is empty." href="/products" linkText="Browse Products" />
        : (
          <div class="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
            <form method="POST" class="rounded-2xl bg-white p-8 shadow-md space-y-5">
              {paymentError && <PaymentErrorBanner error={paymentError} />}

              <div class="grid gap-5 md:grid-cols-2">
                <FormField label="Full name" name="fullName" value={values.fullName} error={errors.fullName} required />
                <FormField label="Email address" name="email" type="email" value={values.email} error={errors.email} required />
                <FormField label="Street address" name="street" value={values.street} error={errors.street} colSpan required />
                <FormField label="City" name="city" value={values.city} error={errors.city} required />
                <FormField label="State" name="state" value={values.state} error={errors.state} required />
                <FormField label="Postal code" name="postalCode" value={values.postalCode} error={errors.postalCode} required />
              </div>

              <div class="border-t border-gray-200 pt-5">
                <h2 class="mb-4 text-lg font-semibold text-gray-900">Payment</h2>
                <p class="mb-4 text-xs text-gray-500">
                  Test cards:{" "}
                  <code class="rounded bg-gray-100 px-1">4242424242424242</code> success
                  &nbsp;·&nbsp;
                  <code class="rounded bg-gray-100 px-1">4000000000000002</code> declined
                  &nbsp;·&nbsp;
                  <code class="rounded bg-gray-100 px-1">4000000000009995</code> insufficient funds
                </p>
                <div class="grid gap-5 md:grid-cols-2">
                  <FormField label="Cardholder name" name="cardHolder" value={values.cardHolder} error={errors.cardHolder} colSpan required />
                  <FormField label="Card number" name="cardNumber" value={values.cardNumber} error={errors.cardNumber} colSpan required />
                  <FormField label="Expiry (MM/YY)" name="cardExpiry" value={values.cardExpiry} error={errors.cardExpiry} required />
                  <FormField label="CVV" name="cardCvv" type="password" value={values.cardCvv} error={errors.cardCvv} required />
                </div>
              </div>

              <button
                type="submit"
                class="rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
              >
                Place Order &amp; Pay
              </button>
            </form>

            <div class="space-y-6">
              <div class="rounded-2xl bg-white p-6 shadow-md">
                <h2 class="text-xl font-semibold text-gray-900">Order Summary</h2>
                <div class="mt-4 space-y-4">
                  {cart.itemsWithDetails.map((item) => (
                    <div class="flex items-center justify-between gap-4 border-b border-gray-100 pb-4">
                      <div>
                        <p class="font-medium text-gray-900">{item.product?.name || "Product"}</p>
                        <p class="text-sm text-gray-500">Qty {item.quantity}</p>
                      </div>
                      <p class="font-semibold text-gray-900">
                        {formatCurrency(item.price * item.quantity)}
                      </p>
                    </div>
                  ))}
                </div>
                <div class="mt-5 border-t border-gray-200 pt-5">
                  <OrderSummary summary={summary} />
                </div>
              </div>
            </div>
          </div>
        )}
    </SiteLayout>
  );
}
