"use client";
import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import type { Scan, Line } from "@/lib/types";
import { useSpeech } from "@/lib/useSpeech";
import EditableLine from "./EditableLine";
import PoemTags from "./PoemTags";
import ScanCropper from "./ScanCropper";
import AuthNav from "./AuthNav";
import { useAdmin } from "@/lib/useAdmin";
import { assetUrl } from "@/lib/images";

type Sel = {
  poemIndex: number;
  lineIndex: number;
  originalText: string;
  selectedText: string;
};

function markUnc(text: string): React.ReactNode[] {
  const parts = (text || "").split("[?]");
  return parts.flatMap((p, i) =>
    i === 0 ? [p] : [<span key={i} className="unc">[?]</span>, p]
  );
}

// Mobile-only: Vietnamese / English tabs you can swipe between (scroll down for the scan).
function MobileLines({ lines }: { lines: Line[] }) {
  const [lang, setLang] = useState<"vi" | "en">("vi");
  const startX = useRef(0);
  return (
    <div className="mobile-lines">
      <div className="langtabs">
        <button className={`langtab ${lang === "vi" ? "active" : ""}`} onClick={() => setLang("vi")}>
          Tiếng Việt
        </button>
        <button className={`langtab ${lang === "en" ? "active" : ""}`} onClick={() => setLang("en")}>
          English
        </button>
      </div>
      <div
        className={`lang-pane ${lang}`}
        onTouchStart={(e) => { startX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          const dx = e.changedTouches[0].clientX - startX.current;
          if (dx < -50) setLang("en");
          else if (dx > 50) setLang("vi");
        }}
      >
        {lines.map((L, i) =>
          !L.vi && !L.en ? (
            <div key={i} className="stanza-gap" />
          ) : (
            <div key={i} className="row">{markUnc(lang === "vi" ? L.vi : L.en)}</div>
          )
        )}
      </div>
      <div className="lang-hint">← swipe to switch language →</div>
    </div>
  );
}

export default function PoemView({ scan, imageUrl }: { scan: Scan; imageUrl: string }) {
  const isAdmin = useAdmin(); // confidence + other internal fields are admin-only
  const [deleted, setDeleted] = useState<Set<number>>(new Set());
  const [editMode, setEditMode] = useState(false);
  const [reanalyze, setReanalyze] = useState<number | null>(null);

  async function deletePoem(pi: number) {
    if (!confirm("Delete this poem? (soft delete — it can be restored)")) return;
    const r = await fetch(`/api/admin/poems/${scan.scanId}-p${pi + 1}`, { method: "DELETE" });
    if (r.ok) setDeleted((s) => new Set(s).add(pi));
  }
  const [sel, setSel] = useState<Sel | null>(null);
  // per-poem overlay from the DB (current lines, unverified line-edits, pending re-analysis)
  type Ov = { lines: Line[]; titleVi: string | null; title: string | null;
    editedLines: Record<number, boolean>; reanalysis: { at: string; verified: boolean } | null;
    croppedImage?: string | null };
  const [overlay, setOverlay] = useState<Map<number, Ov>>(new Map());

  async function refreshOverlay() {
    try {
      const d = await fetch(`/api/scans/${scan.scanId}/edits`, { cache: "no-store" }).then((r) => r.json());
      const m = new Map<number, Ov>();
      for (const [pi, o] of Object.entries(d.poems || {})) m.set(+pi, o as Ov);
      setOverlay(m);
    } catch { /* ignore */ }
  }
  useEffect(() => { refreshOverlay(); }, [scan.scanId]);

  function onSaved() { refreshOverlay(); setSel(null); }

  return (
    <div className="page">
      <div className="topbar">
        <Link href="/" className="back">‹ all poems</Link>
        <span className="sid">{scan.scanId} · {scan.filename}</span>
        <button
          className={`editToggle ${editMode ? "on" : ""}`}
          onClick={() => { setEditMode((v) => !v); setSel(null); }}
        >
          {editMode ? "editing" : "suggest edits"}
        </button>
        <AuthNav />
      </div>

      {editMode && (
        <p className="editHint">
          Select the Vietnamese words that look wrong (long-press on a phone), then speak the
          correction.
        </p>
      )}

      {scan.poems.map((p, pi) => {
        const ov = overlay.get(pi);
        const eff = (ov?.lines ?? p.lines) as Line[];
        const re = ov?.reanalysis;
        return (
        <Fragment key={pi}>
          {pi > 0 && <div className="divider">· · ·</div>}
          {deleted.has(pi) ? (
            <p className="poem-deleted">Poem deleted.</p>
          ) : (
          <article className="poem" id={`poem-${pi}`}>
            <h2>
              {ov?.titleVi || p.title_vi || ov?.title || p.title || "Không đề"}
              {isAdmin && <span className={`badge ${p.confidence}`}>{p.confidence}</span>}
              {isAdmin && <button className="poem-del" onClick={() => deletePoem(pi)} title="delete poem">delete</button>}
            </h2>
            <p className="meta">
              {[p.date_text, p.place, p.author].filter(Boolean).join(" · ")}
            </p>
            {re && !re.verified && (
              <p className="reanalyzed-badge">
                ⟳ Re-analyzed {new Date(re.at).toLocaleDateString()} · <b>unverified</b> — awaiting an admin’s review
              </p>
            )}

            <div className="lines desktop">
              {eff.map((L, li) => {
                if (!L.vi && !L.en) return <div key={li} className="stanza-gap" />;
                const pending = ov?.editedLines?.[li] === false;
                return (
                  <Fragment key={li}>
                    <div className={`vi editable ${pending ? "pending" : ""}`}
                      title={pending ? "edited — pending admin verification" : undefined}>
                      {editMode ? (
                        <EditableLine
                          text={L.vi}
                          onSelect={(selectedText) =>
                            setSel({ poemIndex: pi, lineIndex: li, originalText: L.vi, selectedText })
                          }
                        />
                      ) : (
                        markUnc(L.vi)
                      )}
                    </div>
                    <div className="en">{markUnc(L.en)}</div>
                  </Fragment>
                );
              })}
            </div>

            <MobileLines lines={eff} />

            {ov?.croppedImage && (
              <div className="poem-crop">
                <div className="poem-crop-label">⟳ this poem’s manuscript (cropped &amp; oriented)</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assetUrl(ov.croppedImage)} alt="cropped manuscript for this poem" />
              </div>
            )}

            {p.footnotes?.length > 0 && (
              <div className="notes-block">
                <span>footnotes</span>
                <ol>
                  {p.footnotes.map((f, i) => (
                    <li key={i}><em>{f.anchor}</em> — {f.note}</li>
                  ))}
                </ol>
              </div>
            )}
            {p.marginalia?.length > 0 && (
              <div className="notes-block">
                <span>marginalia</span>
                <ul>
                  {p.marginalia.map((m, i) => (
                    <li key={i}>
                      <span className="mk">{m.kind}</span>
                      {markUnc(m.text)}
                      {m.translation ? <> — <em>{m.translation}</em></> : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {p.uncertain_spans?.length > 0 && (
              <div className="notes-block">
                <span>uncertain readings</span>
                <ul>{p.uncertain_spans.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            )}
            <PoemTags poemSlug={`${scan.scanId}-p${pi + 1}`} />
            <button className="reanalyze-btn" onClick={() => setReanalyze(pi)}>
              ⟳ transcription wrong? re-analyze this poem from the scan
            </button>
          </article>
          )}
        </Fragment>
        );
      })}

      {scan.pageNotes && <p className="pagenote">{scan.pageNotes}</p>}

      {reanalyze !== null ? (
        <div className="original">
          <div className="label">Re-analyze · poem {reanalyze + 1} — crop the manuscript</div>
          <ScanCropper poemSlug={`${scan.scanId}-p${reanalyze + 1}`} imageUrl={imageUrl}
            focusFraction={(reanalyze + 0.5) / Math.max(1, scan.poems.length)}
            onClose={() => { setReanalyze(null); refreshOverlay(); }} />
        </div>
      ) : (
        <OriginalScan scanId={scan.scanId} imageUrl={imageUrl} />
      )}

      {sel && (
        <SuggestSheet
          scanId={scan.scanId}
          sel={sel}
          onClose={() => setSel(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

// The original scan, with 90° rotate controls for pages that were scanned sideways.
// Rotation is persisted server-side (the JPEG is re-encoded), so it sticks for everyone.
function OriginalScan({ scanId, imageUrl }: { scanId: string; imageUrl: string }) {
  const [bust, setBust] = useState("");
  const [busy, setBusy] = useState(false);

  async function rotate(dir: "cw" | "ccw") {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/rotate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scanId, dir }),
      });
      if (res.ok) setBust(`?t=${Date.now()}`); // cache-bust to show the rotated file
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="original">
      <div className="orig-head">
        <div className="label">Original manuscript</div>
        <div className="rotctl">
          <button onClick={() => rotate("ccw")} disabled={busy} title="Rotate left 90°" aria-label="Rotate left">↺</button>
          <button onClick={() => rotate("cw")} disabled={busy} title="Rotate right 90°" aria-label="Rotate right">↻</button>
        </div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${imageUrl}${bust}`} alt="original scan" className={busy ? "rotating" : ""} />
    </div>
  );
}

function SuggestSheet({
  scanId, sel, onClose, onSaved,
}: {
  scanId: string;
  sel: Sel;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(sel.selectedText);
  const [saving, setSaving] = useState(false);
  const sp = useSpeech("vi-VN");

  // Push finalized speech into the editable field.
  useEffect(() => { if (sp.final) setValue(sp.final); }, [sp.final]);

  const before = sel.originalText.slice(0, sel.originalText.indexOf(sel.selectedText));
  const after = sel.originalText.slice(before.length + sel.selectedText.length);

  async function submit() {
    setSaving(true);
    try {
      const newLine = before + value.trim() + after; // full corrected line
      const r = await fetch(`/api/poems/${scanId}-p${sel.poemIndex + 1}/edit`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ lineIndex: sel.lineIndex, field: "vi", after: newLine }),
      });
      await r.json();
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="sheet">
      <div className="lbl">Suggest an edit</div>
      <div className="orig">
        {before}<mark>{sel.selectedText}</mark>{after}
      </div>

      <input
        className="say"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="What should it say?"
        lang="vi"
      />
      {sp.interim && <div className="interim">…{sp.interim}</div>}

      <div className="row">
        {sp.supported ? (
          <button
            className={`mic ${sp.listening ? "rec" : ""}`}
            onClick={() => (sp.listening ? sp.stop() : sp.start())}
          >
            <span className="dot" />
            {sp.listening ? "listening… tap to stop" : "🎤 speak the Vietnamese"}
          </button>
        ) : (
          <span className="hint">Voice not supported here — type the correction (use Chrome/Safari for the mic).</span>
        )}
        <button className="btn primary" disabled={saving || !value.trim()} onClick={submit}>
          {saving ? "saving…" : "Submit suggestion"}
        </button>
        <button className="btn ghost" onClick={onClose}>cancel</button>
      </div>
      {sp.error && <div className="hint">mic: {sp.error}</div>}
    </div>
  );
}
