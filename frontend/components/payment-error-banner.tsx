/** @jsxImportSource preact */

export interface PaymentErrorInfo {
  title: string;
  message: string;
  hint: string;
}

interface PaymentErrorBannerProps {
  error: PaymentErrorInfo;
}

export function PaymentErrorBanner({ error }: PaymentErrorBannerProps) {
  return (
    <div class="rounded-xl border border-red-200 bg-red-50 p-4">
      <div class="flex gap-3">
        <svg
          class="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fill-rule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
            clip-rule="evenodd"
          />
        </svg>
        <div>
          <p class="text-sm font-semibold text-red-800">{error.title}</p>
          <p class="mt-0.5 text-sm text-red-700">{error.message}</p>
          <p class="mt-1.5 text-xs text-red-600">{error.hint}</p>
        </div>
      </div>
    </div>
  );
}
