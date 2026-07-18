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
  const [link, setLink] = useState<{ url: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    const r = await fetch("/api/admin/team", { cache: "no-store" });
    if (r.ok) { const d = await r.json(); setAdmins(d.admins || []); setInvites(d.invites || []); }
  }
  useEffect(() => { load(); }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null); setLink(null); setCopied(false);
    try {
      const r = await fetch("/api/admin/team", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await r.json();
      if (r.ok) { setLink({ url: d.link, email: d.email }); setEmail(""); load(); }
      else setMsg(d.error || "failed");
    } finally { setBusy(false); }
  }

  async function copyLink() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link.url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }

  const mailto = link
    ? `mailto:${encodeURIComponent(link.email)}?subject=${encodeURIComponent("You're invited to help edit Thanh Phung Poetry")}&body=${encodeURIComponent(`You've been invited as an admin of the Thanh Phung Poetry archive.\n\nOpen this link to continue (valid for 7 days, single use):\n${link.url}\n\nIf you didn't expect this, you can ignore this email.`)}`
    : "";

  return (
    <div className="admin">
      <div className="dash-top">
        <h1>Admin team</h1>
        <Link href="/admin" className="back">‹ dashboard</Link>
      </div>

      <form onSubmit={invite} className="invite-form">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="email to invite as admin" />
        <button disabled={busy}>{busy ? "generating…" : "Generate invite link"}</button>
      </form>
      {msg && <p className="muted">{msg}</p>}
      {link && (
        <div className="invite-link">
          <p className="muted">Invite link for <b>{link.email}</b> — valid 7 days, single use. Send it to them yourself:</p>
          <div className="invite-link-row">
            <input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} className="mono" />
            <button type="button" onClick={copyLink}>{copied ? "copied ✓" : "copy"}</button>
            <a className="btn" href={mailto}>compose email →</a>
          </div>
        </div>
      )}

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
