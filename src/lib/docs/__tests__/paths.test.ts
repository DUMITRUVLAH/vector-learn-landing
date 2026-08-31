/**
 * DC-101 — regresia mutării modulului.
 *
 * Testul care ar fi prins bug-ul clasic: pagina taie un prefix fix din cale, ruta se mută, iar
 * fișa deschide „id gol" → 404 pe orice act, cu testele verzi pe ruta moartă (CLAUDE.md §3.5.1quater).
 * De aceea fiecare aserțiune rulează pe AMBELE rute: cea nouă și cea veche, încă redirecționată.
 */
import { describe, it, expect } from "vitest";
import {
  DOCS_BASE,
  docPath,
  docsNewPath,
  docsTemplatesPath,
  docsProjectDossierPath,
  docsCounterpartyDossierPath,
  documentIdFromPath,
  dossierTargetFromPath,
  migrateLegacyDocsPath,
} from "../paths";

describe("căile modulului de documente", () => {
  it("trăiesc sub PAR, ca meniul din stânga să nu se schimbe", () => {
    expect(DOCS_BASE).toBe("/business/par/documente");
    expect(docPath("abc")).toBe("/business/par/documente/abc");
    expect(docsNewPath()).toBe("/business/par/documente/nou");
    expect(docsTemplatesPath()).toBe("/business/par/documente/sabloane");
  });

  it("citește id-ul actului pe ruta nouă ȘI pe cea veche", () => {
    expect(documentIdFromPath("/business/par/documente/4f3c-9a")).toBe("4f3c-9a");
    expect(documentIdFromPath("/business/docs/4f3c-9a")).toBe("4f3c-9a");
    expect(documentIdFromPath("/business/par/documente/4f3c-9a?tab=jurnal")).toBe("4f3c-9a");
  });

  it("nu confundă subpaginile cu un id de act", () => {
    expect(documentIdFromPath("/business/par/documente")).toBeNull();
    expect(documentIdFromPath(docsNewPath())).toBeNull();
    expect(documentIdFromPath(docsTemplatesPath())).toBeNull();
    expect(documentIdFromPath("/business/docs/templates")).toBeNull();
    expect(documentIdFromPath(docsProjectDossierPath("p1"))).toBeNull();
    expect(documentIdFromPath(docsCounterpartyDossierPath("v1"))).toBeNull();
  });

  it("citește ținta dosarului pe ambele rute", () => {
    expect(dossierTargetFromPath(docsProjectDossierPath("p1"))).toEqual({ kind: "project", id: "p1" });
    expect(dossierTargetFromPath("/business/docs/proiect/p1")).toEqual({ kind: "project", id: "p1" });
    expect(dossierTargetFromPath(docsCounterpartyDossierPath("v1"))).toEqual({
      kind: "counterparty",
      id: "v1",
    });
    expect(dossierTargetFromPath("/business/docs/contraparte/v1")).toEqual({
      kind: "counterparty",
      id: "v1",
    });
    expect(dossierTargetFromPath("/business/par/documente/abc")).toBeNull();
  });

  it("linkurile vechi ajung unde trebuie, cu tot cu filtre", () => {
    expect(migrateLegacyDocsPath("/business/docs")).toBe("/business/par/documente");
    expect(migrateLegacyDocsPath("/business/docs?kind=contract_servicii")).toBe(
      "/business/par/documente?kind=contract_servicii"
    );
    expect(migrateLegacyDocsPath("/business/docs/nou")).toBe("/business/par/documente/nou");
    expect(migrateLegacyDocsPath("/business/docs/templates")).toBe("/business/par/documente/sabloane");
    expect(migrateLegacyDocsPath("/business/docs/4f3c-9a")).toBe("/business/par/documente/4f3c-9a");
    expect(migrateLegacyDocsPath("/business/docs/proiect/p1")).toBe(
      "/business/par/documente/proiect/p1"
    );
  });
});
