// Shared type definitions used across all microservices
// Centralizing types ensures consistency in service communication

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  category: string;
  stock: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CartItem {
  productId: string;
  quantity: number;
  price: number;
}

export interface Cart {
  id: string;
  userId: string;
  items: CartItem[];
  total: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  shippingAddress?: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum OrderStatus {
  PENDING = "pending",
  CONFIRMED = "confirmed",
  SHIPPED = "shipped",
  DELIVERED = "delivered",
  CANCELLED = "cancelled",
}

// Standard API response wrapper for consistent error handling
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
  traceId?: string;
}

// Health check response structure
export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  service: string;
  version: string;
  uptime: number;
  checks: Record<string, ComponentHealth>;
}

export interface ComponentHealth {
  status: "healthy" | "unhealthy";
  latency?: number;
  message?: string;
}

// Service registration for discovery
export interface ServiceRegistration {
  name: string;
  address: string;
  port: number;
  tags: string[];
  healthEndpoint: string;
}

// Payment types

export enum PaymentStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  AUTHORIZED = "authorized",
  CAPTURED = "captured",
  FAILED = "failed",
  VOIDED = "voided",
  REFUNDED = "refunded",
}

export interface PaymentMethod {
  cardNumber: string;
  cardExpiry: string;
  cardCvv: string;
  cardHolder: string;
}

export interface Payment {
  id: string;
  orderId: string;
  userId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: string;
  providerTransactionId?: string;
  failureReason?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChargeRequest {
  orderId: string;
  userId: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
}

export interface ProcessorTransaction {
  id: string;
  type: "charge" | "authorize" | "capture" | "void" | "refund";
  amount: number;
  currency: string;
  status: "success" | "declined" | "error";
  cardLast4: string;
  cardBrand: string;
  declineCode?: string;
  parentTransactionId?: string;
  createdAt: Date;
}
