/**
 * PERF-005 — cache-ul de sesiune nu are voie să supraviețuiască unei revocări.
 *
 * Cache-ul taie 2 din 3 dus-întorsuri la DB pe fiecare cerere autentificată, dar introduce o
 * întrebare de securitate: cât timp mai e acceptată o sesiune ștearsă? Răspunsul trebuie să fie
 * „zero pentru revocările explicite" — logout, deconectarea unui dispozitiv, resetarea parolei.
 * Testele de aici blochează exact asta; dacă cineva scoate un `dropCachedSession`, pică.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const findFirstSession = vi.fn();
const findFirstUser = vi.fn();
const deleteWhere = vi.fn().mockResolvedValue(undefined);
const updateWhere = vi.fn().mockResolvedValue(undefined);

vi.mock("../db/client", () => ({
  db: {
    query: {
      sessions: { findFirst: (...a: unknown[]) => findFirstSession(...a) },
      users: { findFirst: (...a: unknown[]) => findFirstUser(...a) },
    },
    delete: () => ({ where: deleteWhere }),
    update: () => ({ set: () => ({ where: updateWhere }) }),
  },
}));

const { getSessionUser, revokeSession, dropAllCachedSessions } = await import("../auth/session");

const FUTURE = new Date(Date.now() + 86_400_000);
const SESSION = { id: "s1", userId: "u1", token: "tok", expiresAt: FUTURE, twoFactorPending: false };
const USER = { id: "u1", email: "ana@example.org", isActive: true };

beforeEach(() => {
  dropAllCachedSessions();
  findFirstSession.mockReset().mockResolvedValue(SESSION);
  findFirstUser.mockReset().mockResolvedValue(USER);
  deleteWhere.mockClear();
});

describe("PERF-005 — cache de sesiune", () => {
  it("a doua cerere cu același token NU mai interoghează baza de date", async () => {
    await getSessionUser("tok");
    await getSessionUser("tok");

    // Fără cache ar fi 2 SELECT pe sessions + 2 pe users = 4 interogări pentru 2 cereri.
    expect(findFirstSession).toHaveBeenCalledTimes(1);
    expect(findFirstUser).toHaveBeenCalledTimes(1);
  });

  it("token-uri diferite nu se contaminează reciproc", async () => {
    findFirstSession.mockResolvedValueOnce(SESSION);
    await getSessionUser("tok");

    findFirstSession.mockResolvedValueOnce({ ...SESSION, id: "s2", userId: "u2", token: "alt" });
    findFirstUser.mockResolvedValueOnce({ ...USER, id: "u2", email: "mihai@example.org" });
    const other = await getSessionUser("alt");

    expect(other?.user.id).toBe("u2");
  });

  it("revokeSession invalidează cache-ul IMEDIAT (logout chiar deconectează)", async () => {
    await getSessionUser("tok");
    expect(findFirstSession).toHaveBeenCalledTimes(1);

    await revokeSession("tok");

    // După revocare, sesiunea nu mai există în DB — iar cache-ul nu are voie s-o mai servească.
    findFirstSession.mockResolvedValue(undefined);
    const after = await getSessionUser("tok");

    expect(after).toBeNull();
    expect(findFirstSession).toHaveBeenCalledTimes(2); // a mers din nou la DB, n-a citit din cache
  });

  it("dropAllCachedSessions invalidează tot (resetare de parolă / revocare în masă)", async () => {
    await getSessionUser("tok");
    dropAllCachedSessions();

    findFirstSession.mockResolvedValue(undefined);
    expect(await getSessionUser("tok")).toBeNull();
  });

  it("o sesiune EXPIRATĂ nu intră în cache și e ștearsă", async () => {
    findFirstSession.mockResolvedValue({ ...SESSION, expiresAt: new Date(Date.now() - 1000) });

    expect(await getSessionUser("tok")).toBeNull();
    expect(deleteWhere).toHaveBeenCalled();

    // Și a doua oară trebuie să fie null — nu cumva servită dintr-un cache scris din greșeală.
    expect(await getSessionUser("tok")).toBeNull();
  });

  it("o sesiune cu 2FA în așteptare nu e acceptată și nu e cache-uită", async () => {
    findFirstSession.mockResolvedValue({ ...SESSION, twoFactorPending: true });
    expect(await getSessionUser("tok")).toBeNull();
    expect(await getSessionUser("tok")).toBeNull();
  });
});
