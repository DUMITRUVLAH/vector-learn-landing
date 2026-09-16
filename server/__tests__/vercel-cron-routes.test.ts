/**
 * @vitest-environment node
 *
 * Fiecare cron din `vercel.json` trebuie să AJUNGĂ la handlerul lui.
 *
 * Incidentul (16.09.2026): `/api/par/cron/approval-digest` a fost montat sub
 * `app.use("/api/par/*", requireAuth)`. Vercel Cron nu are cookie de sesiune, deci fiecare lovitură
 * de la 09:00 și 16:00 a primit 401 `unauthenticated` înainte de orice verificare de `CRON_SECRET`.
 * Digestul n-a plecat niciodată — iar VM5-13 tocmai tăiase emailurile per-cerere în favoarea lui,
 * așa că aprobatorii au rămas fără notificări pe email timp de trei zile, fără nicio eroare vizibilă.
 *
 * Testul lovește RUTELE REALE din `server/app.ts` (nu o copie a lor) pe căile REALE din
 * `vercel.json`, fără antet de autorizare, și cere ca răspunsul să vină de la handlerul de cron:
 *   • 401 `unauthorized`      → am ajuns la handler, secretul e greșit/lipsă — corect;
 *   • 503 `cron_not_configured` → am ajuns la handler, `CRON_SECRET` nu e setat — corect;
 *   • 401 `unauthenticated` / `invalid_session` → ne-a tăiat `requireAuth`. ASTA e bug-ul.
 * Un 404 `route_not_found` prinde a doua față a aceleiași greșeli: o cale din `vercel.json` care
 * nu corespunde niciunei rute montate.
 */
import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { DIGEST_HOURS, inDigestWindow } from "../services/par/digestRunner";

// Rutele se montează la import; nicio cerere din testul ăsta nu trece de poarta de autorizare,
// deci baza de date nu e atinsă. Stub-ul ține importul lui `server/app.ts` fără PGlite/Postgres.
vi.mock("../db/client", () => ({
  db: new Proxy({}, { get: () => () => { throw new Error("DB neașteptat într-un test de rutare"); } }),
  closeDb: async () => {},
}));

const CRON_PATHS: string[] = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../vercel.json"), "utf8")
).crons.map((c: { path: string }) => c.path);

/** Răspunsurile care dovedesc că cererea a ajuns la handlerul de cron. */
const REACHED_HANDLER = ["unauthorized", "cron_not_configured"];
/** Răspunsurile care dovedesc că a tăiat-o poarta de sesiune înainte de handler. */
const SESSION_GATE = ["unauthenticated", "invalid_session", "account_disabled"];

describe("crons din vercel.json", () => {
  it("are cel puțin un cron de verificat", () => {
    expect(CRON_PATHS.length).toBeGreaterThan(0);
  });

  it.each(CRON_PATHS)("%s ajunge la handlerul lui, nu la requireAuth", async (cronPath) => {
    const { default: app } = await import("../app");
    const res = await app.request(`https://finflow.best${cronPath}`);
    const body = (await res.json().catch(() => ({}))) as { error?: string };

    expect(
      SESSION_GATE.includes(body.error ?? ""),
      `${cronPath} e tăiat de poarta de sesiune (${body.error}) — Vercel Cron nu are cookie, ` +
        `deci mută ruta în afara prefixului păzit cu requireAuth.`
    ).toBe(false);
    expect(body.error, `${cronPath} nu corespunde niciunei rute montate`).not.toBe("route_not_found");
    expect(
      REACHED_HANDLER.includes(body.error ?? ""),
      `${cronPath} a răspuns ${res.status} ${JSON.stringify(body)} — așteptam refuzul ` +
        `handlerului de cron (CRON_SECRET), semn că cererea a ajuns până la el.`
    ).toBe(true);
  });
});

/**
 * A doua față a aceleiași greșeli: ruta e corectă, dar cronul lovește lângă fereastră.
 *
 * `digestRunner.inDigestWindow` acceptă doar orele LOCALE 09:00 și 16:00 (Europe/Chișinău), iar
 * Vercel Cron programează în UTC. Un cron fixat pe orele care ies bine vara (06:00 → 09:00,
 * 13:00 → 16:00) cade lângă fereastră iarna, când Moldova trece pe UTC+2: 06:00 UTC devine 08:00
 * local, 13:00 UTC devine 15:00, ambele respinse — digestul s-ar opri singur pe 25.10.2026, la fel
 * de tăcut ca incidentul pe care testul de mai sus îl apără.
 *
 * Testul verifică pe zile reale de o parte și de alta a schimbării de oră, nu pe un offset presupus.
 */
describe("fereastra digestului peste schimbarea de oră", () => {
  const CRONS: { path: string; schedule: string }[] = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../vercel.json"), "utf8")
  ).crons;
  const digestHoursUtc = CRONS.filter((c) => c.path.includes("par-digest")).flatMap((c) => {
    const field = c.schedule.split(" ")[1];
    return field === "*" ? Array.from({ length: 24 }, (_, h) => h) : field.split(",").map(Number);
  });

  it("cronul de digest e programat în vercel.json", () => {
    expect(digestHoursUtc.length).toBeGreaterThan(0);
  });

  /**
   * Contul e pe planul Hobby, unde intervalul minim al unui cron e O DATĂ PE ZI. Un `"0 * * * *"`
   * nu produce o eroare de rulare, ci un deployment RESPINS la validare: niciun deployment în
   * listă, doar un status roșu pe commit — și `main` nu se mai deployează deloc până la revenire
   * (pățit pe f63da728, 16.09.2026). Deci minutul și ora trebuie să fie FIXE, nu joker.
   */
  it.each(CRONS.map((c) => [c.path, c.schedule]))(
    "%s (%s) e un cron zilnic — planul Hobby refuză sub-zilnic",
    (cronPath, schedule) => {
      const [minute, hour] = schedule.split(" ");
      expect(minute, `${cronPath}: minutul trebuie fixat, nu ${minute}`).toMatch(/^\d+$/);
      expect(hour, `${cronPath}: ora trebuie fixată, nu ${hour} — sub-zilnic pică deployment-ul`)
        .toMatch(/^\d+$/);
    }
  );

  // Vara (EEST, UTC+3) și iarna (EET, UTC+2) — zile reale, de o parte și de alta a lui 25.10.2026.
  it.each([
    ["oră de vară", "2026-09-17"],
    ["oră de iarnă", "2026-11-03"],
  ])("%s: fiecare fereastră locală e acoperită de o lovitură de cron", (_label, day) => {
    for (const localHour of DIGEST_HOURS) {
      const covered = digestHoursUtc.some((utcHour) =>
        inDigestWindow(new Date(`${day}T${String(utcHour).padStart(2, "0")}:00:00Z`))
      );
      expect(
        covered,
        `nicio intrare de cron din vercel.json nu cade în fereastra locală de ${localHour}:00 pe ${day} — ` +
          `digestul s-ar opri în tăcere. Orele UTC programate: ${digestHoursUtc.join(", ")}.`
      ).toBe(true);
    }
  });
});
