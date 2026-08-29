/**
 * DG-105 — cipul de câmp: în editor arată ca o etichetă („IBAN contraparte"), în șablon se salvează
 * ca `{{contraparte.iban}}`.
 *
 * De ce nod atomic și nu text simplu: dacă ar fi text, Backspace ar mușca din el caracter cu
 * caracter și ar rămâne `{{contraparte.` — un câmp rupt care în act se tipărește cu acolade.
 * Ca nod atomic, se șterge dintr-o dată sau deloc.
 *
 * Serializarea păstrează ȘI marcajul (`data-field`, pentru re-deschiderea în editor) ȘI textul
 * `{{...}}` (pentru randarea actului cu `renderWithContext`) — sanitizer-ul serverului lasă
 * `data-field` să treacă tocmai pentru asta.
 */
import { Node, mergeAttributes } from "@tiptap/core";

export interface FieldChipOptions {
  /** Traduce numele tehnic în eticheta arătată în editor. */
  labelFor: (name: string) => string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fieldChip: {
      insertField: (name: string) => ReturnType;
    };
  }
}

export const FieldChip = Node.create<FieldChipOptions>({
  name: "fieldChip",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { labelFor: (name: string) => name };
  },

  addAttributes() {
    return {
      field: {
        default: "",
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-field") ?? "",
        renderHTML: (attrs) => ({ "data-field": attrs.field as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-field]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const field = (node.attrs.field as string) ?? "";
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class:
          "rounded bg-primary/10 px-1 py-0.5 text-primary text-[0.9em] whitespace-nowrap",
      }),
      `{{${field}}}`,
    ];
  },

  renderText({ node }) {
    return `{{${node.attrs.field as string}}}`;
  },

  addCommands() {
    return {
      insertField:
        (name: string) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { field: name } }),
    };
  },
});
