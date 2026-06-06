// Test card definitions for the mock payment processor.
// Card numbers follow Stripe's test card convention so developers can predict outcomes.

export interface CardOutcome {
  status: "success" | "declined" | "error";
  declineCode?: string;
  brand: string;
}

const TEST_CARDS: Record<string, CardOutcome> = {
  "4111111111111111": { status: "success", brand: "Visa" },
  "4242424242424242": { status: "success", brand: "Visa" },
  "5555555555554444": { status: "success", brand: "Mastercard" },
  "4000000000000002": { status: "declined", declineCode: "card_declined", brand: "Visa" },
  "4000000000009995": { status: "declined", declineCode: "insufficient_funds", brand: "Visa" },
  "4000000000000119": { status: "error", declineCode: "processing_error", brand: "Visa" },
};

const DEFAULT_OUTCOME: CardOutcome = { status: "success", brand: "Visa" };

export function getCardOutcome(cardNumber: string): CardOutcome {
  const normalized = cardNumber.replace(/\s/g, "");
  return TEST_CARDS[normalized] ?? DEFAULT_OUTCOME;
}

export function detectBrand(cardNumber: string): string {
  const normalized = cardNumber.replace(/\s/g, "");
  const known = TEST_CARDS[normalized];
  if (known) return known.brand;
  if (normalized.startsWith("4")) return "Visa";
  if (normalized.startsWith("5")) return "Mastercard";
  if (normalized.startsWith("3")) return "Amex";
  return "Unknown";
}
