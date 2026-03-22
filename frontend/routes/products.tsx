/** @jsxImportSource preact */
import { Handlers, PageProps } from "$fresh/server.ts";
import { SiteLayout } from "../components/layout.tsx";
import { getSessionUser, type SessionUser } from "../utils/auth.ts";
import {
  fetchAllProducts,
  formatCurrency,
  shopApi,
  type Product,
} from "../utils/shop.ts";

interface ProductsData {
  user: SessionUser | null;
  products: Product[];
  categories: string[];
  category: string;
  query: string;
  page: number;
  totalPages: number;
  totalCount: number;
  added: boolean;
  error?: string;
}

const PRODUCTS_PER_PAGE = 8;

async function buildData(req: Request, user: SessionUser | null, error?: string): Promise<ProductsData> {
  const url = new URL(req.url);
  const searchQuery = url.searchParams.get("q")?.trim() || "";
  const category = url.searchParams.get("category")?.trim().toLowerCase() || "";
  const added = url.searchParams.get("added") === "1";
  const allProducts = await fetchAllProducts();
  const categories = Array.from(new Set(allProducts.map((product) => product.category))).sort();

  const filteredProducts = allProducts.filter((product) => {
    const matchesCategory = !category || product.category.toLowerCase() === category;
    const haystack = `${product.name} ${product.description} ${product.category}`.toLowerCase();
    const matchesQuery = !searchQuery || haystack.includes(searchQuery.toLowerCase());
    return matchesCategory && matchesQuery;
  });

  const requestedPage = Number(url.searchParams.get("page") || "1");
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const products = filteredProducts.slice(
    (page - 1) * PRODUCTS_PER_PAGE,
    page * PRODUCTS_PER_PAGE,
  );

  return {
    user,
    products,
    categories,
    category,
    query: searchQuery,
    page,
    totalPages,
    totalCount: filteredProducts.length,
    added,
    error,
  };
}

export const handler: Handlers<ProductsData> = {
  async GET(req, ctx) {
    const user = await getSessionUser(req);
    return ctx.render(await buildData(req, user));
  },
  async POST(req, ctx) {
    const user = await getSessionUser(req);
    const url = new URL(req.url);
    const form = await req.formData();
    const redirectTo = String(form.get("redirectTo") || "/products");

    if (!user) {
      return Response.redirect(new URL(`/login?redirect=${encodeURIComponent(redirectTo)}`, req.url), 303);
    }

    const productId = String(form.get("productId") || "");
    const price = Number(form.get("price") || "0");
    const quantity = Math.max(1, Number(form.get("quantity") || "1"));
    const result = await shopApi(`/api/carts/${user.id}/items`, {
      method: "POST",
      body: JSON.stringify({ productId, price, quantity }),
    });

    if (!result.success) {
      return ctx.render(await buildData(req, user, result.error || "Unable to add the item to your cart."));
    }

    const destination = new URL(redirectTo, url);
    destination.searchParams.set("added", "1");
    return Response.redirect(destination, 303);
  },
};

export default function ProductsPage(props: PageProps<ProductsData>) {
  const params = new URLSearchParams();
  if (props.data.query) params.set("q", props.data.query);
  if (props.data.category) params.set("category", props.data.category);

  return (
    <SiteLayout title="Products" currentPath="/products" user={props.data.user}>
      <div class="space-y-8">
        <form method="GET" class="grid gap-4 rounded-2xl bg-white p-5 shadow-sm md:grid-cols-[1.5fr_1fr_auto]">
          <input
            type="search"
            name="q"
            value={props.data.query}
            placeholder="Search by product name, description, or category"
            class="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-blue-500"
          />
          <select
            name="category"
            value={props.data.category}
            class="rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-blue-500"
          >
            <option value="">All categories</option>
            {props.data.categories.map((category) => (
              <option key={category} value={category.toLowerCase()}>{category}</option>
            ))}
          </select>
          <button type="submit" class="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700">
            Search
          </button>
        </form>

        {(props.data.added || props.data.error) && (
          <div class={props.data.error
            ? "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            : "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"}>
            {props.data.error || "Item added to cart."}
          </div>
        )}

        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p class="text-sm text-gray-600">
            Showing {props.data.products.length} of {props.data.totalCount} matching products
          </p>
          <p class="text-sm text-gray-500">
            Page {props.data.page} of {props.data.totalPages}
          </p>
        </div>

        {props.data.products.length === 0 ? (
          <div class="rounded-2xl bg-white p-10 text-center shadow-md">
            <p class="text-lg text-gray-600">No products matched your filters.</p>
          </div>
        ) : (
          <div class="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {props.data.products.map((product) => (
              <div key={product.id} class="overflow-hidden rounded-2xl bg-white shadow-md transition hover:-translate-y-1 hover:shadow-lg">
                <img src={product.image} alt={product.name} class="h-44 w-full object-cover" />
                <div class="space-y-4 p-5">
                  <div>
                    <p class="text-xs uppercase tracking-[0.2em] text-blue-600">{product.category}</p>
                    <h2 class="mt-2 text-xl font-semibold text-gray-900">{product.name}</h2>
                    <p class="mt-2 line-clamp-3 text-sm text-gray-600">{product.description}</p>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-2xl font-bold text-gray-900">{formatCurrency(product.price)}</span>
                    <span class="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                      {product.stock} in stock
                    </span>
                  </div>
                  <form method="POST" class="space-y-3">
                    <input type="hidden" name="productId" value={product.id} />
                    <input type="hidden" name="price" value={product.price.toString()} />
                    <input type="hidden" name="quantity" value="1" />
                    <input type="hidden" name="redirectTo" value={`/products?${params.toString()}`} />
                    <button type="submit" class="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700">
                      Add to Cart
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}

        <div class="flex flex-wrap gap-3">
          {Array.from({ length: props.data.totalPages }, (_, index) => index + 1).map((page) => {
            const pageParams = new URLSearchParams(params);
            pageParams.set("page", page.toString());
            return (
              <a
                key={page}
                href={`/products?${pageParams.toString()}`}
                class={page === props.data.page
                  ? "rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white"
                  : "rounded-lg bg-white px-4 py-2 font-semibold text-gray-700 shadow-sm hover:text-blue-600"}
              >
                {page}
              </a>
            );
          })}
        </div>
      </div>
    </SiteLayout>
  );
}
