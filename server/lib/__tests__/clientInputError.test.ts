import { describe, expect, it } from "vitest";
import { HTTPException } from "hono/http-exception";
import { classifyClientError } from "../clientInputError";

// Regresia pentru cele 287 de scenarii CRM care dădeau 500 pe input greșit (26.09.2026):
// app.onError trata orice excepție drept pană de server. Vezi lib/clientInputError.ts.
describe("classifyClientError", () => {
  it("JSON stricat / corp gol (HTTPException 400 a validatorului) → 400, nu 500", () => {
    const err = new HTTPException(400, { message: "Malformed JSON in request body" });
    expect(classifyClientError(err, true)).toEqual({ status: 400, error: "invalid_body" });
  });

  it("alte HTTPException 4xx își păstrează statusul", () => {
    expect(classifyClientError(new HTTPException(401, { message: "unauthenticated" }), false)?.status).toBe(401);
  });

  it("un HTTPException 5xx rămâne eroare de server", () => {
    expect(classifyClientError(new HTTPException(503, { message: "down" }), false)).toBeNull();
  });

  it("SyntaxError e a clientului doar dacă cererea a trimis JSON", () => {
    expect(classifyClientError(new SyntaxError("Unexpected token"), true)?.status).toBe(400);
    // Un JSON.parse stricat pe date din bază, într-un GET, e bug de server.
    expect(classifyClientError(new SyntaxError("Unexpected token"), false)).toBeNull();
  });

  it("id care nu e uuid (Postgres 22P02, inclusiv împachetat în cause) → 400", () => {
    expect(classifyClientError(Object.assign(new Error("x"), { code: "22P02" }), false)?.status).toBe(400);
    const wrapped = new Error("query failed", { cause: Object.assign(new Error("x"), { code: "22P02" }) });
    expect(classifyClientError(wrapped, false)?.status).toBe(400);
  });

  it("PGlite fără cod: se recunoaște după mesaj", () => {
    expect(classifyClientError(new Error('invalid input syntax for type uuid: "abc"'), false)?.status).toBe(400);
    expect(classifyClientError(new Error('invalid byte sequence for encoding "UTF8": 0x00'), true)?.status).toBe(400);
  });

  it("valoare de enum invalidă (tot 22P02) e pană de schemă, nu input — rămâne 500", () => {
    const err = Object.assign(new Error('invalid input value for enum interaction_type: "telegram"'), { code: "22P02" });
    expect(classifyClientError(err, false)).toBeNull();
  });

  it("bug-urile reale de bază rămân 500 (constrângeri, coloane lipsă)", () => {
    expect(classifyClientError(Object.assign(new Error("dup"), { code: "23505" }), true)).toBeNull();
    expect(classifyClientError(new Error('column "x" does not exist'), false)).toBeNull();
    expect(classifyClientError(new TypeError("Cannot read properties of undefined"), true)).toBeNull();
  });
});
