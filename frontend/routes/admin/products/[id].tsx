/** @jsxImportSource preact */
import { Handlers, PageProps } from "$fresh/server.ts";
import { AdminLayout } from "../../../components/admin-layout.tsx";
import { AlertBanner } from "../../../components/alert-banner.tsx";
import { FormField } from "../../../components/form-field.tsx";
import ImageUpload from "../../../islands/ImageUpload.tsx";
import { getSessionUser, type SessionUser } from "../../../utils/auth.ts";
import { normalizeProduct, shopApi, type Product } from "../../../utils/shop.ts";

interface ProductFormValues {
  name: string;
  description: string;
  price: string;
  category: string;
  stock: string;
  image: string;
}

interface EditProductData {
  user: SessionUser;
  product: Product;
  values: ProductFormValues;
  errors: Partial<Record<keyof ProductFormValues, string>>;
  formError?: string;
}

function validate(v: ProductFormValues) {
  const errors: Partial<Record<keyof ProductFormValues, string>> = {};
  if (!v.name.trim()) errors.name = "Name is required.";
  if (!v.category.trim()) errors.category = "Category is required.";
  if (!v.price.trim() || isNaN(Number(v.price)) || Number(v.price) < 0) {
    errors.price = "Enter a valid price.";
  }
  return errors;
}

function productToValues(p: Product): ProductFormValues {
  return {
    name: p.name,
    description: p.description,
    price: String(p.price),
    category: p.category,
    stock: String(p.stock),
    image: p.image ?? "",
  };
}

export const handler: Handlers<EditProductData> = {
  async GET(req, ctx) {
    const user = await getSessionUser(req);
    const result = await shopApi<Record<string, unknown>>(`/api/products/${ctx.params.id}`);
    if (!result.success || !result.data) {
      return Response.redirect(new URL("/admin/products", req.url), 303);
    }
    const product = normalizeProduct(result.data);
    return ctx.render({ user: user!, product, values: productToValues(product), errors: {} });
  },
  async POST(req, ctx) {
    const user = await getSessionUser(req);
    const productId = ctx.params.id;
    const form = await req.formData();
    const values: ProductFormValues = {
      name: String(form.get("name") || ""),
      description: String(form.get("description") || ""),
      price: String(form.get("price") || ""),
      category: String(form.get("category") || ""),
      stock: String(form.get("stock") || "0"),
      image: String(form.get("image") || ""),
    };

    const errors = validate(values);

    // Re-fetch product for re-render if validation fails
    const productResult = await shopApi<Record<string, unknown>>(`/api/products/${productId}`);
    const product = productResult.success && productResult.data
      ? normalizeProduct(productResult.data)
      : null;

    if (!product) return Response.redirect(new URL("/admin/products", req.url), 303);

    if (Object.keys(errors).length > 0) {
      return ctx.render({ user: user!, product, values, errors });
    }

    const result = await shopApi(`/api/products/${productId}`, {
      method: "PUT",
      body: JSON.stringify({
        name: values.name.trim(),
        description: values.description.trim() || undefined,
        price: Number(values.price),
        category: values.category.trim(),
        stock: Number(values.stock) || 0,
        image: values.image.trim() || undefined,
      }),
    });

    if (!result.success) {
      return ctx.render({
        user: user!,
        product,
        values,
        errors: {},
        formError: result.error || "Failed to update product.",
      });
    }

    return Response.redirect(new URL("/admin/products?success=updated", req.url), 303);
  },
};

export default function EditProductPage(props: PageProps<EditProductData>) {
  const { user, product, values, errors, formError } = props.data;

  return (
    <AdminLayout
      title={`Edit: ${product.name}`}
      currentPath="/admin/products"
      user={user}
    >
      <div class="max-w-2xl">
        <a
          href="/admin/products"
          class="mb-6 inline-block text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          ← Back to Products
        </a>

        {formError && (
          <div class="mb-6">
            <AlertBanner variant="error" message={formError} />
          </div>
        )}

        <form method="POST" class="rounded-2xl bg-white p-8 shadow-sm space-y-5">
          <div class="grid gap-5 md:grid-cols-2">
            <FormField label="Name" name="name" value={values.name} error={errors.name} colSpan required />
            <FormField label="Category" name="category" value={values.category} error={errors.category} required />
            <FormField label="Price ($)" name="price" type="number" value={values.price} error={errors.price} required />
            <FormField label="Stock" name="stock" type="number" value={values.stock} error={errors.stock} />
            <ImageUpload name="image" currentUrl={values.image} colSpan />
            <FormField
              label="Description"
              name="description"
              value={values.description}
              error={errors.description}
              multiline
              colSpan
            />
          </div>

          <div class="flex gap-3 pt-2">
            <button
              type="submit"
              class="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Save Changes
            </button>
            <a
              href="/admin/products"
              class="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </a>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}
