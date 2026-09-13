/**
 * Un `data:` URL se decodează LOCAL, nu printr-o cerere de rețea.
 *
 * Regresia pe care o blochează: `fetch("data:…")` merge pe localhost, dar în producție pagina are
 * `connect-src`, iar schema `data:` nu e acoperită — browserul refuză conexiunea, `fetch` aruncă
 * „Failed to fetch", iar la `openParAttachment` asta cădea într-un `catch` tăcut: utilizatorul
 * apăsa pe document și nu se întâmpla nimic.
 */
import { describe, it, expect } from "vitest";
import { dataUrlToBlob } from "../dataUrl";

/** jsdom nu implementează `Blob.text()`; citim prin FileReader, ca browserul vechi. */
function readText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(blob);
  });
}

describe("dataUrlToBlob", () => {
  it("decodează base64 și păstrează tipul", async () => {
    const blob = dataUrlToBlob("data:application/pdf;base64,JVBERi0xLjQK");
    expect(blob.type).toBe("application/pdf");
    expect(await readText(blob)).toBe("%PDF-1.4\n");
  });

  it("acceptă și conținut ne-base64, procent-codat", async () => {
    const blob = dataUrlToBlob("data:text/plain,Bun%C4%83%20ziua");
    expect(await readText(blob)).toBe("Bună ziua");
  });

  it("fără tip declarat, cade pe octeți bruți", () => {
    expect(dataUrlToBlob("data:;base64,AAECAw==").type).toBe("application/octet-stream");
  });

  it("refuză explicit ce nu e un data: URL, în loc să întoarcă un blob gol", () => {
    expect(() => dataUrlToBlob("https://exemplu.md/f.pdf")).toThrow();
  });
});
