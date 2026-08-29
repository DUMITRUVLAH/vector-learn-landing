/**
 * DG-104 — editorul de șabloane, „ca la Word".
 *
 * De ce TipTap și nu `contenteditable` cu `document.execCommand`: comanda e depreciată și se
 * comportă diferit de la un browser la altul (mai ales la liste și tabele), iar un editor scris de
 * la zero ar fi fost cel mai scump item din tot modulul. TipTap (ProseMirror) ține un model de
 * document, deci lipirea din Word intră prin schema lui: ce nu are corespondent (stiluri inline,
 * `<o:p>`, `<font>`) pică singur, fără să pierdem structura.
 *
 * Se încarcă DOAR pe ruta editorului (App.tsx lazy) — celelalte pagini nu plătesc bundle-ul.
 * Curățarea autoritară rămâne pe server (server/lib/docs/sanitizeHtml.ts): API-ul poate fi apelat
 * și fără editor.
 */
import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Table as TableIcon,
  Minus,
  Undo2,
  Redo2,
  Code2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface DocTemplateEditorProps {
  value: string;
  onChange: (html: string) => void;
}

interface ToolButton {
  label: string;
  icon: typeof Bold;
  run: () => void;
  isActive?: () => boolean;
}

export function DocTemplateEditor({ value, onChange }: DocTemplateEditorProps) {
  const [sourceMode, setSourceMode] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value,
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    editorProps: {
      attributes: {
        class:
          "prose-none min-h-[380px] w-full rounded-b-lg border border-t-0 border-border bg-background p-4 text-sm text-foreground focus:outline-none",
        "aria-label": "Corpul șablonului",
      },
    },
  });

  // Când corpul e schimbat din afară (ex. am deschis alt șablon), editorul trebuie resincronizat.
  useEffect(() => {
    if (editor && !editor.isDestroyed && value !== editor.getHTML()) {
      editor.commands.setContent(value, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return null;

  const buttons: ToolButton[] = [
    { label: "Îngroșat", icon: Bold, run: () => editor.chain().focus().toggleBold().run(), isActive: () => editor.isActive("bold") },
    { label: "Cursiv", icon: Italic, run: () => editor.chain().focus().toggleItalic().run(), isActive: () => editor.isActive("italic") },
    { label: "Subliniat", icon: UnderlineIcon, run: () => editor.chain().focus().toggleUnderline().run(), isActive: () => editor.isActive("underline") },
    { label: "Titlu mare", icon: Heading1, run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), isActive: () => editor.isActive("heading", { level: 1 }) },
    { label: "Titlu mic", icon: Heading2, run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), isActive: () => editor.isActive("heading", { level: 2 }) },
    { label: "Listă cu puncte", icon: List, run: () => editor.chain().focus().toggleBulletList().run(), isActive: () => editor.isActive("bulletList") },
    { label: "Listă numerotată", icon: ListOrdered, run: () => editor.chain().focus().toggleOrderedList().run(), isActive: () => editor.isActive("orderedList") },
    { label: "Aliniere la stânga", icon: AlignLeft, run: () => editor.chain().focus().setTextAlign("left").run() },
    { label: "Centrat", icon: AlignCenter, run: () => editor.chain().focus().setTextAlign("center").run() },
    { label: "Aliniere la dreapta", icon: AlignRight, run: () => editor.chain().focus().setTextAlign("right").run() },
    { label: "Tabel", icon: TableIcon, run: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { label: "Linie de separare", icon: Minus, run: () => editor.chain().focus().setHorizontalRule().run() },
    { label: "Anulează", icon: Undo2, run: () => editor.chain().focus().undo().run() },
    { label: "Refă", icon: Redo2, run: () => editor.chain().focus().redo().run() },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 rounded-t-lg border border-border bg-muted/40 p-2">
        {buttons.map((b) => (
          <button
            key={b.label}
            type="button"
            aria-label={b.label}
            title={b.label}
            onClick={b.run}
            className={cn(
              "touch-target rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground",
              b.isActive?.() && "bg-primary/10 text-primary"
            )}
          >
            <b.icon className="h-4 w-4" aria-hidden="true" />
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <button
          type="button"
          aria-label="Vedere sursă HTML"
          title="Vedere sursă HTML"
          onClick={() => setSourceMode((s) => !s)}
          className={cn(
            "touch-target rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground",
            sourceMode && "bg-primary/10 text-primary"
          )}
        >
          <Code2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {sourceMode ? (
        <textarea
          aria-label="Sursa HTML a șablonului"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="min-h-[380px] w-full rounded-b-lg border border-t-0 border-border bg-background p-4 font-mono text-xs text-foreground"
        />
      ) : (
        <EditorContent editor={editor} />
      )}
    </div>
  );
}
