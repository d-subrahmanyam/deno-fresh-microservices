import { Handlers } from "$fresh/server.ts";
import { clearAuthCookie } from "../utils/auth.ts";

export const handler: Handlers = {
  GET() {
    const headers = new Headers();
    clearAuthCookie(headers);
    headers.set("location", "/");
    return new Response(null, { status: 303, headers });
  },
};
