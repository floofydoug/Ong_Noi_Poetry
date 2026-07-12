import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";

// Who am I? Client components use this to show/hide admin-only UI.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const a = await getCurrentAdmin();
  return NextResponse.json({ admin: !!a, email: a?.email ?? null, name: a?.name ?? null });
}
