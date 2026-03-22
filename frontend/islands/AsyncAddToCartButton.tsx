/** @jsxImportSource preact */
import { useState } from "preact/hooks";

interface AsyncAddToCartButtonProps {
  userId: string | null;
  productId: string;
  price: number;
  quantity?: number;
  redirectTo: string;
}

interface ApiEnvelope {
  success: boolean;
  error?: string;
}

export default function AsyncAddToCartButton(props: AsyncAddToCartButtonProps) {
  const [pending, setPending] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const quantity = props.quantity ?? 1;

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget as HTMLFormElement;

    if (!props.userId) {
      globalThis.location.href = `/login?redirect=${encodeURIComponent(props.redirectTo)}`;
      return;
    }

    setPending(true);
    setStatusMessage("");

    try {
      const response = await fetch(`/api/carts/${props.userId}/items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          productId: props.productId,
          price: props.price,
          quantity,
        }),
      });

      const payload = await response.json() as ApiEnvelope;
      if (!response.ok || !payload.success) {
        setStatusMessage(payload.error || "Unable to add item right now.");
        return;
      }

      // Bubble an app-wide event so the header badge can update without reload.
      form.dispatchEvent(
        new CustomEvent("cart:updated", {
          bubbles: true,
          detail: { delta: quantity },
        }),
      );
      setStatusMessage("Added to cart.");
    } catch {
      setStatusMessage("Unable to add item right now.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form method="POST" action="/products" class="space-y-3" onSubmit={onSubmit}>
      <input type="hidden" name="productId" value={props.productId} />
      <input type="hidden" name="price" value={props.price.toString()} />
      <input type="hidden" name="quantity" value={quantity.toString()} />
      <input type="hidden" name="redirectTo" value={props.redirectTo} />
      <button
        type="submit"
        disabled={pending}
        class="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "Adding..." : "Add to Cart"}
      </button>
      {statusMessage && (
        <p class={statusMessage === "Added to cart." ? "text-xs text-emerald-600" : "text-xs text-red-600"}>
          {statusMessage}
        </p>
      )}
    </form>
  );
}
