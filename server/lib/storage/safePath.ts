/**
 * Validarea unei căi de obiect din storage primite de la client.
 *
 * SECURITY (audit 2026-08-29): singura gardă era `path.startsWith(tenantId + "/")`, iar calea
 * ajungea concatenată într-un URL semnat/service-role. Normalizarea de URL colapsează `..`
 * ÎNAINTE ca cererea să plece, deci `"<tenant A>/../<tenant B>/factura.pdf"` trecea prefixul și
 * citea obiectul lui B. Un prefix nu e o cale sigură: forma trebuie impusă, nu presupusă.
 *
 * Forma acceptată: `<uuid-ul tenantului>/<nume de fișier simplu>`, unde numele conține doar
 * litere, cifre, punct, minus, underscore și spațiu. Fără segmente în plus, fără `..`, fără
 * bară inversă, fără caractere de control.
 */
const SEGMENT = /^[A-Za-z0-9._ -]+$/;

export function isSafeTenantObjectPath(path: string, tenantId: string): boolean {
  if (!path || path.length > 512) return false;
  if (path.includes("\\") || path.includes("\u0000")) return false;
  const parts = path.split("/");
  if (parts.length !== 2) return false;
  const [prefix, name] = parts;
  if (prefix !== tenantId) return false;
  if (!SEGMENT.test(name)) return false;
  if (name === "." || name === "..") return false;
  return true;
}
