import { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  GET: () => Response.redirect("/admin/analytics", 301),
};
