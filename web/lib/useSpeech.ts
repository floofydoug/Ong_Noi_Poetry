"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Minimal Web Speech API wrapper for Vietnamese dictation.
// Works on Chrome (desktop/Android) and Safari (iOS/macOS). Requires HTTPS
// (or localhost) + a user gesture to start. Not supported in Firefox.
export function useSpeech(lang = "vi-VN") {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [final, setFinal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<any>(null);

  useEffect(() => {
    const SR =
      (typeof window !== "undefined" &&
        ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) ||
      null;
    setSupported(Boolean(SR));
  }, []);

  const start = useCallback(() => {
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError("Speech recognition isn't supported in this browser (try Chrome or Safari).");
      return;
    }
    setError(null);
    setInterim("");
    setFinal("");
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e: any) => {
      let itm = "";
      let fin = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) fin += t;
        else itm += t;
      }
      if (fin) setFinal((prev) => (prev ? prev + " " : "") + fin.trim());
      setInterim(itm);
    };
    rec.onerror = (e: any) => setError(e.error || "speech error");
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, [lang]);

  const stop = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);

  return { supported, listening, interim, final, error, start, stop, setFinal };
}
