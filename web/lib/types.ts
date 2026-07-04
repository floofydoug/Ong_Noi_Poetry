export type Line = { vi: string; en: string };

export type Footnote = { anchor: string; note: string };
export type Marginalia = { kind: string; text: string; translation: string | null };

export type Poem = {
  title: string | null;
  title_vi: string | null;
  date_text: string | null;
  place: string | null;
  author: string | null;
  lines: Line[];
  tags: string[];
  marginalia: Marginalia[];
  footnotes: Footnote[];
  confidence: string;
  uncertain_spans: string[];
  visibility?: string;
  sensitivity?: { level: string; reason: string | null };
  boundary_reason?: string;
  notes: string | null;
};

export type Scan = {
  scanId: string;
  filename: string;
  poems: Poem[];
  pageNotes: string | null;
};

export type Suggestion = {
  id: string;
  scanId: string;
  poemIndex: number;
  lineIndex: number;
  originalText: string;    // the whole original VI line
  selectedText: string;    // the substring the user highlighted
  suggestedText: string;   // what they think it should say
  spokenText: string;      // raw speech-to-text (before edits)
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
};
