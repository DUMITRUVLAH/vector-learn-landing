/**
 * PARVERIFY-001 — codurile tipărite pe formularul PAR.
 *
 * Ce apără testele de aici: pe hârtie codul e singura dovadă că aprobarea există în platformă.
 * Dacă e instabil între două tipăriri, auditul primește două documente contradictorii; dacă nu se
 * schimbă când se schimbă aprobarea, nu dovedește nimic.
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  signatureCode,
  signatureCodeMatches,
  stateFingerprint,
  newVerifyToken,
  formatToken,
  normalizeToken,
  verifyUrl,
} from "../verifyCodes";

const APPROVAL = {
  parId: "11111111-1111-1111-1111-111111111111",
  approvalId: "22222222-2222-2222-2222-222222222222",
  step: 1,
  decision: "approved",
  decidedAt: "2026-09-11T09:24:00.000Z",
};

beforeAll(() => {
  process.env.PAR_SIGN_SECRET = "secret-de-test";
});

describe("signatureCode", () => {
  it("dă același cod la fiecare tipărire a aceleiași aprobări", () => {
    expect(signatureCode(APPROVAL)).toBe(signatureCode(APPROVAL));
  });

  it("are forma tipăribilă XXXX-XXXX, fără caractere care se confundă la citit", () => {
    const code = signatureCode(APPROVAL)!;
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(code).not.toMatch(/[ILOU]/);
  });

  it("rămâne gol pe un rând nedecis — un cod ar arăta ca o aprobare dată", () => {
    expect(signatureCode({ ...APPROVAL, decision: "pending", decidedAt: null })).toBeNull();
    expect(signatureCode({ ...APPROVAL, decision: "rejected" })).toBeNull();
  });

  it("se schimbă dacă cineva mută data aprobării", () => {
    const moved = signatureCode({ ...APPROVAL, decidedAt: "2026-09-11T09:25:00.000Z" });
    expect(moved).not.toBe(signatureCode(APPROVAL));
  });

  it("diferă între două cereri care au același rând de aprobare", () => {
    const other = signatureCode({ ...APPROVAL, parId: "33333333-3333-3333-3333-333333333333" });
    expect(other).not.toBe(signatureCode(APPROVAL));
  });

  it("acceptă codul tipărit indiferent de cratime și de litere mici", () => {
    const code = signatureCode(APPROVAL)!;
    expect(signatureCodeMatches(APPROVAL, code)).toBe(true);
    expect(signatureCodeMatches(APPROVAL, code.replace("-", "").toLowerCase())).toBe(true);
    expect(signatureCodeMatches(APPROVAL, "0000-0000")).toBe(false);
  });

  it("nu se poate calcula fără secret — alt secret, alt cod", () => {
    const withTestSecret = signatureCode(APPROVAL);
    process.env.PAR_SIGN_SECRET = "alt-secret";
    const withOtherSecret = signatureCode(APPROVAL);
    process.env.PAR_SIGN_SECRET = "secret-de-test";
    expect(withOtherSecret).not.toBe(withTestSecret);
  });
});

const STATE = {
  requestNo: "PAR-2026-0142",
  status: "approved",
  currency: "MDL",
  totalEstimatedCents: 700000,
  lineItems: [{ description: "Servicii de training", quantity: 1, lineTotalCents: 700000 }],
  signatures: [
    { id: "b", decision: "approved", decidedAt: "2026-09-11T09:24:00.000Z", name: "Ana Chirița" },
    { id: "a", decision: "pending", decidedAt: null, name: "Irina Oriol" },
  ],
};

describe("stateFingerprint", () => {
  it("nu depinde de ordinea în care baza de date întoarce aprobările", () => {
    const reordered = { ...STATE, signatures: [...STATE.signatures].reverse() };
    expect(stateFingerprint(reordered)).toBe(stateFingerprint(STATE));
  });

  it("se schimbă când se mai dă o aprobare — asta e tot rostul avertismentului de versiune", () => {
    const signed = {
      ...STATE,
      signatures: [
        STATE.signatures[0],
        { id: "a", decision: "approved", decidedAt: "2026-09-12T08:00:00.000Z", name: "Irina Oriol" },
      ],
    };
    expect(stateFingerprint(signed)).not.toBe(stateFingerprint(STATE));
  });

  it("se schimbă când se schimbă suma sau liniile", () => {
    expect(stateFingerprint({ ...STATE, totalEstimatedCents: 700001 })).not.toBe(stateFingerprint(STATE));
    expect(
      stateFingerprint({
        ...STATE,
        lineItems: [{ description: "Altceva", quantity: 1, lineTotalCents: 700000 }],
      })
    ).not.toBe(stateFingerprint(STATE));
  });
});

describe("tokenul din QR", () => {
  it("are 16 caractere din alfabetul tipăribil", () => {
    for (let i = 0; i < 200; i++) {
      expect(newVerifyToken()).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
    }
  });

  it("nu se repetă", () => {
    const seen = new Set(Array.from({ length: 500 }, () => newVerifyToken()));
    expect(seen.size).toBe(500);
  });

  it("se tipărește în grupe de patru și se citește înapoi oricum ar fi tastat", () => {
    const token = newVerifyToken();
    expect(formatToken(token)).toMatch(/^.{4}-.{4}-.{4}-.{4}$/);
    expect(normalizeToken(formatToken(token))).toBe(token);
    expect(normalizeToken(formatToken(token).toLowerCase())).toBe(token);
    expect(normalizeToken(` ${formatToken(token)} `)).toBe(token);
  });

  it("respinge ce nu poate fi un token, ca ruta publică să nu ajungă la baza de date degeaba", () => {
    expect(normalizeToken("prea-scurt")).toBeNull();
    expect(normalizeToken("A".repeat(17))).toBeNull();
    // I, L, O și U nu sunt în alfabet tocmai ca să nu fie confundate la tastat.
    expect(normalizeToken("IIIIIIIIIIIIIIII")).toBeNull();
  });
});

describe("verifyUrl", () => {
  it("pune tokenul în fragment, nu în calea trimisă serverului", () => {
    process.env.APP_URL = "https://www.finflow.best";
    const url = verifyUrl("K7M29QD43F8BX2NV", "3F9K2D7B");
    expect(url).toBe("https://www.finflow.best/#/verificare/par/K7M29QD43F8BX2NV/3F9K2D7B");
    expect(url.split("#")[0]).not.toContain("K7M2");
  });

  it("nu dublează bara când APP_URL se termină cu una", () => {
    process.env.APP_URL = "https://www.finflow.best/";
    expect(verifyUrl("K7M29QD43F8BX2NV", "3F9K2D7B")).toBe(
      "https://www.finflow.best/#/verificare/par/K7M29QD43F8BX2NV/3F9K2D7B"
    );
  });
});
