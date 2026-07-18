"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Admin = { email: string; name: string | null; active: boolean; lastLogin: string | null; createdAt: string };
type Invite = { email: string; expiresAt: string; createdAt: string };

function mailtoFor(email: string, url: string) {
  const body = `You've been invited as an admin of the Thanh Phung Poetry archive.\n\nOpen this link to continue (valid for 7 days, single use):\n${url}\n\nIf you didn't expect this, you can ignore this email.`;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("You're invited to help edit Thanh Phung Poetry")}&body=${encodeURIComponent(body)}`;
}

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

  // Mint (or re-mint) a link for `addr`. Used by the top form AND each pending-invite row's
  // "Get link" — regenerating replaces the old (unshowable) token, so it doubles as resend.
  async function generate(addr: string) {
    setBusy(true); setMsg(null); setLink(null); setCopied(false);
    try {
      const r = await fetch("/api/admin/team", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: addr }),
      });
      const d = await r.json();
      if (r.ok) { setLink({ url: d.link, email: d.email }); setEmail(""); load(); }
      else setMsg(d.error || "failed");
    } finally { setBusy(false); }
  }

  async function revoke(addr: string) {
    if (!confirm(`Revoke the pending invite for ${addr}? Its link will stop working.`)) return;
    await fetch("/api/admin/team", {
      method: "DELETE", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: addr }),
    });
    if (link?.email === addr) setLink(null);
    load();
  }

  async function copyLink() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link.url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }

  return (
    <div className="admin">
      <div className="dash-top">
        <h1>Admin team</h1>
        <Link href="/admin" className="back">‹ dashboard</Link>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); generate(email); }} className="invite-form">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="email to invite as admin" />
        <button disabled={busy}>{busy ? "generating…" : "Generate invite link"}</button>
      </form>
      {msg && <p className="muted">{msg}</p>}
      {link && (
        <div className="invite-link">
          <p className="muted">Invite link for <b>{link.email}</b> — valid 7 days, single use. Copy it or open a
            pre-filled email, then send it from your own inbox:</p>
          <div className="invite-link-row">
            <input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} className="mono" />
            <button type="button" onClick={copyLink}>{copied ? "copied ✓" : "copy"}</button>
            <a className="btn" href={mailtoFor(link.email, link.url)}>compose email →</a>
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
          <p className="muted">Links are shown only once when generated. Use <b>Get link</b> to mint a fresh one to
            re-send (the old link stops working), or <b>Revoke</b> to cancel.</p>
          <table className="rtable">
            <thead><tr><th>email</th><th>expires</th><th></th></tr></thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.email + i.createdAt}>
                  <td className="mono">{i.email}</td>
                  <td>{new Date(i.expiresAt).toLocaleDateString()}</td>
                  <td className="row-actions">
                    <button type="button" className="linkish" disabled={busy}
                      onClick={() => generate(i.email)}>Get link</button>
                    <button type="button" className="linkish danger"
                      onClick={() => revoke(i.email)}>Revoke</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
