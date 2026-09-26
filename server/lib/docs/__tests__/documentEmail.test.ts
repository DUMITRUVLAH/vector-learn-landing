/**
 * @vitest-environment node
 *
 * CRM-U03 — e-mailul actului „din partea FinFlow Documente".
 */
import { describe, it, expect } from "vitest";
import { documentEmailHtml, documentSender, senderAddress } from "../documentEmail";

describe("expeditorul", () => {
  it("[blocant] numele afișat e al firmei + FinFlow Documente, adresa rămâne cea verificată", () => {
    expect(documentSender("ATIC", '"FinFlow" <noreply@finflow.best>')).toBe('"ATIC · FinFlow Documente" <noreply@finflow.best>');
    expect(documentSender(null, "noreply@finflow.best")).toBe('"FinFlow Documente" <noreply@finflow.best>');
  });
  it("[blocant] un nume de firmă cu ghilimele sau < > nu rupe antetul", () => {
    expect(documentSender('SRL "Alfa" <x>', "noreply@finflow.best")).toBe('"SRL Alfa x · FinFlow Documente" <noreply@finflow.best>');
  });
  it("fără EMAIL_FROM valid, cade pe domeniul FinFlow", () => {
    expect(senderAddress("")).toBe("noreply@finflow.best");
    expect(senderAddress("gunoi")).toBe("noreply@finflow.best");
  });
});

describe("corpul e-mailului", () => {
  it("[blocant] are butonul spre pagina actului și textul escapat", () => {
    const html = documentEmailHtml({
      message: "Bună ziua,\n\nVă trimit <oferta>.",
      orgName: "ATIC",
      docLabel: "Ofertă, nr. OF-1",
      viewUrl: "https://www.finflow.best/#/act/abc",
      buttonLabel: "Vezi și acceptă oferta",
    });
    expect(html).toContain('href="https://www.finflow.best/#/act/abc"');
    expect(html).toContain("Vezi și acceptă oferta");
    expect(html).toContain("&lt;oferta&gt;");
    expect(html).not.toContain("<oferta>");
    expect(html).toContain("Trimis prin FinFlow în numele ATIC");
  });
});
