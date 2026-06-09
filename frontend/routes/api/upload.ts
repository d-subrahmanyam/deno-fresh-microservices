import { Handlers } from "$fresh/server.ts";
import { getSessionUser } from "../../utils/auth.ts";

// Admin-only proxy: validates the session, then streams the raw multipart body
// to the storage service. Using a server-side proxy keeps everything same-origin
// (no CORS) and means the island never needs to know the storage service's URL.
// The storage service is not exposed on the host network — it is reachable only
// via this proxy (for writes) and /api/storage/files/:key (for reads).
// X-Storage-Key provides service-to-service auth so that nothing else on the
// Docker internal network can write files by calling the storage service directly.
export const handler: Handlers = {
  async POST(req) {
    const user = await getSessionUser(req);
    if (!user || user.role !== "admin") {
      return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const storageUrl = Deno.env.get("STORAGE_SERVICE_URL") || "http://localhost:3007";
    const storageKey = Deno.env.get("STORAGE_API_KEY") || "";
    const contentType = req.headers.get("content-type") ?? "";

    const upstream = await fetch(`${storageUrl}/upload`, {
      method: "POST",
      body: req.body,
      headers: { "content-type": contentType, "x-storage-key": storageKey },
      // @ts-ignore — duplex is required by some runtimes for streaming request bodies
      duplex: "half",
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  },
};
