/**
 * CONTPLATA-faza-1 — culorile propuse pentru contul de plată tipărit.
 *
 * Sunt DATE (culoarea aleasă se scrie pe PDF-ul trimis clientului), nu tema aplicației — de aceea
 * stau ca hex aici, într-un .ts, și nu ca tokeni Vector 365. Owner-ul poate alege oricare altă
 * culoare din selector; lista e doar scurtătura spre cele care arată bine pe hârtie.
 */
export const DOCUMENT_ACCENT_PRESETS: { hex: string; name: string }[] = [
  { hex: "#047857", name: "Smarald" },
  { hex: "#1F3A68", name: "Bleumarin" },
  { hex: "#0B57D0", name: "Albastru" },
  { hex: "#6D28D9", name: "Violet" },
  { hex: "#B91C1C", name: "Roșu închis" },
  { hex: "#B45309", name: "Chihlimbar" },
  { hex: "#0F766E", name: "Turcoaz" },
  { hex: "#111827", name: "Grafit" },
];

export function isHexColor(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}
