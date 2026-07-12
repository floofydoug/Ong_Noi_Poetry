import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Cheap gate: no session cookie on an /admin page → bounce to sign-in. Real authorization is
// enforced server-side (getCurrentAdmin) in the pages/APIs; this is just the redirect UX.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/admin/signin") || pathname.startsWith("/admin/accept"))
    return NextResponse.next();
  if (!req.cookies.get("ongnoi_admin")) {
    // Anchor on the public APP_URL, not the proxied internal host, so we don't redirect to localhost.
    const base = process.env.APP_URL || req.nextUrl.origin;
    const url = new URL("/admin/signin", base);
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
