import {
  deleteCookie,
  getCookies,
  setCookie,
} from "$std/http/cookie.ts";
import {
  create,
  getNumericDate,
  verify,
} from "djwt";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface DemoUser extends SessionUser {
  password: string;
}

const AUTH_COOKIE_NAME = "shophub_auth";
const JWT_SECRET = Deno.env.get("JWT_SECRET") || "shophub-dev-secret";

const DEMO_USERS: DemoUser[] = [
  {
    id: "550e8400-e29b-41d4-a716-446655440000",
    email: "john@example.com",
    name: "John Doe",
    role: "customer",
    password: "password123",
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440001",
    email: "jane@example.com",
    name: "Jane Smith",
    role: "customer",
    password: "password123",
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440002",
    email: "bob@example.com",
    name: "Bob Johnson",
    role: "customer",
    password: "password123",
  },
];

const keyPromise = crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(JWT_SECRET),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"],
);

export function authenticateUser(email: string, password: string) {
  const user = DEMO_USERS.find((entry) => entry.email === email.trim().toLowerCase());
  if (!user || user.password !== password) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  } satisfies SessionUser;
}

export async function createAuthToken(user: SessionUser) {
  const key = await keyPromise;
  return await create(
    { alg: "HS256", typ: "JWT" },
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      exp: getNumericDate(60 * 60 * 24 * 7),
    },
    key,
  );
}

export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const token = getCookies(req.headers)[AUTH_COOKIE_NAME];
  if (!token) {
    return null;
  }

  try {
    const key = await keyPromise;
    const payload = await verify(token, key);

    return {
      id: String(payload.sub || ""),
      email: String(payload.email || ""),
      name: String(payload.name || ""),
      role: String(payload.role || "customer"),
    };
  } catch {
    return null;
  }
}

export function setAuthCookie(headers: Headers, token: string) {
  setCookie(headers, {
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearAuthCookie(headers: Headers) {
  deleteCookie(headers, AUTH_COOKIE_NAME, { path: "/" });
}
