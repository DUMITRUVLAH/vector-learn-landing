/**
 * „Dată din trecut" pe o cerere de plată (owner, 2026-08-29).
 *
 * Scenariile care contează sunt cele în care ne-am putea înșela: fusul orar (o depunere
 * noaptea NU e o cerere retroactivă) și ziua exactă a depunerii, nu ziua de azi, pentru o
 * cerere deja trimisă — altfel orice cerere veche ar apărea „retroactivă" la fiecare
 * deschidere a paginii.
 */
import { describe, it, expect } from "vitest";
import { backdatedDays, isBackdated, backdatedLabel } from "../backdated";

describe("backdatedDays", () => {
  it("[blocant] o cerere datată în urmă față de ziua depunerii e semnalată, cu numărul de zile", () => {
    expect(backdatedDays("2026-07-30T00:00:00.000Z", "2026-08-29T09:00:00.000Z")).toBe(30);
    expect(isBackdated("2026-07-30T00:00:00.000Z", "2026-08-29T09:00:00.000Z")).toBe(true);
  });

  it("aceeași zi sau o dată în viitor nu e retroactivă", () => {
    expect(backdatedDays("2026-08-29T00:00:00.000Z", "2026-08-29T18:00:00.000Z")).toBe(0);
    expect(backdatedDays("2026-09-05T00:00:00.000Z", "2026-08-29T18:00:00.000Z")).toBe(0);
  });

  it("[blocant] o depunere noaptea (UTC+3) NU inventează o zi de decalaj", () => {
    // 01:00 la Chișinău pe 29.08 = 22:00 UTC pe 28.08. Fără reducerea la ziua UTC a ambelor
    // capete, cererea datată 29.08 ar apărea „retroactivă cu 1 zi" chiar în ziua scrierii ei.
    expect(backdatedDays("2026-08-29T00:00:00.000Z", "2026-08-28T22:00:00.000Z")).toBe(0);
  });

  it("pentru o cerere deja depusă se compară cu ziua depunerii, nu cu ziua de azi", () => {
    const acum = new Date("2026-12-01T10:00:00.000Z");
    // Cerere din august, datată și depusă în aceeași zi: deschisă în decembrie, rămâne curată.
    expect(backdatedDays("2026-08-10T00:00:00.000Z", "2026-08-10T12:00:00.000Z", acum)).toBe(0);
  });

  it("o ciornă fără dată de depunere se compară cu ziua curentă", () => {
    const acum = new Date("2026-08-29T10:00:00.000Z");
    expect(backdatedDays("2026-08-27T00:00:00.000Z", null, acum)).toBe(2);
  });

  it("date lipsă sau invalide nu semnalează nimic", () => {
    expect(backdatedDays(null, "2026-08-29T00:00:00.000Z")).toBe(0);
    expect(backdatedDays("nu-e-o-dată", "2026-08-29T00:00:00.000Z")).toBe(0);
  });

  it("eticheta acordă singularul cu pluralul", () => {
    expect(backdatedLabel(1)).toBe("Dată retroactivă · 1 zi");
    expect(backdatedLabel(4)).toBe("Dată retroactivă · 4 zile");
    expect(backdatedLabel(0)).toBe("");
  });
});
