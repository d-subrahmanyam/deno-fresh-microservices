/** @jsxImportSource preact */
import { Handlers, PageProps } from "$fresh/server.ts";
import { TagIcon } from "../components/icons.tsx";
import { SiteLayout } from "../components/layout.tsx";
import { ProductCard } from "../components/product-card.tsx";
import { getSessionUser, type SessionUser } from "../utils/auth.ts";
import { fetchAllProducts, fetchCartItemCount, type Product } from "../utils/shop.ts";

interface HomeData {
  user: SessionUser | null;
  featuredProducts: Product[];
  cartCount: number;
}

export const handler: Handlers<HomeData> = {
  async GET(req, ctx) {
    const user = await getSessionUser(req);
    const [products, cartCount] = await Promise.all([
      fetchAllProducts(),
      user ? fetchCartItemCount(user.id) : Promise.resolve(0),
    ]);

    return ctx.render({
      user,
      featuredProducts: products.slice(0, 4),
      cartCount,
    });
  },
};

export default function HomePage(props: PageProps<HomeData>) {
  return (
    <SiteLayout title="Welcome" currentPath="/" user={props.data.user} cartCount={props.data.cartCount}>
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
            <ProductCard key={product.id} product={product} compact />
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
