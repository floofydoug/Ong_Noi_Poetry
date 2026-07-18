import { NextResponse } from "next/server";
import { getCurrentAdmin, createMagicToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Admin-only. GET lists admins + pending invites. POST mints a 7-day invite link and
// returns it for the admin to send manually (we don't have SES production access).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [admins, invites] = await Promise.all([
    prisma.adminUser.findMany({ orderBy: { createdAt: "asc" },
      select: { email: true, name: true, active: true, lastLogin: true, createdAt: true } }),
    prisma.adminInvite.findMany({
      where: { kind: "invite", usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" }, select: { email: true, expiresAt: true, createdAt: true } }),
  ]);
  return NextResponse.json({ admins, invites });
}

export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { email } = await req.json().catch(() => ({}));
  if (!email || !/.+@.+\..+/.test(email)) return NextResponse.json({ error: "valid email required" }, { status: 400 });
  const raw = await createMagicToken(email, "invite", admin.id);
  const base = process.env.APP_URL || new URL(req.url).origin;
  const url = `${base}/admin/accept?token=${raw}`;
  // Sandbox-only SES → don't try to send. Return the link for the admin to deliver themselves.
  return NextResponse.json({ ok: true, link: url, email });
}
