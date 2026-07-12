"use client";
import Link from "next/link";
import { useState } from "react";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [dev, setDev] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch("/api/admin/signin", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await r.json();
      setDev(d.devLink || null);
      setSent(true);
    } finally { setBusy(false); }
  }

  return (
    <div className="admin signin">
      <div className="signin-card">
        <h1>Admin sign in</h1>
        {sent ? (
          <>
            <p className="muted">
              If <b>{email}</b> is an admin, a one-time sign-in link is on its way — valid for 7 days.
            </p>
            {dev && (
              <p className="devlink">
                Dev (email stubbed): <a href={dev}>open sign-in link →</a>
              </p>
            )}
            <p><Link href="/" className="back">‹ back to poems</Link></p>
          </>
        ) : (
          <form onSubmit={submit} className="signin-form">
            <p className="muted">Enter your email and we’ll send you a secure sign-in link. No password needed.</p>
            <input type="email" required autoFocus value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />
            <button disabled={busy}>{busy ? "sending…" : "Send sign-in link"}</button>
            <Link href="/" className="back">‹ back to poems</Link>
          </form>
        )}
      </div>
    </div>
  );
}
