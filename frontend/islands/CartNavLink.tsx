/** @jsxImportSource preact */
import { useEffect, useState } from "preact/hooks";
import { ShoppingCartIcon } from "../components/icons.tsx";

interface CartUpdatedEvent extends Event {
  detail?: {
    delta?: number;
  };
}

interface CartNavLinkProps {
  isActive: boolean;
  initialCount: number;
}

function linkClass(active: boolean) {
  return active
    ? "text-blue-600 font-semibold flex items-center gap-2"
    : "text-gray-700 hover:text-blue-600 flex items-center gap-2";
}

export default function CartNavLink(props: CartNavLinkProps) {
  const [count, setCount] = useState(props.initialCount);

  useEffect(() => {
    const handler = (event: Event) => {
      const cartEvent = event as CartUpdatedEvent;
      const delta = cartEvent.detail?.delta ?? 0;
      setCount((prev) => Math.max(0, prev + delta));
    };

    document.addEventListener("cart:updated", handler);
    return () => document.removeEventListener("cart:updated", handler);
  }, []);

  return (
    <a href="/cart" class={linkClass(props.isActive)}>
      <span class="relative inline-flex">
        <ShoppingCartIcon class="h-5 w-5" />
        {count > 0 && (
          <span class="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold leading-none text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </span>
      Cart
    </a>
  );
}
