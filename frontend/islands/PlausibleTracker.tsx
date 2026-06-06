/** @jsxImportSource preact */
import { useEffect } from "preact/hooks";

interface Props {
  event: string;
  props?: Record<string, string>;
  /** If set, removes this query param from the URL after the event fires (keeps URLs clean). */
  stripParam?: string;
}

/**
 * Invisible island: fires one Plausible custom event on mount.
 * Used in server-rendered pages to track lifecycle events (Login, Checkout Started, etc.).
 */
export default function PlausibleTracker({ event, props: eventProps, stripParam }: Props) {
  useEffect(() => {
    const plausible = (globalThis as any).plausible as
      | ((name: string, opts?: { props?: Record<string, string> }) => void)
      | undefined;

    if (typeof plausible === "function") {
      plausible(event, eventProps ? { props: eventProps } : undefined);
    }

    if (stripParam) {
      const url = new URL(globalThis.location.href);
      if (url.searchParams.has(stripParam)) {
        url.searchParams.delete(stripParam);
        globalThis.history.replaceState(null, "", url.toString());
      }
    }
  }, []);

  return null;
}
