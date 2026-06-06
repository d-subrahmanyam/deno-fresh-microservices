/** @jsxImportSource preact */
import { useEffect } from "preact/hooks";

interface Props {
  userId: string;
  amount: string;
}

/**
 * Invisible island: intercepts the checkout form submit to fire a Plausible
 * "Payment Submitted" event before the browser navigates away.
 */
export default function CheckoutSubmitTracker({ userId, amount }: Props) {
  useEffect(() => {
    const form = document.querySelector('form[method="POST"]') as HTMLFormElement | null;
    if (!form) return;

    function handleSubmit(e: Event) {
      e.preventDefault();
      const plausible = (globalThis as any).plausible as
        | ((name: string, opts?: object) => void)
        | undefined;

      const submit = () => (form as HTMLFormElement).submit();

      if (typeof plausible === "function") {
        plausible("Payment Submitted", {
          props: { userId, amount },
          callback: submit,
        });
        setTimeout(submit, 500);
      } else {
        submit();
      }
    }

    form.addEventListener("submit", handleSubmit);
    return () => form.removeEventListener("submit", handleSubmit);
  }, []);

  return null;
}
