import { NextResponse } from "next/server";
import { redeemToken, createSession } from "@/lib/auth";

// Clicking a magic link lands here: validate the token, create the session cookie, and go to /admin.
export const runtime = "nodejs";

export async function GET(req: Request) {
  // Behind the reverse proxy, req.url's host is the internal localhost:3000 — build redirects from
  // the public APP_URL so we never bounce the browser to localhost. (Fallback to the request origin.)
  const base = process.env.APP_URL || new URL(req.url).origin;
  const token = new URL(req.url).searchParams.get("token") || "";
  const user = token ? await redeemToken(token) : null;
  if (!user) return NextResponse.redirect(new URL("/admin/signin?error=invalid", base));
  await createSession(user.id);
  return NextResponse.redirect(new URL("/admin", base));
}
