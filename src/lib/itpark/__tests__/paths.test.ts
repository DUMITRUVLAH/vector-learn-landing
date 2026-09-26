/**
 * NAV-08 — id-ul dosarului IT Park se citește fără prefix.
 *
 * Bugul: fiecare pagină IT Park căuta `/^\/app\/fin\/itpark\/<id>/`, dar modulul trăiește pe
 * `/business/fin/itpark`. Id-ul ieșea "" → fișa rămânea pe spinner pentru totdeauna.
 */
import { describe, it, expect } from "vitest";
import { itparkIdFromPath, itparkPath, itparkSubPath, ITPARK_BASE } from "../paths";

const ID = "3f1c2a9e-1b2c-4d5e-8f90-123456789abc";

describe("itparkIdFromPath", () => {
  it("[blocant] citește id-ul pe ruta /business (unde prefixul vechi dădea gol)", () => {
    expect(itparkIdFromPath(`/business/fin/itpark/${ID}`)).toBe(ID);
    expect(itparkIdFromPath(`/business/fin/itpark/${ID}/anexa3`)).toBe(ID);
    expect(itparkIdFromPath(`/business/fin/itpark/${ID}/scrisori?tab=2`)).toBe(ID);
  });

  it("[normal] merge și pe linkurile vechi /app, trimise pe email", () => {
    expect(itparkIdFromPath(`/app/fin/itpark/${ID}/anexa2`)).toBe(ID);
  });

  it("[blocant] lista, asistentul și panoul nu sunt dosare", () => {
    expect(itparkIdFromPath(ITPARK_BASE)).toBe("");
    expect(itparkIdFromPath(`${ITPARK_BASE}/new`)).toBe("");
    expect(itparkIdFromPath(`${ITPARK_BASE}/dashboard`)).toBe("");
  });

  it("[normal] căile construite se citesc înapoi", () => {
    expect(itparkIdFromPath(itparkPath(ID))).toBe(ID);
    expect(itparkIdFromPath(itparkSubPath(ID, "declaratie"))).toBe(ID);
  });
});
