import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "With Gratitude — Thanh Phung Poetry",
  description: "With gratitude to those who gathered and carried Ông's words forward.",
};

// Each name links to the poems Ông wrote mentioning that person (person-tag search).
// `q` must match the person's canonicalName in the registry. To thank someone else, add a row.
const personHref = (q: string) => `/search?mode=tag&q=${encodeURIComponent(q)}&kind=person`;

const THANKS: { name: string; q?: string; note: string }[] = [
  {
    name: "Đoàn Phùng",
    q: "Đoàn",
    note: "who gave order to a lifetime of verse — patiently organizing the sittings so that nothing would be lost.",
  },
  {
    name: "Dũng Phùng",
    q: "Dung",
    note: "for his thoughtful counsel, for gathering and tending the data, and for entrusting these pages to us.",
  },
  {
    name: "Lâm Anh Nguyễn",
    q: "Lâm Anh",
    note: "for shaping how Ông's words meet the world, and for the care behind all that carries them onward.",
  },
  // To thank another person, add: { name: "Full Name", q: "RegistryName", note: "…" }
  // Omit `q` if they aren't in the archive and the name shouldn't link.
];

export default function ThanksPage() {
  return (
    <div className="thanks">
      <Link href="/" className="thanks-back">‹ all poems</Link>

      <header className="thanks-head">
        <h1 className="thanks-vi">Lời Cảm Tạ</h1>
        <p className="thanks-en">With Gratitude</p>
      </header>

      <p className="thanks-intro">
        This archive of Ông's poetry is the work of many loving hands. It endures because family
        gathered his words, gave them order, and carried them gently into the light. With full
        hearts, we offer our thanks —
      </p>

      <div className="thanks-rule">· · ·</div>

      <ul className="thanks-list">
        {THANKS.map((t) => (
          <li key={t.name} className="thanks-item">
            {t.q ? (
              <Link href={personHref(t.q)} className="thanks-name" title={`Read the poems Ông wrote for ${t.name}`}>
                {t.name}
              </Link>
            ) : (
              <span className="thanks-name">{t.name}</span>
            )}
            <p className="thanks-note">{t.note}</p>
          </li>
        ))}
      </ul>

      <div className="thanks-rule">· · ·</div>

      <p className="thanks-close">
        And to all whose quiet devotion keeps these verses alive — thank you.
      </p>
      <p className="thanks-hint">Tap a name to read the poems Ông wrote for them.</p>
    </div>
  );
}
