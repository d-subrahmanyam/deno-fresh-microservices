/** @jsxImportSource preact */
import { formatCurrency, type OrderSummary as OrderSummaryData } from "../utils/shop.ts";

interface OrderSummaryProps {
  summary: OrderSummaryData;
}

export function OrderSummary({ summary }: OrderSummaryProps) {
  return (
    <div class="space-y-3 text-sm text-gray-600">
      <div class="flex justify-between">
        <span>Subtotal</span>
        <span>{formatCurrency(summary.subtotal)}</span>
      </div>
      <div class="flex justify-between">
        <span>Shipping</span>
        <span>{summary.shipping === 0 ? "Free" : formatCurrency(summary.shipping)}</span>
      </div>
      <div class="flex justify-between">
        <span>Tax (8%)</span>
        <span>{formatCurrency(summary.tax)}</span>
      </div>
      <div class="flex justify-between border-t border-gray-200 pt-3 text-lg font-semibold text-gray-900">
        <span>Total</span>
        <span>{formatCurrency(summary.total)}</span>
      </div>
    </div>
  );
}
