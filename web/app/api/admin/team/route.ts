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

// Mint (or re-mint) an invite link. Because tokens are stored hashed, a link can only be shown
// once; regenerating for an email that already has a pending invite replaces the stale token
// rather than stacking a duplicate row — so this doubles as "copy link again" / "resend".
export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const raw = await req.json().catch(() => ({}));
  const email = String(raw.email || "").trim().toLowerCase();
  if (!email || !/.+@.+\..+/.test(email)) return NextResponse.json({ error: "valid email required" }, { status: 400 });
  // Guard: don't re-invite someone who's already an active admin.
  const existing = await prisma.adminUser.findUnique({ where: { email }, select: { active: true } });
  if (existing?.active) return NextResponse.json({ error: "already an admin" }, { status: 409 });
  // Drop any unused (unredeemable) pending invites for this email before minting a fresh one.
  await prisma.adminInvite.deleteMany({ where: { email, kind: "invite", usedAt: null } });
  const token = await createMagicToken(email, "invite", admin.id);
  const base = process.env.APP_URL || new URL(req.url).origin;
  const url = `${base}/admin/accept?token=${token}`;
  // Sandbox-only SES → don't try to send. Return the link for the admin to deliver themselves.
  return NextResponse.json({ ok: true, link: url, email });
}

// Revoke a pending invite (delete its unused token(s) for that email).
export async function DELETE(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const raw = await req.json().catch(() => ({}));
  const email = String(raw.email || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
  const { count } = await prisma.adminInvite.deleteMany({ where: { email, kind: "invite", usedAt: null } });
  return NextResponse.json({ ok: true, revoked: count });
}
