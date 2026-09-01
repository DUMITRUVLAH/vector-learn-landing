/**
 * @vitest-environment node
 *
 * SEC — mesajul intern nu pleacă la client în producție.
 */
import { describe, it, expect } from "vitest";
import { publicErrorMessage, GENERIC_ERROR } from "../lib/publicError";

const LEAKY = 'duplicate key value violates unique constraint "par_requests_request_no_uniq"';

describe("SEC — corpul erorii servite clientului", () => {
  it("[blocant] în producție nu scapă numele constrângerii de bază de date", () => {
    expect(publicErrorMessage(LEAKY, { NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(GENERIC_ERROR);
  });

  it("[blocant] pe Vercel (fără NODE_ENV) tot nu scapă", () => {
    expect(publicErrorMessage(LEAKY, { VERCEL: "1" } as unknown as NodeJS.ProcessEnv)).toBe(GENERIC_ERROR);
  });

  it("în dezvoltare mesajul rămâne la vedere, ca depanarea să fie rapidă", () => {
    expect(publicErrorMessage(LEAKY, { NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe(LEAKY);
  });
});
