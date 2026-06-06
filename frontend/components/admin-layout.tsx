/** @jsxImportSource preact */
import { ComponentChildren } from "preact";
import { SessionUser } from "../utils/auth.ts";

interface AdminLayoutProps {
  title: string;
  currentPath: string;
  user: SessionUser;
  children: ComponentChildren;
}

function sidebarLink(label: string, href: string, active: boolean) {
  return (
    <a
      href={href}
      class={active
        ? "flex items-center gap-3 rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700"
        : "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"}
    >
      {label}
    </a>
  );
}

export function AdminLayout({ title, currentPath, user, children }: AdminLayoutProps) {
  return (
    <div class="min-h-screen bg-gray-50">
      <div class="flex min-h-screen">
        {/* Sidebar */}
        <aside class="flex w-56 flex-col border-r border-gray-200 bg-white px-4 py-6">
          <a href="/admin" class="mb-8 text-xl font-bold text-blue-600">
            ShopHub Admin
          </a>

          <nav class="flex flex-col gap-1">
            {sidebarLink("Dashboard", "/admin", currentPath === "/admin")}
            {sidebarLink("Products", "/admin/products", currentPath.startsWith("/admin/products"))}
            {sidebarLink("Orders", "/admin/orders", currentPath.startsWith("/admin/orders"))}
            {sidebarLink("Analytics", "/admin/analytics", currentPath.startsWith("/admin/analytics"))}
          </nav>

          <div class="mt-auto flex flex-col gap-1 border-t border-gray-100 pt-4">
            <a
              href="/products"
              class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
              ← Back to Shop
            </a>
            <a
              href="/logout"
              class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
              Sign Out
            </a>
          </div>

          <p class="mt-4 truncate text-xs text-gray-400">{user.name}</p>
        </aside>

        {/* Main content */}
        <div class="flex flex-1 flex-col">
          <header class="border-b border-gray-200 bg-white px-8 py-4">
            <h1 class="text-2xl font-bold text-gray-900">{title}</h1>
          </header>
          <main class="flex-1 px-8 py-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
