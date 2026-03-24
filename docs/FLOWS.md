# ShopHub — User Flow and Request Flow Document

This document traces every major user journey end-to-end, from browser interaction through the service mesh to the data stores and back.

---

## 1. Authentication Flows

### 1.1 Login

```mermaid
sequenceDiagram
    actor User
    participant Browser
    participant Frontend as Frontend (Fresh)
    participant Auth as utils/auth.ts

    User->>Browser: Navigate to /login
    Browser->>Frontend: GET /login
    Frontend-->>Browser: Render login form

    User->>Browser: Submit email + password
    Browser->>Frontend: POST /login (form data)
    Frontend->>Auth: authenticateUser(email, password)
    Note over Auth: Searches DEMO_USERS array (in-memory)<br/>Case-insensitive email match
    alt Credentials valid
        Auth-->>Frontend: SessionUser {id, email, name, role}
        Frontend->>Auth: createAuthToken(user)
        Note over Auth: djwt — HS256 JWT<br/>exp: now + 7 days
        Auth-->>Frontend: JWT string
        Frontend->>Auth: setAuthCookie(headers, token)
        Note over Auth: HttpOnly · SameSite=Lax<br/>path=/ · maxAge=604800
        Frontend-->>Browser: 303 → redirect param or /
    else Invalid credentials
        Frontend-->>Browser: Re-render form with error
    end
```

### 1.2 Session Verification (every protected route)

```mermaid
flowchart TD
    Req["Incoming request to protected route"] --> GC["getCookies(req.headers)\nRead shophub_auth cookie"]
    GC -->|Cookie absent| Redirect["303 → /login?redirect=<current path>"]
    GC -->|Cookie present| Verify["verify(token, HMAC-SHA256 key)\ndjwt"]
    Verify -->|Valid| Extract["Extract {id, email, name, role}\nfrom JWT payload"]
    Extract --> Proceed["Continue to route handler\nwith SessionUser"]
    Verify -->|Expired or tampered| Redirect
```

### 1.3 Logout

```mermaid
sequenceDiagram
    actor User
    participant Browser
    participant Frontend as routes/logout.ts

    User->>Browser: Click Logout
    Browser->>Frontend: GET /logout (or POST)
    Frontend->>Frontend: clearAuthCookie(headers)\ndeleteCookie(shophub_auth, path=/)
    Frontend-->>Browser: 303 → /
    Note over Browser: Cookie deleted — user is unauthenticated
```

---

## 2. Product Browsing

### 2.1 Homepage Load

```mermaid
sequenceDiagram
    participant Browser
    participant FE as Frontend (routes/index.tsx)
    participant Gateway as API Gateway
    participant PS as Products Service
    participant CS as Cart Service
    participant PG as PostgreSQL

    Browser->>FE: GET /
    FE->>FE: getSessionUser(req)
    par Parallel fetch
        FE->>Gateway: GET /api/products?limit=100
        Gateway->>PS: GET /api/products?limit=100
        PS->>PG: SELECT * FROM products LIMIT 100
        PG-->>PS: Product rows
        PS-->>Gateway: ApiResponse<Product[]>
        Gateway-->>FE: ApiResponse<Product[]>
    and (if authenticated)
        FE->>Gateway: GET /api/carts/:userId
        Gateway->>CS: GET /api/carts/:userId
        CS-->>Gateway: ApiResponse<Cart>
        Gateway-->>FE: ApiResponse<Cart>
    end
    Note over FE: Slice first 4 products as featured
    FE-->>Browser: SSR HTML — featured products + category links
```

### 2.2 Product Listing Page (with Search and Filter)

```mermaid
sequenceDiagram
    participant Browser
    participant FE as Frontend (routes/products.tsx)
    participant Gateway as API Gateway
    participant PS as Products Service
    participant PG as PostgreSQL

    Browser->>FE: GET /products?q=headphones&category=electronics&page=1
    FE->>FE: getSessionUser(req)
    FE->>Gateway: GET /api/products?limit=100
    Gateway->>PS: GET /api/products?limit=100
    PS->>PG: SELECT * FROM products LIMIT 100
    PG-->>PS: All product rows
    PS-->>Gateway: ApiResponse<Product[]>
    Gateway-->>FE: ApiResponse<Product[]>
    Note over FE: Client-side filter in buildData():<br/>1. Match category (lowercase compare)<br/>2. Search name+description+category<br/>3. Paginate — 8 items per page
    FE-->>Browser: SSR HTML — filtered + paginated product grid
```

---

## 3. Cart Flows

### 3.1 Add Item to Cart

```mermaid
sequenceDiagram
    actor User
    participant Browser
    participant FE as Frontend (routes/products.tsx POST)
    participant Gateway as API Gateway
    participant CS as Cart Service
    participant Redis

    User->>Browser: Click "Add to Cart" form submit
    Browser->>FE: POST /products (productId, price, quantity, redirectTo)
    FE->>FE: getSessionUser(req)
    alt Not authenticated
        FE-->>Browser: 303 → /login?redirect=/products
    else Authenticated
        FE->>Gateway: POST /api/carts/:userId/items\n{productId, price, quantity}
        Gateway->>CS: POST /api/carts/:userId/items
        CS->>Redis: GET cart:{userId}
        alt Cart exists
            Redis-->>CS: Existing cart JSON
        else No cart
            CS->>CS: Create empty Cart {id, userId, items:[], total:0}
        end
        Note over CS: If productId already in cart:<br/>increment quantity<br/>else: push new CartItem<br/>Recalculate total
        CS->>Redis: SETEX cart:{userId} 604800 <cart JSON>
        Redis-->>CS: OK
        CS-->>Gateway: ApiResponse<Cart>
        Gateway-->>FE: ApiResponse<Cart>
        FE-->>Browser: 303 → redirectTo?added=1
    end
```

### 3.2 View Cart (with Product Enrichment)

The cart page uses the gateway's aggregation endpoint, fetching cart data and product details in a single network hop from the frontend.

```mermaid
sequenceDiagram
    participant Browser
    participant FE as Frontend (routes/cart.tsx)
    participant Gateway as API Gateway
    participant CS as Cart Service
    participant PS as Products Service
    participant Redis
    participant PG as PostgreSQL

    Browser->>FE: GET /cart
    FE->>FE: getSessionUser(req) — redirect if unauthenticated
    FE->>Gateway: GET /api/carts/:userId/details
    Note over Gateway: Aggregation endpoint — single call, two parallel fetches
    par Gateway parallel fetch
        Gateway->>CS: GET /api/carts/:userId
        CS->>Redis: GET cart:{userId}
        Redis-->>CS: Cart JSON (or auto-create empty)
        CS-->>Gateway: ApiResponse<Cart>
    and
        Gateway->>PS: GET /api/products
        PS->>PG: SELECT * FROM products
        PG-->>PS: Product rows
        PS-->>Gateway: ApiResponse<Product[]>
    end
    Note over Gateway: Merge: for each CartItem, find matching product by productId<br/>Return {cart, itemsWithDetails[{...item, product}]}
    Gateway-->>FE: Enriched cart response
    FE->>FE: buildOrderSummary(cart.total)<br/>shipping: $5 if total < $50, else free<br/>tax: 8% of subtotal
    FE-->>Browser: SSR HTML — cart items with images, names, pricing
```

### 3.3 Update Item Quantity / Remove Item

```mermaid
flowchart TD
    Form["User submits cart form\n(action=update or action=remove)"] --> Post["POST /cart"]
    Post --> Auth["getSessionUser(req)"]
    Auth -->|Not authenticated| Redirect["303 → /login?redirect=/cart"]
    Auth -->|Authenticated| Action{"action?"}
    Action -->|update| Put["PUT /api/carts/:userId/items/:productId\n{quantity}"]
    Action -->|remove| Delete["DELETE /api/carts/:userId/items/:productId"]
    Put --> GW["API Gateway → Cart Service → Redis SETEX"]
    Delete --> GW
    GW --> Done["303 → /cart (page re-renders with fresh data)"]
```

---

## 4. Checkout Flow

The checkout is the most complex flow, spanning frontend validation, order persistence, Redis event publishing, and cart cleanup.

```mermaid
sequenceDiagram
    actor User
    participant Browser
    participant FE as Frontend (routes/checkout.tsx)
    participant Gateway as API Gateway
    participant OS as Orders Service
    participant CS as Cart Service
    participant PG as PostgreSQL
    participant Redis

    User->>Browser: Navigate to /checkout
    Browser->>FE: GET /checkout
    FE->>FE: getSessionUser(req)
    alt Not authenticated
        FE-->>Browser: 303 → /login?redirect=/checkout
    else Authenticated
        FE->>Gateway: GET /api/carts/:userId/details (enriched cart)
        Gateway-->>FE: Cart with product details
        FE-->>Browser: SSR HTML — checkout form + cart summary
    end

    User->>Browser: Fill in address form and submit
    Browser->>FE: POST /checkout (fullName, email, street, city, state, postalCode)

    Note over FE: Validate all 6 fields (non-empty)<br/>postalCode must be ≥ 5 chars
    alt Validation fails
        FE-->>Browser: Re-render form with error message
    else Validation passes
        FE->>FE: Check cart is not empty
        FE->>FE: Build orderItems[] from cart.items<br/>Compose shippingAddress string
        FE->>Gateway: POST /api/orders\n{userId, items[], shippingAddress}
        Gateway->>OS: POST /api/orders

        OS->>OS: Validate userId + items present
        OS->>OS: Calculate total (sum of price × quantity)
        OS->>PG: INSERT INTO orders — status=pending
        PG-->>OS: OK
        OS->>Redis: PUBLISH orders:created\n{orderId, userId}
        Redis-->>OS: OK (async — subscribers notified)
        OS-->>Gateway: ApiResponse<Order> {id, status:pending, ...}
        Gateway-->>FE: ApiResponse<Order>

        FE->>Gateway: DELETE /api/carts/:userId
        Gateway->>CS: DELETE /api/carts/:userId
        CS->>Redis: DEL cart:{userId}
        Redis-->>CS: OK
        CS-->>Gateway: ApiResponse {success:true}
        Gateway-->>FE: OK

        FE-->>Browser: 303 → /order-confirmation/:orderId
    end
```

---

## 5. Order Confirmation Flow

```mermaid
sequenceDiagram
    participant Browser
    participant FE as Frontend (routes/order-confirmation/[id].tsx)
    participant Gateway as API Gateway
    participant OS as Orders Service
    participant PS as Products Service
    participant PG as PostgreSQL

    Browser->>FE: GET /order-confirmation/:orderId
    FE->>FE: getSessionUser(req) — redirect if unauthenticated

    par Parallel fetch
        FE->>Gateway: GET /api/orders/:orderId
        Gateway->>OS: GET /api/orders/:orderId
        OS->>PG: SELECT * FROM orders WHERE id = $1
        PG-->>OS: Order row (items stored as JSON column)
        OS-->>Gateway: ApiResponse<Order>
        Gateway-->>FE: ApiResponse<Order>
    and
        FE->>Gateway: GET /api/products?limit=100
        Gateway->>PS: GET /api/products?limit=100
        PS->>PG: SELECT * FROM products LIMIT 100
        PG-->>PS: Product rows
        PS-->>Gateway: ApiResponse<Product[]>
        Gateway-->>FE: ApiResponse<Product[]>
    and
        FE->>Gateway: GET /api/carts/:userId (for nav badge)
        Gateway-->>FE: Cart item count
    end

    Note over FE: Build productMap (id → Product)<br/>Resolve productName for each OrderItem
    alt Order found
        FE-->>Browser: SSR HTML — order ID, status, items, shipping address
    else Order not found
        FE-->>Browser: "Could not find that order" with link to /orders
    end
```

---

## 6. Order History Flow

```mermaid
sequenceDiagram
    participant Browser
    participant FE as Frontend (routes/orders.tsx)
    participant Gateway as API Gateway
    participant OS as Orders Service
    participant PS as Products Service
    participant PG as PostgreSQL

    Browser->>FE: GET /orders
    FE->>FE: getSessionUser(req) — redirect if unauthenticated

    par Parallel fetch
        FE->>Gateway: GET /api/orders?userId=:userId
        Gateway->>OS: GET /api/orders?userId=:userId
        OS->>PG: SELECT * FROM orders WHERE user_id = $1\nORDER BY created_at DESC LIMIT 20
        PG-->>OS: Order rows
        OS-->>Gateway: ApiResponse<Order[]>
        Gateway-->>FE: ApiResponse<Order[]>
    and
        FE->>Gateway: GET /api/products?limit=100
        Gateway->>PS: GET /api/products
        PS->>PG: SELECT * FROM products
        PG-->>PS: Rows
        PS-->>Gateway: Products[]
        Gateway-->>FE: Products[]
    and
        FE->>Gateway: GET /api/carts/:userId (for nav badge)
        Gateway-->>FE: Cart count
    end

    Note over FE: Build productMap; hydrate productName<br/>on each OrderItem where missing
    FE-->>Browser: SSR HTML — list of orders,\neach expandable with items and totals
```

---

## 7. Async Add-to-Cart (Island)

The products grid supports an async add-to-cart that avoids a full page navigation using a Fresh Island component.

```mermaid
sequenceDiagram
    actor User
    participant Browser
    participant Island as AsyncAddToCartButton.tsx (Preact Island)
    participant FE as routes/api/carts/[userId]/items.ts
    participant Gateway as API Gateway
    participant CS as Cart Service
    participant Redis

    User->>Browser: Click async "Add to Cart" button
    Browser->>Island: onClick handler fires
    Island->>Island: setState({loading: true})
    Island->>FE: POST /api/carts/:userId/items\n{productId, price, quantity}
    Note over FE: Server-side Fresh API route —<br/>forwards directly to gateway
    FE->>Gateway: POST /api/carts/:userId/items
    Gateway->>CS: POST /api/carts/:userId/items
    CS->>Redis: SETEX cart:{userId} 604800 <updated cart JSON>
    Redis-->>CS: OK
    CS-->>Gateway: ApiResponse<Cart>
    Gateway-->>FE: ApiResponse<Cart>
    FE-->>Island: JSON response
    Island->>Island: setState({loading: false, added: true})
    Note over Browser: Button shows "Added!" feedback — no page reload
```

---

## 8. Health Check Flow

```mermaid
sequenceDiagram
    participant K8s as Kubernetes Probe
    participant SVC as Any Backend Service (BaseService)
    participant DB as PostgreSQL or Redis

    K8s->>SVC: GET /health/live
    SVC-->>K8s: 200 {status: "ok", service: "...", uptime: "...s"}

    K8s->>SVC: GET /health/ready
    SVC->>SVC: checkDependencies()
    SVC->>DB: SELECT 1 (Postgres) or PING (Redis)
    DB-->>SVC: Response + latency
    alt All dependencies healthy
        SVC-->>K8s: 200 {status:"healthy", checks:{database:{status:"healthy", latency:Xms}}}
    else Any dependency unhealthy
        SVC-->>K8s: 503 {status:"unhealthy", checks:{database:{status:"unhealthy", message:"..."}}}
    end
```

---

## 9. End-to-End Happy Path Summary

```mermaid
journey
    title ShopHub — Complete Happy Path
    section Discovery
        Visit homepage: 5: User
        Browse featured products: 5: User
        Click category filter: 4: User
    section Selection
        Search for product: 5: User
        View product card: 5: User
        Add to cart: 5: User
    section Purchase
        Open cart: 5: User
        Review items and totals: 4: User
        Proceed to checkout: 5: User
        Fill in shipping address: 4: User
        Submit order: 5: User
    section Confirmation
        View order confirmation: 5: User
        Check order history: 5: User
```

---

## 10. Error Handling Summary

| Scenario | Behaviour |
|---------|-----------|
| Unauthenticated access to `/cart`, `/checkout`, `/orders` | 303 redirect to `/login?redirect=<path>` |
| Invalid login credentials | Re-render login form with error message |
| Cart is empty at checkout | Re-render checkout form with "cart is empty" error |
| Incomplete/invalid checkout form | Re-render form highlighting the failing field |
| Add-to-cart failure (service error) | Re-render products page with error banner |
| Order not found at `/order-confirmation/:id` | Renders "Could not find that order" with a link to `/orders` |
| Backend service timeout (>5s) | `ServiceClient` returns `{success: false, error: "..."}` — no retry on AbortError |
| Backend service transient error (<3 attempts) | `ServiceClient` retries with exponential backoff (100ms, 200ms, 400ms) |
| Rate limit exceeded at gateway (>1000 req/min) | 429 Too Many Requests from rate limiter middleware |
