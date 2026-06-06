import { MiddlewareHandlerContext } from "$fresh/server.ts";
import { getSessionUser, loginRedirect } from "../../utils/auth.ts";

export async function handler(req: Request, ctx: MiddlewareHandlerContext) {
  const user = await getSessionUser(req);
  if (!user) return loginRedirect(req, new URL(req.url).pathname);
  if (user.role !== "admin") return new Response("Forbidden", { status: 403 });
  return ctx.next();
}
