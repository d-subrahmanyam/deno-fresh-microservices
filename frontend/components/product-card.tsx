/** @jsxImportSource preact */
import { ComponentChildren } from "preact";
import { formatCurrency, type Product } from "../utils/shop.ts";

interface ProductCardProps {
  product: Product;
  compact?: boolean;
  showStock?: boolean;
  action?: ComponentChildren;
}

export function ProductCard(props: ProductCardProps) {
  if (props.compact) {
    return (
      <div class="overflow-hidden rounded-2xl bg-white shadow-md">
        <img src={props.product.image} alt={props.product.name} class="h-40 w-full object-cover" />
        <div class="space-y-2 p-4">
          <p class="text-sm uppercase tracking-[0.2em] text-blue-600">{props.product.category}</p>
          <h3 class="text-lg font-semibold text-gray-900">{props.product.name}</h3>
          <p class="text-sm text-gray-500">{props.product.description}</p>
          <p class="text-lg font-bold text-gray-900">{formatCurrency(props.product.price)}</p>
        </div>
      </div>
    );
  }

  return (
    <div class="overflow-hidden rounded-2xl bg-white shadow-md transition hover:-translate-y-1 hover:shadow-lg">
      <img src={props.product.image} alt={props.product.name} class="h-44 w-full object-cover" />
      <div class="space-y-4 p-5">
        <div>
          <p class="text-xs uppercase tracking-[0.2em] text-blue-600">{props.product.category}</p>
          <h2 class="mt-2 text-xl font-semibold text-gray-900">{props.product.name}</h2>
          <p class="mt-2 line-clamp-3 text-sm text-gray-600">{props.product.description}</p>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-2xl font-bold text-gray-900">{formatCurrency(props.product.price)}</span>
          {props.showStock && (
            <span class="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
              {props.product.stock} in stock
            </span>
          )}
        </div>
        {props.action}
      </div>
    </div>
  );
}
