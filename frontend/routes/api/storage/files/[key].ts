import { Handlers } from "$fresh/server.ts";

// Public proxy for stored product images.
// The storage service is not exposed on the host network — all browser image
// requests go through this route. No auth required: product images are public,
// matching the S3 public-read model. Writes go through /api/upload (admin only).
export const handler: Handlers = {
  async GET(_req, ctx) {
    const key = ctx.params.key;

    // Validate key format to prevent path traversal before forwarding
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z]{2,5}$/i.test(key)) {
      return new Response("Not found", { status: 404 });
    }

    const storageUrl = Deno.env.get("STORAGE_SERVICE_URL") || "http://localhost:3007";
    const upstream = await fetch(`${storageUrl}/files/${key}`);

    if (!upstream.ok) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  },
};
