"use client";
import { useEffect, useState } from "react";

// Real admin check via the session (server truth). Gates admin-only UI: confidence badges,
// delete buttons, verify controls. Replaces the earlier localStorage placeholder.
export function useAdmin(): boolean {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (alive) setAdmin(!!d.admin); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return admin;
}
