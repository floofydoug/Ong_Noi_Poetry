import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Admin-only. DELETE = soft delete (set deletedAt); POST = restore.
export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { slug } = await params;
  await prisma.poem.update({ where: { slug }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true, deleted: true });
}

export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { slug } = await params;
  await prisma.poem.update({ where: { slug }, data: { deletedAt: null } });
  return NextResponse.json({ ok: true, restored: true });
}
