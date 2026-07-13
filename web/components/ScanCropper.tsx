"use client";
import { useEffect, useRef, useState } from "react";

// Crop directly on the manuscript. No box until the first drag; once drawn, the controls float
// anchored to the box (bright, above the dimmed backdrop). Mouse + touch via pointer events.
const MAX_EDGE = 2000;
const estTokens = (w: number, h: number) => Math.min(4784, Math.ceil(w / 28) * Math.ceil(h / 28));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
type Box = { x: number; y: number; w: number; h: number };
type Mode = "new" | "move" | "nw" | "ne" | "sw" | "se";

export default function ScanCropper({ poemSlug, imageUrl, onClose, focusFraction = 0 }:
  { poemSlug: string; imageUrl: string; onClose: () => void; focusFraction?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ mode: Mode; sx: number; sy: number; box: Box } | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [contrast, setContrast] = useState(1.1);
  const [rotate, setRotate] = useState(0);
  const [context, setContext] = useState(""); // optional hint for the AI (e.g. correct title/names)
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // jump to the poem's approximate location on the stacked scan
  useEffect(() => {
    const img = imgRef.current!;
    const go = () => {
      if (!img.clientHeight) return;
      const r = img.getBoundingClientRect();
      const y = window.scrollY + r.top + focusFraction * r.height - window.innerHeight * 0.4;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    };
    if (img.complete && img.clientHeight) setTimeout(go, 60); else img.addEventListener("load", go);
    return () => img.removeEventListener("load", go);
  }, [focusFraction]);

  // live preview of the exact crop that will be sent — shows the rotation + contrast applied
  useEffect(() => {
    const cv = previewRef.current, im = imgRef.current;
    if (!cv || !im || !im.clientWidth || !box || box.w < 10) return;
    const s = im.naturalWidth / im.clientWidth;
    let dw = box.w * s, dh = box.h * s;
    const k = 150 / Math.max(dw, dh); dw *= k; dh *= k;
    const tmp = document.createElement("canvas"); tmp.width = dw; tmp.height = dh;
    const tc = tmp.getContext("2d")!; tc.filter = `contrast(${contrast})`;
    tc.drawImage(im, box.x * s, box.y * s, box.w * s, box.h * s, 0, 0, dw, dh);
    const rot = rotate % 180 !== 0;
    cv.width = rot ? dh : dw; cv.height = rot ? dw : dh;
    const oc = cv.getContext("2d")!;
    oc.clearRect(0, 0, cv.width, cv.height);
    oc.translate(cv.width / 2, cv.height / 2); oc.rotate((rotate * Math.PI) / 180); oc.drawImage(tmp, -dw / 2, -dh / 2);
  }, [box, contrast, rotate]);

  const rel = (e: React.PointerEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  function startNew(e: React.PointerEvent) {
    if (busy || result) return;
    e.preventDefault();
    wrapRef.current!.setPointerCapture(e.pointerId);
    const { x, y } = rel(e);
    const b = { x, y, w: 0, h: 0 };
    setBox(b); drag.current = { mode: "new", sx: e.clientX, sy: e.clientY, box: b };
  }
  const grab = (mode: Mode) => (e: React.PointerEvent) => {
    if (busy || result || !box) return;
    e.preventDefault(); e.stopPropagation();
    wrapRef.current!.setPointerCapture(e.pointerId);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, box };
  };
  function onMove(e: React.PointerEvent) {
    const d = drag.current; if (!d) return;
    const img = imgRef.current!, W = img.clientWidth, H = img.clientHeight;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (d.mode === "new") {
      const { x } = rel(e), cy = rel(e).y;
      setBox({ x: Math.min(d.box.x, x), y: Math.min(d.box.y, cy), w: Math.abs(x - d.box.x), h: Math.abs(cy - d.box.y) });
      return;
    }
    let { x, y, w, h } = d.box;
    if (d.mode === "move") { x = clamp(x + dx, 0, W - w); y = clamp(y + dy, 0, H - h); }
    else {
      if (d.mode.includes("w")) { const nx = clamp(x + dx, 0, x + w - 40); w = x + w - nx; x = nx; }
      if (d.mode.includes("e")) { w = clamp(w + dx, 40, W - x); }
      if (d.mode.includes("n")) { const ny = clamp(y + dy, 0, y + h - 40); h = y + h - ny; y = ny; }
      if (d.mode.includes("s")) { h = clamp(h + dy, 40, H - y); }
    }
    setBox({ x, y, w, h });
  }
  const onUp = () => { drag.current = null; };

  const img = imgRef.current;
  const sc = img && img.clientWidth ? img.naturalWidth / img.clientWidth : 1;
  let ew = (box?.w || 0) * sc, eh = (box?.h || 0) * sc;
  if (Math.max(ew, eh) > MAX_EDGE) { const k = MAX_EDGE / Math.max(ew, eh); ew *= k; eh *= k; }
  const rotated = rotate % 180 !== 0;
  const est = box && box.w > 10 ? estTokens(rotated ? eh : ew, rotated ? ew : eh) : 0;

  function renderPng(): string {
    const s = img!.naturalWidth / img!.clientWidth;
    let sw = box!.w * s, sh = box!.h * s, dw = sw, dh = sh;
    if (Math.max(dw, dh) > MAX_EDGE) { const k = MAX_EDGE / Math.max(dw, dh); dw *= k; dh *= k; }
    const tmp = document.createElement("canvas"); tmp.width = dw; tmp.height = dh;
    const tc = tmp.getContext("2d")!; tc.filter = `contrast(${contrast})`;
    tc.drawImage(img!, box!.x * s, box!.y * s, sw, sh, 0, 0, dw, dh);
    if (rotate % 360 === 0) return tmp.toDataURL("image/png");
    const out = document.createElement("canvas");
    out.width = rotated ? dh : dw; out.height = rotated ? dw : dh;
    const oc = out.getContext("2d")!;
    oc.translate(out.width / 2, out.height / 2); oc.rotate((rotate * Math.PI) / 180); oc.drawImage(tmp, -dw / 2, -dh / 2);
    return out.toDataURL("image/png");
  }

  async function run() {
    if (!box || box.w < 20) { setError("Draw a box over the poem first."); return; }
    setError(null); setBusy(true); setElapsed(0);
    const t0 = Date.now(); const timer = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 250);
    try {
      const r = await fetch(`/api/poems/${poemSlug}/reanalyze`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: renderPng(), crop: { contrast, rotate }, estTokens: est, context: context.trim() || undefined }),
      });
      const d = await r.json();
      if (!r.ok) setError(d.error || "re-analysis failed"); else setResult(d);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); clearInterval(timer); }
  }

  if (result) return (
    <div className="cropper-done">
      <p>✓ The AI re-read your crop — it’s now a <b>pending version</b> for an admin to approve.</p>
      <div className="re-preview">
        <div className="re-ptitle">{result.proposed.titleVi || result.proposed.title || "Không đề"}</div>
        {(result.proposed.lines || []).map((l: any, i: number) => <div key={i} className="re-pline">{l.vi}</div>)}
      </div>
      <button className="btn primary" onClick={onClose}>done</button>
    </div>
  );

  // anchor the floating controls just below the box (or above if it's low on the image)
  const H = img?.clientHeight || 0;
  const below = box ? box.y + box.h + 12 : 0;
  const placeAbove = box ? below > H - 120 : false;
  const ctrlStyle = box
    ? { left: clamp(box.x, 0, Math.max(0, (img?.clientWidth || 0) - 300)), top: placeAbove ? Math.max(4, box.y - 118) : below }
    : {};

  return (
    <div className="cropper">
      {!box && <p className="cropper-hint">✎ Drag a box over exactly where this poem starts and ends on the scan below.</p>}
      <div className="cropper-stage" ref={wrapRef} onPointerDown={startNew} onPointerMove={onMove}
        onPointerUp={onUp} onPointerCancel={onUp}>
        {/* crossOrigin is REQUIRED: in prod the scan comes from the images CDN (different origin),
            so without it the canvas is tainted and toDataURL() throws. Needs CORS headers on the CDN. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} src={imageUrl} alt="manuscript" crossOrigin="anonymous" draggable={false} style={{ filter: `contrast(${contrast})` }} />
        {box && (
          <div className="crop-box" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} onPointerDown={grab("move")}>
            <span className="crop-h nw" onPointerDown={grab("nw")} />
            <span className="crop-h ne" onPointerDown={grab("ne")} />
            <span className="crop-h sw" onPointerDown={grab("sw")} />
            <span className="crop-h se" onPointerDown={grab("se")} />
          </div>
        )}
        {box && box.w > 20 && !busy && (
          <div className="crop-tools" style={ctrlStyle} onPointerDown={(e) => e.stopPropagation()}>
            <div className="ct-preview">
              <canvas ref={previewRef} />
              <span className="mono">what the AI will read →</span>
            </div>
            <label className="ct-item">Contrast
              <input type="range" min={0.6} max={2} step={0.1} value={contrast} onChange={(e) => setContrast(+e.target.value)} />
            </label>
            <div className="ct-item">Rotate
              <button className="ct-rot" onClick={() => setRotate((r) => (r + 270) % 360)}>↺</button>
              <span className="mono">{rotate}°</span>
              <button className="ct-rot" onClick={() => setRotate((r) => (r + 90) % 360)}>↻</button>
            </div>
            <label className="ct-context">Context for the AI <span className="mono">(optional)</span>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder={`e.g. the title should read "Minh / Hoàng"; the author is Thanh-Phùng`}
                rows={2}
              />
            </label>
            <span className="ct-est">≈ 1 page · ~{est.toLocaleString()} tokens</span>
            <div className="ct-actions">
              <button className="btn ghost" onClick={onClose}>cancel</button>
              <button className="btn primary" disabled={!est} onClick={run}>Re-analyze this crop</button>
            </div>
          </div>
        )}
      </div>
      {busy && <p className="cropper-hint">Re-analyzing your crop… {elapsed}s</p>}
      {busy && <div className="re-bar"><div className="re-bar-fill" /></div>}
      {error && <p className="re-error">{error}</p>}
    </div>
  );
}
