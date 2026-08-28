/**
 * De ce vine eroarea — traducerea motivului în text pentru om.
 *
 * Regresia pe care o închide (incident 2026-08-28): linkul din emailul „ready for payment"
 * deschis într-o sesiune logată în alt workspace afișa `not_found`, fără nicio explicație.
 * Testele cer ca fiecare motiv să producă o propoziție care spune CE s-a întâmplat și CU CE cont.
 */
import { describe, it, expect } from "vitest";
import { parAccessMessage } from "../accessMessage";

describe("parAccessMessage", () => {
  it("[blocant] altă organizație, fără cont acolo → spune că e alt workspace + cu ce cont ești", () => {
    const m = parAccessMessage({
      reason: "other_workspace_no_account",
      currentEmail: "vlah.business@gmail.com",
      currentWorkspace: "Vlah Dumitru",
    });
    expect(m.title).toContain("alt");
    expect(m.detail).toContain("alt workspace");
    expect(m.detail).toContain("vlah.business@gmail.com");
    expect(m.detail).toContain("Vlah Dumitru");
    // Nu divulgăm numele workspace-ului care deține cererea când nu ai cont acolo.
    expect(m.detail).not.toContain("ATIC");
    expect(m.suggestsRelogin).toBe(true);
  });

  it("[blocant] ai cont cu același email în workspace-ul cererii → îi spunem numele", () => {
    const m = parAccessMessage({
      reason: "other_workspace",
      workspace: "ATIC",
      currentEmail: "vlahdumitru@gmail.com",
      currentWorkspace: "Vector",
    });
    expect(m.detail).toContain("ATIC");
    expect(m.detail).toContain("Vector");
    expect(m.suggestsRelogin).toBe(true);
  });

  it("[normal] motivele de drepturi nu sugerează re-autentificarea", () => {
    for (const reason of ["not_requestor", "draft_private", "out_of_scope", "module_disabled", "unknown_id"]) {
      const m = parAccessMessage({ reason, currentEmail: "a@b.md", currentWorkspace: "ATIC" });
      expect(m.suggestsRelogin).toBe(false);
      expect(m.detail.length).toBeGreaterThan(20);
      expect(m.detail).not.toContain(reason); // text pentru om, nu codul brut
    }
  });

  it("[normal] ciorna altcuiva explică regula, nu doar refuzul", () => {
    const m = parAccessMessage({ reason: "draft_private", currentEmail: "a@b.md", currentWorkspace: "ATIC" });
    expect(m.detail).toContain("ciornă");
  });

  it("[normal] fără motiv (server vechi) → mesaj generic, fără să crape", () => {
    expect(parAccessMessage(null).title).toBeTruthy();
    expect(parAccessMessage({}).title).toBeTruthy();
    expect(parAccessMessage({ reason: "cine_stie_ce" }).title).toBeTruthy();
  });

  it("[normal] fără context de cont, mesajul rămâne o propoziție curată", () => {
    const m = parAccessMessage({ reason: "other_workspace_no_account" });
    expect(m.detail).not.toContain("undefined");
    expect(m.detail).not.toContain("  ");
  });
});
