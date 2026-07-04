"use client";
import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import type { Scan, Suggestion } from "@/lib/types";
import { listSuggestions, saveSuggestion } from "@/lib/suggestions";
import { useSpeech } from "@/lib/useSpeech";
import EditableLine from "./EditableLine";

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

export default function PoemView({ scan, imageUrl }: { scan: Scan; imageUrl: string }) {
  const [editMode, setEditMode] = useState(false);
  const [sel, setSel] = useState<Sel | null>(null);
  const [sugKeys, setSugKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    listSuggestions(scan.scanId).then((rows) =>
      setSugKeys(new Set(rows.filter((r) => r.status === "pending").map((r) => `${r.poemIndex}:${r.lineIndex}`)))
    );
  }, [scan.scanId]);

  function onSaved(s: Suggestion) {
    setSugKeys((prev) => new Set(prev).add(`${s.poemIndex}:${s.lineIndex}`));
    setSel(null);
  }

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
      </div>

      {editMode && (
        <p className="editHint">
          Select the Vietnamese words that look wrong (long-press on a phone), then speak the
          correction.
        </p>
      )}

      {scan.poems.map((p, pi) => (
        <Fragment key={pi}>
          {pi > 0 && <div className="divider">· · ·</div>}
          <article className="poem">
            <h2>
              {p.title_vi || p.title || "Không đề"}
              <span className={`badge ${p.confidence}`}>{p.confidence}</span>
            </h2>
            <p className="meta">
              {[p.date_text, p.place, p.author].filter(Boolean).join(" · ")}
            </p>

            <div className="lines">
              {p.lines.map((L, li) => {
                if (!L.vi && !L.en) return <div key={li} className="stanza-gap" />;
                const hasSug = sugKeys.has(`${pi}:${li}`);
                return (
                  <Fragment key={li}>
                    <div className={`vi editable ${hasSug ? "hasSug" : ""}`}>
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
            {p.tags?.length > 0 && (
              <div className="tags">{p.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
            )}
          </article>
        </Fragment>
      ))}

      {scan.pageNotes && <p className="pagenote">{scan.pageNotes}</p>}

      <div className="original">
        <div className="label">Original manuscript</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="original scan" />
      </div>

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

function SuggestSheet({
  scanId, sel, onClose, onSaved,
}: {
  scanId: string;
  sel: Sel;
  onClose: () => void;
  onSaved: (s: Suggestion) => void;
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
      const s = await saveSuggestion({
        scanId,
        poemIndex: sel.poemIndex,
        lineIndex: sel.lineIndex,
        originalText: sel.originalText,
        selectedText: sel.selectedText,
        suggestedText: value.trim(),
        spokenText: sp.final,
      });
      onSaved(s);
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
