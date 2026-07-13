import { NextResponse } from "next/server";
import { canLogin, createMagicToken } from "@/lib/auth";
import { sendMagicLink } from "@/lib/email";

// Request a sign-in link. Only existing admins (+ the bootstrap email) get one; we always
// return ok so the endpoint never reveals who is an admin.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = (body.email || "").trim().toLowerCase(); // lowercase → matches the verified SES identity
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
  if (await canLogin(email)) {
    const raw = await createMagicToken(email, "login");
    const base = process.env.APP_URL || new URL(req.url).origin;
    const url = `${base}/admin/accept?token=${raw}`;
    const r = await sendMagicLink(email, url, "login");
    // SECURITY: never expose the link in the response in production — it must only arrive by email
    // (or the server log for ops). The dev stub link is for local development only.
    const expose = process.env.NODE_ENV !== "production" && r.sent === "stub";
    return NextResponse.json({ ok: true, ...(expose ? { devLink: url } : {}) });
  }
  return NextResponse.json({ ok: true });
}
