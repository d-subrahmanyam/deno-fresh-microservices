/** @jsxImportSource preact */

interface Props {
  productId: string;
  userId: string;
}

/**
 * Replaces the plain Remove button in the cart page.
 * Fires a Plausible "Remove from Cart" event before the form submits.
 */
export default function CartRemoveButton({ productId, userId }: Props) {
  function handleClick(e: MouseEvent) {
    const form = (e.currentTarget as HTMLElement).closest("form") as HTMLFormElement | null;
    if (!form) return;
    e.preventDefault();

    const plausible = (globalThis as any).plausible as
      | ((name: string, opts?: object) => void)
      | undefined;

    if (typeof plausible === "function") {
      plausible("Remove from Cart", {
        props: { productId, userId },
        callback: () => form.submit(),
      });
      // Fallback: submit even if the beacon never calls back
      setTimeout(() => form.submit(), 500);
    } else {
      form.submit();
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      class="w-full rounded-lg border border-red-200 px-4 py-2 font-semibold text-red-600 hover:bg-red-50"
    >
      Remove
    </button>
  );
}
