import { ServiceClient } from "../../../shared/utils/http-client.ts";
import { ChargeRequest, ProcessorTransaction, ApiResponse } from "../../../shared/types/mod.ts";
import { PaymentProvider, PaymentProviderResult } from "./mod.ts";

// MockProvider delegates to the payment-processor service over HTTP.
// All card outcomes (success, decline, error) are driven by the processor's test-card table.
export class MockProvider implements PaymentProvider {
  readonly name = "mock";
  private client: ServiceClient;

  constructor(processorUrl: string) {
    this.client = new ServiceClient(processorUrl, "payment-gateway");
  }

  async charge(req: ChargeRequest): Promise<PaymentProviderResult> {
    const result = await this.client.post<ProcessorTransaction>("/api/process/charge", {
      cardNumber: req.paymentMethod.cardNumber,
      cardExpiry: req.paymentMethod.cardExpiry,
      cardCvv: req.paymentMethod.cardCvv,
      cardHolder: req.paymentMethod.cardHolder,
      amount: req.amount,
      currency: req.currency,
    });
    return this.toResult(result);
  }

  async authorize(req: ChargeRequest): Promise<PaymentProviderResult> {
    const result = await this.client.post<ProcessorTransaction>("/api/process/authorize", {
      cardNumber: req.paymentMethod.cardNumber,
      cardExpiry: req.paymentMethod.cardExpiry,
      cardCvv: req.paymentMethod.cardCvv,
      cardHolder: req.paymentMethod.cardHolder,
      amount: req.amount,
      currency: req.currency,
    });
    return this.toResult(result);
  }

  async capture(transactionId: string, amount?: number): Promise<PaymentProviderResult> {
    const result = await this.client.post<ProcessorTransaction>(
      `/api/process/${transactionId}/capture`,
      amount !== undefined ? { amount } : {},
    );
    return this.toResult(result);
  }

  async void(transactionId: string): Promise<PaymentProviderResult> {
    const result = await this.client.post<ProcessorTransaction>(
      `/api/process/${transactionId}/void`,
      {},
    );
    return this.toResult(result);
  }

  async refund(transactionId: string, amount?: number): Promise<PaymentProviderResult> {
    const result = await this.client.post<ProcessorTransaction>(
      `/api/process/${transactionId}/refund`,
      amount !== undefined ? { amount } : {},
    );
    return this.toResult(result);
  }

  private toResult(response: ApiResponse<ProcessorTransaction>): PaymentProviderResult {
    if (response.success && response.data) {
      return { success: true, transactionId: response.data.id };
    }
    return {
      success: false,
      errorCode: response.error ?? "provider_error",
      errorMessage: response.error ?? "Payment processor returned an error",
    };
  }
}
