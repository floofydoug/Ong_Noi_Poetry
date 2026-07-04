"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// One selectable TipTap editor per Vietnamese line. We only read the SELECTION
// (to build a suggestion) — direct edits to the text are never saved.
export default function EditableLine({
  text,
  onSelect,
}: {
  text: string;
  onSelect: (selectedText: string) => void;
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: `<p>${escapeHtml(text)}</p>`,
    editable: true,
    immediatelyRender: false,
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      if (to > from) {
        const sel = editor.state.doc.textBetween(from, to, " ").trim();
        if (sel) onSelect(sel);
      }
    },
  });

  return <EditorContent editor={editor} />;
}
