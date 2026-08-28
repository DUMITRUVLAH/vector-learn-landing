import type { MiddlewareHandler } from "hono";

/**
 * Plafon dur de timp pentru CITIRI (`GET /api/*`).
 *
 * De ce există (măsurat pe prod, 2026-08-28): sub concurență, ~4 din 50 de invocări porneau
 * (`<-- GET …` apare în log) și **nu mai răspundeau NICIODATĂ** — Vercel le închidea cu 504
 * FUNCTION_INVOCATION_TIMEOUT. Niciun răspuns reușit nu depășea 3 s: comportamentul e binar,
 * ori rapid, ori pe veci. Cauza e o interogare al cărei răspuns nu mai vine (socket mort către
 * pooler-ul Supabase), nu o interogare lentă — `statement_timeout` al bazei e 2 min și pooler-ul
 * în mod tranzacție îl ignoră oricum la conectare, deci baza nu ne poate salva.
 *
 * Efectul în interfață era exact ce a raportat owner-ul: toate cererile în zbor ale unui tab
 * (`/api/par/finance`, `/api/notifications`, `/api/platform/workspaces`) rămâneau agățate simultan.
 *
 * Plafonul transformă „niciodată" într-un 503 pe care clientul îl poate trata și reîncerca.
 *
 * Doar GET: o citire care durează peste 20 s e sigur ruptă, dar mutațiile (extragere AI, generare
 * PDF, import e-Factura) pot dura legitim minute — tăiate la mijloc ar lăsa date pe jumătate scrise.
 * 20 s stă sub limita de 30 s a clientului (`GET_TIMEOUT_MS`), deci utilizatorul primește un cod de
 * eroare adevărat în loc de un abort orb.
 */
export const API_GET_TIMEOUT_MS = Number(process.env.API_GET_TIMEOUT_MS ?? 20_000);

export const getTimeout: MiddlewareHandler = async (c, next) => {
  if (c.req.method !== "GET") return next();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<Response>((resolve) => {
    timer = setTimeout(
      () =>
        resolve(
          c.json(
            { error: "server_timeout", path: new URL(c.req.url).pathname },
            503,
            // Cererea e idempotentă și eșecul e tranzitoriu — spunem clientului să reîncerce.
            { "Retry-After": "1" }
          )
        ),
      API_GET_TIMEOUT_MS
    );
  });

  const handled = next().then(() => undefined);
  const winner = await Promise.race([handled, expired]);
  clearTimeout(timer);
  // `undefined` = handler-ul a terminat la timp și și-a pus singur răspunsul în `c.res`.
  return winner ?? undefined;
};
