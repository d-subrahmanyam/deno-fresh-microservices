/** @jsxImportSource preact */
import { Handlers, PageProps } from "$fresh/server.ts";
import { TagIcon } from "../components/icons.tsx";
import { SiteLayout } from "../components/layout.tsx";
import { getSessionUser, type SessionUser } from "../utils/auth.ts";
import { fetchAllProducts, formatCurrency, type Product } from "../utils/shop.ts";

interface HomeData {
  user: SessionUser | null;
  featuredProducts: Product[];
}

export const handler: Handlers<HomeData> = {
  async GET(req, ctx) {
    const [user, products] = await Promise.all([
      getSessionUser(req),
      fetchAllProducts(),
    ]);

    return ctx.render({
      user,
      featuredProducts: products.slice(0, 4),
    });
  },
};

export default function HomePage(props: PageProps<HomeData>) {
  return (
    <SiteLayout title="Welcome" currentPath="/" user={props.data.user}>
      <section class="grid gap-10 rounded-[2rem] bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-8 shadow-sm lg:grid-cols-[1.1fr_0.9fr] lg:p-12">
        <div>
          <p class="text-sm uppercase tracking-[0.25em] text-blue-600">Deno + Fresh Commerce</p>
          <h2 class="mt-4 text-5xl font-bold leading-tight text-gray-900">
            Shop real products through real microservices.
          </h2>
          <p class="mt-6 max-w-2xl text-lg text-gray-600">
            The storefront now pulls products, carts, and orders from the gateway instead of rendering sample placeholders. Search, pagination, checkout, and order history are all wired into the current services.
          </p>
          <div class="mt-8 flex flex-wrap gap-4">
            <a href="/products" class="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700">
              Browse Products
            </a>
            <a href="/orders" class="rounded-xl border border-blue-200 bg-white px-6 py-3 font-semibold text-blue-700 hover:border-blue-300">
              View Orders
            </a>
          </div>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          {props.data.featuredProducts.map((product) => (
            <div class="overflow-hidden rounded-2xl bg-white shadow-md">
              <img src={product.image} alt={product.name} class="h-40 w-full object-cover" />
              <div class="space-y-2 p-4">
                <p class="text-sm uppercase tracking-[0.2em] text-blue-600">{product.category}</p>
                <h3 class="text-lg font-semibold text-gray-900">{product.name}</h3>
                <p class="text-sm text-gray-500">{product.description}</p>
                <p class="text-lg font-bold text-gray-900">{formatCurrency(product.price)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section class="mt-12 grid gap-6 md:grid-cols-4">
        {[
          { name: "Electronics", color: "bg-blue-100" },
          { name: "Home", color: "bg-amber-100" },
          { name: "Clothing", color: "bg-pink-100" },
          { name: "Fitness", color: "bg-emerald-100" },
        ].map((category) => (
          <a
            key={category.name}
            href={`/products?category=${category.name.toLowerCase()}`}
            class={`${category.color} rounded-2xl p-6 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`}
          >
            <TagIcon class="mx-auto h-10 w-10 text-blue-700" />
            <p class="mt-4 text-lg font-semibold text-gray-900">{category.name}</p>
          </a>
        ))}
      </section>
    </SiteLayout>
  );
}
