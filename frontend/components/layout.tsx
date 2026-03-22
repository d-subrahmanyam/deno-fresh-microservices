/** @jsxImportSource preact */
import { ComponentChildren } from "preact";
import {
  HomeIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
} from "./icons.tsx";
import { SessionUser } from "../utils/auth.ts";

interface SiteLayoutProps {
  title: string;
  currentPath: string;
  user: SessionUser | null;
  children: ComponentChildren;
}

function navLinkClass(active: boolean) {
  return active
    ? "text-blue-600 font-semibold flex items-center gap-2"
    : "text-gray-700 hover:text-blue-600 flex items-center gap-2";
}

export function SiteLayout(props: SiteLayoutProps) {
  return (
    <div class="min-h-screen bg-gray-50">
      <header class="bg-white shadow-sm border-b border-gray-100">
        <nav class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <a href="/" class="text-2xl font-bold text-blue-600">
              ShopHub
            </a>
            <div class="flex flex-wrap items-center gap-5 text-sm md:text-base">
              <a href="/" class={navLinkClass(props.currentPath === "/")}>
                <HomeIcon class="w-5 h-5" />
                Home
              </a>
              <a
                href="/products"
                class={navLinkClass(props.currentPath.startsWith("/products"))}
              >
                <ShoppingBagIcon class="w-5 h-5" />
                Products
              </a>
              <a
                href="/cart"
                class={navLinkClass(props.currentPath.startsWith("/cart") || props.currentPath.startsWith("/checkout"))}
              >
                <ShoppingCartIcon class="w-5 h-5" />
                Cart
              </a>
              {props.user
                ? (
                  <>
                    <a
                      href="/orders"
                      class={props.currentPath.startsWith("/orders") || props.currentPath.startsWith("/order-confirmation")
                        ? "text-blue-600 font-semibold"
                        : "text-gray-700 hover:text-blue-600"}
                    >
                      Orders
                    </a>
                    <span class="text-gray-500">
                      Signed in as {props.user.name}
                    </span>
                    <a href="/logout" class="text-gray-700 hover:text-blue-600">
                      Sign Out
                    </a>
                  </>
                )
                : (
                  <a
                    href="/login"
                    class={props.currentPath.startsWith("/login")
                      ? "text-blue-600 font-semibold"
                      : "text-gray-700 hover:text-blue-600"}
                  >
                    Sign In
                  </a>
                )}
            </div>
          </div>
        </nav>
      </header>

      <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div class="mb-8 flex items-end justify-between gap-4">
          <div>
            <p class="text-sm uppercase tracking-[0.2em] text-blue-600">Microservices Store</p>
            <h1 class="mt-2 text-3xl font-bold text-gray-900">{props.title}</h1>
          </div>
        </div>
        {props.children}
      </main>

      <footer class="bg-gray-900 text-white py-8 mt-16">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p class="text-center text-gray-400">
            © 2026 ShopHub. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
