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

  if (!me) return <div className="authnav" aria-hidden />; // reserve space, no flicker
  if (!me.admin)
    return (
      <div className="authnav">
        <Link href="/admin/signin" className="authnav-link">Admin sign in</Link>
      </div>
    );
  return (
    <div className="authnav">
      <span className="authnav-who">{me.name || me.email}</span>
      <Link href="/admin" className="authnav-link">Dashboard</Link>
      <button type="button" className="authnav-link authnav-out" onClick={signOut}>Sign out</button>
    </div>
  );
}
