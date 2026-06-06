import { ChargeRequest } from "../../../shared/types/mod.ts";

export interface PaymentProviderResult {
  success: boolean;
  transactionId?: string;
  errorCode?: string;
  errorMessage?: string;
}

// Implement this interface to add a new payment provider (e.g. Stripe, PayPal).
// Register the instance via registerProvider() in main.ts before starting the service.
export interface PaymentProvider {
  readonly name: string;
  charge(req: ChargeRequest): Promise<PaymentProviderResult>;
  authorize(req: ChargeRequest): Promise<PaymentProviderResult>;
  capture(transactionId: string, amount?: number): Promise<PaymentProviderResult>;
  void(transactionId: string): Promise<PaymentProviderResult>;
  refund(transactionId: string, amount?: number): Promise<PaymentProviderResult>;
}

const registry = new Map<string, PaymentProvider>();

export function registerProvider(provider: PaymentProvider): void {
  registry.set(provider.name, provider);
}

export function getProvider(name: string): PaymentProvider {
  const provider = registry.get(name);
  if (!provider) {
    throw new Error(
      `Unknown payment provider: "${name}". Registered providers: ${listProviders().join(", ")}`,
    );
  }
  return provider;
}

export function listProviders(): string[] {
  return [...registry.keys()];
}
