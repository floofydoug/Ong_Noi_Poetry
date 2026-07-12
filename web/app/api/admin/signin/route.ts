import { NextResponse } from "next/server";
import { canLogin, createMagicToken } from "@/lib/auth";
import { sendMagicLink } from "@/lib/email";

// Request a sign-in link. Only existing admins (+ the bootstrap email) get one; we always
// return ok so the endpoint never reveals who is an admin.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({}));
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
  if (await canLogin(email)) {
    const raw = await createMagicToken(email, "login");
    const base = process.env.APP_URL || new URL(req.url).origin;
    const url = `${base}/admin/accept?token=${raw}`;
    const r = await sendMagicLink(email, url, "login");
    return NextResponse.json({ ok: true, ...(r.sent === "stub" ? { devLink: url } : {}) });
  }
  return NextResponse.json({ ok: true });
}
