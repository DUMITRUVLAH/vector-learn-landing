/**
 * SEC — ce are voie să afle clientul despre o excepție.
 *
 * `app.onError` întorcea `err.message` direct. Mesajele reale conțin nume de constrângeri, căi de
 * fișiere și fragmente de SQL: pentru cine caută o breșă, e o hartă gratuită. În producție întoarcem
 * un cod generic; mesajul complet rămâne în log și în Consola Platformă, unde îl vedem oricum.
 *
 * În dezvoltare și în teste mesajul rămâne la vedere — altfel depanarea ar deveni ghicit.
 */

/** Codul generic servit în producție. */
export const GENERIC_ERROR = "internal_error";

export function isProductionRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production" || !!env.VERCEL;
}

export function publicErrorMessage(
  message: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  return isProductionRuntime(env) ? GENERIC_ERROR : message;
}
