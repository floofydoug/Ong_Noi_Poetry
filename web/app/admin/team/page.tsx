"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Admin = { email: string; name: string | null; active: boolean; lastLogin: string | null; createdAt: string };
type Invite = { email: string; expiresAt: string; createdAt: string };

export default function Team() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dev, setDev] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/admin/team", { cache: "no-store" });
    if (r.ok) { const d = await r.json(); setAdmins(d.admins || []); setInvites(d.invites || []); }
  }
  useEffect(() => { load(); }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null); setDev(null);
    try {
      const r = await fetch("/api/admin/team", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await r.json();
      if (r.ok) { setMsg(`Invite sent to ${email} (valid 7 days).`); setDev(d.devLink || null); setEmail(""); load(); }
      else setMsg(d.error || "failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="admin">
      <div className="dash-top">
        <h1>Admin team</h1>
        <Link href="/admin" className="back">‹ dashboard</Link>
      </div>

      <form onSubmit={invite} className="invite-form">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="email to invite as admin" />
        <button disabled={busy}>{busy ? "sending…" : "Send invite"}</button>
      </form>
      {msg && <p className="muted">{msg}</p>}
      {dev && <p className="devlink">Dev (email stubbed): <a href={dev}>open invite link →</a></p>}

      <h2 className="sec-h">Admins ({admins.length})</h2>
      <table className="rtable">
        <thead><tr><th>email</th><th>last login</th><th>since</th><th></th></tr></thead>
        <tbody>
          {admins.map((a) => (
            <tr key={a.email}>
              <td className="mono">{a.email}</td>
              <td>{a.lastLogin ? new Date(a.lastLogin).toLocaleDateString() : "—"}</td>
              <td>{new Date(a.createdAt).toLocaleDateString()}</td>
              <td>{a.active ? "" : <span className="cf low">disabled</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {invites.length > 0 && (
        <>
          <h2 className="sec-h">Pending invites ({invites.length})</h2>
          <table className="rtable">
            <thead><tr><th>email</th><th>expires</th></tr></thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.email + i.createdAt}>
                  <td className="mono">{i.email}</td>
                  <td>{new Date(i.expiresAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
