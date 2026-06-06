import { Handlers } from "$fresh/server.ts";

// Proxy browser-side trackEvent() calls to the API gateway.
// Server-side trackEvent() uses API_URL directly; browser calls hit this route.
export const handler: Handlers = {
  async POST(req) {
    const apiUrl = Deno.env.get("API_URL") || "http://localhost:3000";
    const body = await req.text();
    const resp = await fetch(`${apiUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const data = await resp.text();
    return new Response(data, {
      status: resp.status,
      headers: { "Content-Type": "application/json" },
    });
  },
};
