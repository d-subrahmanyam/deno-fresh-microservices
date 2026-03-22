export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
  traceId?: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  category: string;
  stock: number;
  createdAt?: string;
  updatedAt?: string;
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
  createdAt?: string;
  updatedAt?: string;
}

export interface CartItemWithDetails extends CartItem {
  product: Product | null;
}

export interface CartDetails {
  cart: Cart;
  itemsWithDetails: CartItemWithDetails[];
}

export interface OrderItem {
  productId: string;
  productName?: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  total: number;
  status: string;
  shippingAddress?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrderSummary {
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
}

const PRODUCT_IMAGE_MAP: Record<string, string> = {
  "headphones.svg": "/images/headphones.svg",
  "headphones.jpg": "/images/headphones.svg",
  "usb-cable.svg": "/images/usb-cable.svg",
  "usb-cable.jpg": "/images/usb-cable.svg",
  "coffee-maker.svg": "/images/coffee-maker.svg",
  "coffee-maker.jpg": "/images/coffee-maker.svg",
  "running-shoes.svg": "/images/running-shoes.svg",
  "running-shoes.jpg": "/images/running-shoes.svg",
  "water-bottle.svg": "/images/water-bottle.svg",
  "water-bottle.jpg": "/images/water-bottle.svg",
  "stainless-steel-water-bottle.svg": "/images/water-bottle.svg",
  "yoga-mat.svg": "/images/yoga-mat.svg",
  "yoga-mat.jpg": "/images/yoga-mat.svg",
  "laptop-stand.svg": "/images/laptop-stand.svg",
  "laptop-stand.jpg": "/images/laptop-stand.svg",
  "wireless-mouse.svg": "/images/wireless-mouse.svg",
  "wireless-mouse.jpg": "/images/wireless-mouse.svg",
  "glasses.svg": "/images/glasses.svg",
  "blue-light-glasses.svg": "/images/glasses.svg",
  "glasses.jpg": "/images/glasses.svg",
  "desk-lamp.svg": "/images/desk-lamp.svg",
  "desk-lamp.jpg": "/images/desk-lamp.svg",
};

function apiBaseUrl() {
  return Deno.env.get("API_URL") || "http://localhost:3000";
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function toNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export function resolveProductImage(image: string | null | undefined, productName: string) {
  const normalizedImage = (image || `${slugify(productName)}.svg`).toLowerCase();
  const svgCandidate = normalizedImage.replace(/\.(jpg|jpeg|png|webp)$/i, ".svg");

  return PRODUCT_IMAGE_MAP[normalizedImage] ||
    PRODUCT_IMAGE_MAP[svgCandidate] ||
    `/images/${svgCandidate}`;
}

export function normalizeProduct(raw: Record<string, unknown>): Product {
  const name = String(raw.name || "Untitled Product");
  return {
    id: String(raw.id || crypto.randomUUID()),
    name,
    description: String(raw.description || "No description available."),
    price: toNumber(raw.price),
    image: resolveProductImage(raw.image ? String(raw.image) : undefined, name),
    category: String(raw.category || "General"),
    stock: toNumber(raw.stock),
    createdAt: raw.createdAt ? String(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : undefined,
  };
}

export function normalizeOrder(raw: Record<string, unknown>): Order {
  const items = Array.isArray(raw.items)
    ? raw.items.map((item) => ({
        productId: String((item as Record<string, unknown>).productId || ""),
        productName: (item as Record<string, unknown>).productName
          ? String((item as Record<string, unknown>).productName)
          : undefined,
        quantity: toNumber((item as Record<string, unknown>).quantity),
        price: toNumber((item as Record<string, unknown>).price),
      }))
    : [];

  return {
    id: String(raw.id || ""),
    userId: String(raw.userId || ""),
    items,
    total: toNumber(raw.total),
    status: String(raw.status || "pending"),
    shippingAddress: raw.shippingAddress ? String(raw.shippingAddress) : undefined,
    createdAt: raw.createdAt ? String(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : undefined,
  };
}

export function buildOrderSummary(subtotal: number): OrderSummary {
  const roundedSubtotal = Number(subtotal.toFixed(2));
  const shipping = roundedSubtotal === 0 ? 0 : roundedSubtotal >= 50 ? 0 : 5;
  const tax = Number((roundedSubtotal * 0.08).toFixed(2));
  const total = Number((roundedSubtotal + shipping + tax).toFixed(2));

  return {
    subtotal: roundedSubtotal,
    shipping,
    tax,
    total,
  };
}

export async function shopApi<T>(path: string, init: RequestInit = {}) {
  const url = new URL(path, apiBaseUrl()).toString();
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json", // Always include Content-Type for all requests
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`[shopApi ${response.status}] ${url}:`, text.substring(0, 500));
    throw new Error(`HTTP ${response.status}: ${text.substring(0, 200)}`);
  }

  const text = await response.text();
  if (!text) {
    throw new Error(`Empty response from ${url}`);
  }

  try {
    const payload = JSON.parse(text) as ApiEnvelope<T>;
    return payload;
  } catch (e) {
    console.error(`[shopApi JSON parse error] ${url}:`, text.substring(0, 500));
    throw new Error(`Failed to parse JSON from ${url}: ${e instanceof Error ? e.message : String(e)}`);
  }
}


export async function fetchAllProducts() {
  const result = await shopApi<Record<string, unknown>[]>("/api/products?limit=100");
  if (!result.success || !result.data) {
    return [];
  }

  return result.data.map((product) => normalizeProduct(product));
}

export async function fetchCartDetails(userId: string): Promise<CartDetails> {
  const result = await shopApi<{ cart: Record<string, unknown>; itemsWithDetails: Array<Record<string, unknown>> }>(`/api/carts/${userId}/details`);

  if (!result.success || !result.data) {
    return {
      cart: {
        id: crypto.randomUUID(),
        userId,
        items: [],
        total: 0,
      },
      itemsWithDetails: [],
    };
  }

  const cartData = result.data.cart;
  const itemsWithDetails = result.data.itemsWithDetails.map((item) => {
    const raw = item as Record<string, unknown>;
    const productData = raw.product && typeof raw.product === "object"
      ? normalizeProduct(raw.product as Record<string, unknown>)
      : null;

    return {
      productId: String(raw.productId || ""),
      quantity: toNumber(raw.quantity),
      price: toNumber(raw.price),
      product: productData,
    };
  });

  return {
    cart: {
      id: String(cartData.id || crypto.randomUUID()),
      userId: String(cartData.userId || userId),
      items: itemsWithDetails.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
      })),
      total: toNumber(cartData.total),
      createdAt: cartData.createdAt ? String(cartData.createdAt) : undefined,
      updatedAt: cartData.updatedAt ? String(cartData.updatedAt) : undefined,
    },
    itemsWithDetails,
  };
}
