/** @jsxImportSource preact */
import { Handlers, PageProps } from "$fresh/server.ts";
import { AdminLayout } from "../../../components/admin-layout.tsx";
import { AlertBanner } from "../../../components/alert-banner.tsx";
import { EmptyState } from "../../../components/empty-state.tsx";
import { getSessionUser, type SessionUser } from "../../../utils/auth.ts";
import { formatCurrency, normalizeProduct, shopApi, type Product } from "../../../utils/shop.ts";

interface AdminProductsData {
  user: SessionUser;
  products: Product[];
  success?: string;
  error?: string;
}

export const handler: Handlers<AdminProductsData> = {
  async GET(req, ctx) {
    const user = await getSessionUser(req);
    const url = new URL(req.url);
    const result = await shopApi<Record<string, unknown>[]>("/api/products?limit=100");
    const products = result.success && result.data ? result.data.map(normalizeProduct) : [];
    return ctx.render({
      user: user!,
      products,
      success: url.searchParams.get("success") ?? undefined,
      error: result.success ? undefined : "Failed to load products.",
    });
  },
  async POST(req) {
    const form = await req.formData();
    const action = String(form.get("action") || "");
    const productId = String(form.get("productId") || "");

    if (action === "delete" && productId) {
      await shopApi(`/api/products/${productId}`, { method: "DELETE" });
    }

    return Response.redirect(new URL("/admin/products?success=deleted", req.url), 303);
  },
};

export default function AdminProductsPage(props: PageProps<AdminProductsData>) {
  const { user, products, success, error } = props.data;

  return (
    <AdminLayout title="Products" currentPath="/admin/products" user={user}>
      <div class="mb-4 flex items-center justify-between">
        <p class="text-sm text-gray-500">{products.length} products</p>
        <a
          href="/admin/products/new"
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + Add Product
        </a>
      </div>

      {success && (
        <div class="mb-4">
          <AlertBanner
            variant="success"
            message={success === "deleted" ? "Product deleted." : "Product saved."}
          />
        </div>
      )}
      {error && (
        <div class="mb-4">
          <AlertBanner variant="error" message={error} />
        </div>
      )}

      {products.length === 0
        ? (
          <EmptyState
            message="No products yet."
            href="/admin/products/new"
            linkText="Add your first product"
          />
        )
        : (
          <div class="rounded-2xl bg-white shadow-sm overflow-hidden">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-100 text-left text-xs uppercase tracking-widest text-gray-400">
                  <th class="px-6 py-4 font-medium">Name</th>
                  <th class="px-6 py-4 font-medium">Category</th>
                  <th class="px-6 py-4 font-medium text-right">Price</th>
                  <th class="px-6 py-4 font-medium text-right">Stock</th>
                  <th class="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} class="border-b border-gray-50 last:border-0">
                    <td class="px-6 py-4 font-medium text-gray-900">{product.name}</td>
                    <td class="px-6 py-4 text-gray-500">{product.category}</td>
                    <td class="px-6 py-4 text-right text-gray-900">
                      {formatCurrency(product.price)}
                    </td>
                    <td class="px-6 py-4 text-right">
                      <span
                        class={product.stock < 5
                          ? "font-semibold text-red-600"
                          : "text-gray-700"}
                      >
                        {product.stock}
                      </span>
                    </td>
                    <td class="px-6 py-4 text-right">
                      <div class="flex items-center justify-end gap-3">
                        <a
                          href={`/admin/products/${product.id}`}
                          class="text-sm font-medium text-blue-600 hover:text-blue-700"
                        >
                          Edit
                        </a>
                        <form method="POST" class="inline">
                          <input type="hidden" name="action" value="delete" />
                          <input type="hidden" name="productId" value={product.id} />
                          <button
                            type="submit"
                            class="text-sm font-medium text-red-500 hover:text-red-600"
                            onClick="return confirm('Delete this product?')"
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </AdminLayout>
  );
}
