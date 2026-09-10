/**
 * Antetul `Content-Disposition` — un nume de fișier nu are voie să rupă răspunsul.
 * Vezi incidentul din 10.09.2026 (dovada de plată cu diacritice → 500).
 */
import { describe, it, expect } from "vitest";
import { asciiFileName, contentDisposition } from "../contentDisposition";

// eslint-disable-next-line no-control-regex -- exact ce verificăm: antetul trebuie să fie ByteString
const isByteString = (v: string) => /^[\x00-\xff]*$/.test(v) && !/[\r\n]/.test(v);

describe("asciiFileName", () => {
  it("[blocant] pliază diacriticele românești, nu le înlocuiește cu „_”", () => {
    expect(asciiFileName("Confirmare plată — PAR-2026-0023.png")).toBe("Confirmare plata - PAR-2026-0023.png");
    expect(asciiFileName("Act de predare-primire încheiat.pdf")).toBe("Act de predare-primire incheiat.pdf");
    expect(asciiFileName("Ștefan Țurcanu.pdf")).toBe("Stefan Turcanu.pdf");
  });

  it("[blocant] scoate ghilimelele și caracterele de control (injecție de antet)", () => {
    const out = asciiFileName('ordin"; rm -rf /\r\nX-Injectat: da.png');
    expect(out).not.toContain('"');
    expect(out).not.toMatch(/[\r\n]/);
  });

  it("ce nu are echivalent ASCII devine „_”, iar un nume gol primește o rezervă", () => {
    expect(asciiFileName("отчёт.pdf")).toMatch(/^_+\.pdf$/);
    expect(asciiFileName("   ")).toBe("document");
    expect(asciiFileName("", "atasament")).toBe("atasament");
  });
});

describe("contentDisposition", () => {
  it("[blocant] antetul rămâne transmisibil (ISO-8859-1, fără rânduri noi)", () => {
    const header = contentDisposition("inline", "Confirmare plată — PAR-2026-0023.png");
    expect(isByteString(header)).toBe(true);
    expect(/^[\x20-\x7e]*$/.test(header)).toBe(true);
  });

  it("[blocant] păstrează numele complet în filename*, recuperabil cu diacritice", () => {
    const name = "Confirmare plată — PAR-2026-0023.png";
    const header = contentDisposition("attachment", name);
    const encoded = header.match(/filename\*=UTF-8''(.+)$/)?.[1] ?? "";
    expect(decodeURIComponent(encoded)).toBe(name);
  });

  it("scrie tipul cerut și numele ASCII pentru clienții vechi", () => {
    const header = contentDisposition("inline", "raport ședință.pdf");
    expect(header.startsWith('inline; filename="raport sedinta.pdf"')).toBe(true);
  });
});
