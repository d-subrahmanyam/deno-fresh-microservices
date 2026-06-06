/** @jsxImportSource preact */

interface AlertBannerProps {
  variant: "success" | "error";
  message: string;
}

export function AlertBanner({ variant, message }: AlertBannerProps) {
  const styles = variant === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-red-200 bg-red-50 text-red-700";
  return (
    <div class={`rounded-xl border px-4 py-3 text-sm ${styles}`}>
      {message}
    </div>
  );
}
