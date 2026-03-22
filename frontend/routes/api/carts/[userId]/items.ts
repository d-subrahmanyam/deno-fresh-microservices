import { Handlers } from "$fresh/server.ts";

function gatewayBaseUrl() {
  return Deno.env.get("API_URL") || "http://localhost:3000";
}

export const handler: Handlers = {
  async POST(req, ctx) {
    const userId = ctx.params.userId;
    const upstreamUrl = `${gatewayBaseUrl()}/api/carts/${userId}/items`;

    const response = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: await req.text(),
    });

    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json",
      },
    });
  },
};
