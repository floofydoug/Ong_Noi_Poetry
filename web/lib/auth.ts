import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { prisma } from "./prisma";

// Passwordless auth: magic-link tokens (invite=grant admin, login=existing admin), stored HASHED.
// A session is an httpOnly cookie whose raw value hashes to a row in admin_sessions.
const COOKIE = "ongnoi_admin";
const SESSION_DAYS = 30;
const LINK_DAYS = 7;

export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function getCurrentAdmin() {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const s = await prisma.adminSession.findUnique({
    where: { tokenHash: hashToken(raw) }, include: { user: true },
  });
  if (!s || s.expiresAt < new Date() || !s.user.active) return null;
  return s.user;
}

export async function createSession(userId: string) {
  const raw = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await prisma.adminSession.create({ data: { userId, tokenHash: hashToken(raw), expiresAt } });
  (await cookies()).set(COOKIE, raw, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/", expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (raw) await prisma.adminSession.deleteMany({ where: { tokenHash: hashToken(raw) } });
  jar.delete(COOKIE);
}

/** Mint a magic-link token; returns the RAW token to embed in the emailed URL. */
export async function createMagicToken(email: string, kind: "invite" | "login", invitedById?: string) {
  const raw = newToken();
  await prisma.adminInvite.create({
    data: {
      email: email.toLowerCase(), tokenHash: hashToken(raw), kind,
      expiresAt: new Date(Date.now() + LINK_DAYS * 864e5), invitedById: invitedById ?? null,
    },
  });
  return raw;
}

/** Redeem a magic-link token: validates, marks used, and creates/returns the AdminUser. */
export async function redeemToken(raw: string) {
  const inv = await prisma.adminInvite.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!inv || inv.usedAt || inv.expiresAt < new Date()) return null;
  await prisma.adminInvite.update({ where: { id: inv.id }, data: { usedAt: new Date() } });
  const user = await prisma.adminUser.upsert({
    where: { email: inv.email },
    update: { active: true, lastLogin: new Date() },
    create: { email: inv.email, invitedById: inv.invitedById ?? null, lastLogin: new Date() },
  });
  return user;
}

/** Who may receive a LOGIN link: existing active admins + the bootstrap email. */
export async function canLogin(email: string) {
  const e = email.toLowerCase();
  if (e === (process.env.ADMIN_BOOTSTRAP_EMAIL || "").toLowerCase()) return true;
  const u = await prisma.adminUser.findUnique({ where: { email: e } });
  return !!u?.active;
}
