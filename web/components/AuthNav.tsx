"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Me = { admin: boolean; name: string | null; email: string | null };

// Top-right auth control. Visitors see a "Sign in" link; signed-in admins see their name,
// a Dashboard link, and Sign out. Backed by the magic-link flow at /admin/signin.
export default function AuthNav() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (alive) setMe(d); })
      .catch(() => { if (alive) setMe({ admin: false, name: null, email: null }); });
    return () => { alive = false; };
  }, []);

  async function signOut() {
    await fetch("/api/admin/logout", { method: "POST" });
    location.reload();
  }

  // The gratitude link is always present (independent of auth state); the auth control follows.
  return (
    <div className="authnav">
      <Link href="/thanks" className="authnav-link authnav-thanks">With gratitude</Link>
      {!me ? null : !me.admin ? (
        <Link href="/admin/signin" className="authnav-link">Admin sign in</Link>
      ) : (
        <>
          <span className="authnav-who">{me.name || me.email}</span>
          <Link href="/admin" className="authnav-link">Dashboard</Link>
          <button type="button" className="authnav-link authnav-out" onClick={signOut}>Sign out</button>
        </>
      )}
    </div>
  );
}
