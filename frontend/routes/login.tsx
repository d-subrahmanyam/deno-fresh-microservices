/** @jsxImportSource preact */
import { Handlers, PageProps } from "$fresh/server.ts";
import { SiteLayout } from "../components/layout.tsx";
import {
  authenticateUser,
  createAuthToken,
  getSessionUser,
  setAuthCookie,
  type SessionUser,
} from "../utils/auth.ts";

interface LoginData {
  user: SessionUser | null;
  error?: string;
  redirectTo: string;
  email?: string;
}

export const handler: Handlers<LoginData> = {
  async GET(req, ctx) {
    const user = await getSessionUser(req);
    const url = new URL(req.url);
    if (user) {
      return Response.redirect(new URL("/products", req.url), 302);
    }

    return ctx.render({
      user: null,
      redirectTo: url.searchParams.get("redirect") || "/products",
      email: url.searchParams.get("email") || "",
    });
  },
  async POST(req, ctx) {
    const form = await req.formData();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");
    const redirectTo = String(form.get("redirectTo") || "/products");
    const user = await authenticateUser(email, password);

    if (!user) {
      return ctx.render({
        user: null,
        error: "Invalid email or password. Use one of the seeded users with password123.",
        redirectTo,
        email,
      });
    }

    const token = await createAuthToken(user);
    const headers = new Headers();
    setAuthCookie(headers, token);
    headers.set("location", redirectTo);
    return new Response(null, { status: 303, headers });
  },
};

export default function LoginPage(props: PageProps<LoginData>) {
  return (
    <SiteLayout
      title="Sign In"
      currentPath="/login"
      user={props.data.user}
    >
      <div class="mx-auto max-w-lg rounded-2xl bg-white p-8 shadow-lg">
        <p class="mb-6 text-sm text-gray-600">
          Sign in with one of the seeded demo users such as john@example.com and the password password123.
        </p>
        {props.data.error && (
          <div class="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {props.data.error}
          </div>
        )}
        <form method="POST" class="space-y-5">
          <input type="hidden" name="redirectTo" value={props.data.redirectTo} />
          <label class="block">
            <span class="mb-2 block text-sm font-medium text-gray-700">Email address</span>
            <input
              type="email"
              name="email"
              value={props.data.email || ""}
              class="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none transition focus:border-blue-500"
              required
            />
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-medium text-gray-700">Password</span>
            <input
              type="password"
              name="password"
              class="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none transition focus:border-blue-500"
              required
            />
          </label>
          <button
            type="submit"
            class="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700"
          >
            Sign In
          </button>
        </form>
      </div>
    </SiteLayout>
  );
}
