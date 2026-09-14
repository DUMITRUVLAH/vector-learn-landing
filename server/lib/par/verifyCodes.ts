/**
 * Codurile tipărite pe formularul PAR: dovada, pe hârtie, că aprobările există în platformă.
 *
 * De ce există. Ana Chirița (ATIC, 14.09.2026): „am printat PAR, nu se văd aprobările pe el —
 * la signature trebuie să fie cod ceva". Avea dreptate: `parFormPdf.ts` scria numele, funcția și
 * data aprobatorului, dar rubrica `Signature` ieșea GOALĂ prin construcție. Hârtia arăta deci
 * exact la fel indiferent dacă aprobarea fusese dată în platformă sau tastată de cineva într-un
 * Word — un document de audit care nu dovedește nimic.
 *
 * Ce rezolvă modulul. Două coduri, ambele derivate, niciunul stocat:
 *
 *   1. `signatureCode` — un cod scurt per aprobare, care intră fix în rubrica goală. E un HMAC
 *      peste (cerere, rând de aprobare, decizie, momentul deciziei). Schimbi numele sau data pe
 *      hârtie și codul nu mai corespunde cu ce recalculează serverul. Nu se stochează nimic:
 *      aceeași aprobare dă același cod la fiecare retipărire, iar verificarea e un calcul, nu o
 *      interogare.
 *
 *   2. `stateFingerprint` — amprenta stării tipărite (sumă, linii, lanț de aprobări), pusă în
 *      URL-ul din QR. Fiecare exemplar tipărit își poartă astfel propria versiune, deci pagina
 *      publică poate spune nu doar „PAR-ul există", ci „hârtia din mâna ta corespunde cu
 *      înregistrarea" ori „între timp a mai semnat cineva". Fără nicio coloană în plus și fără
 *      istoric de tipăriri — starea de atunci e scrisă pe hârtie, nu în baza de date.
 *
 * Secretul. `PAR_SIGN_SECRET`, altfel `ENCRYPTION_KEY` (deja setată pe Vercel — vezi
 * `server/lib/crypto.ts`), altfel o constantă de dezvoltare. Ordinea asta înseamnă zero
 * configurare nouă în producție. Rotirea secretului schimbă codurile tipărite de acum înainte;
 * hârtiile vechi devin neverificabile — deci se rotește doar dacă secretul chiar s-a scurs.
 */
import { createHmac, randomBytes } from "node:crypto";

/** Constanta de dezvoltare, ca testele să nu ceară variabile de mediu. Vezi `lib/crypto.ts`. */
const DEV_SECRET = "dev-par-sign-secret-do-not-use-in-production";

/**
 * Crockford base32 fără I, L, O și U: alfabetul e citit cu ochiul de pe o hârtie fotocopiată și
 * tastat de mână. „0/O" și „1/I/L" sunt exact perechile pe care oamenii le greșesc, iar U lipsește
 * ca din cod să nu iasă din întâmplare cuvinte urâte.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function secret(): string {
  return process.env.PAR_SIGN_SECRET ?? process.env.ENCRYPTION_KEY ?? DEV_SECRET;
}

/** Primele `chars` caractere base32 ale unui HMAC — 5 biți fiecare. */
function derive(domain: string, payload: string, chars: number): string {
  const mac = createHmac("sha256", secret()).update(`${domain}\n${payload}`).digest();
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of mac) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < chars) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    if (out.length === chars) break;
  }
  return out;
}

/** „3F9K2D7B" → „3F9K-2D7B". Grupele de patru se citesc și se tastează fără să pierzi rândul. */
function group(code: string): string {
  return (code.match(/.{1,4}/g) ?? [code]).join("-");
}

export interface SignatureCodeInput {
  parId: string;
  /** `id`-ul rândului de aprobare — nu pasul: pe un nivel paralel doi oameni au același pas. */
  approvalId: string;
  step: number;
  decision: string;
  decidedAt: Date | string | null;
}

/**
 * Codul care se tipărește în rubrica `Signature`. `null` pentru un rând nedecis: o casetă
 * nesemnată trebuie să rămână goală pe hârtie, altfel codul însuși ar sugera o aprobare.
 *
 * 8 caractere = 40 de biți. Nu e o barieră criptografică de una singură (verificarea reală se
 * face pe server, recalculând), ci face imposibilă nimerirea din întâmplare a unui cod valid
 * pentru o aprobare inventată.
 */
export function signatureCode(input: SignatureCodeInput): string | null {
  if (input.decision !== "approved" || !input.decidedAt) return null;
  const decided = new Date(input.decidedAt);
  if (isNaN(decided.getTime())) return null;
  const payload = [
    input.parId,
    input.approvalId,
    String(input.step),
    input.decision,
    decided.toISOString(),
  ].join("|");
  return group(derive("par-signature-v1", payload, 8));
}

/** Codul recalculat coincide cu cel tipărit? Comparația ignoră cratimele și litera mică. */
export function signatureCodeMatches(input: SignatureCodeInput, printed: string): boolean {
  const expected = signatureCode(input);
  if (!expected) return false;
  const norm = (v: string) => v.replace(/[^0-9a-z]/gi, "").toUpperCase();
  return norm(expected) === norm(printed);
}

export interface FingerprintInput {
  requestNo: string | null;
  status: string;
  currency: string;
  totalEstimatedCents: number;
  lineItems: Array<{ description: string; quantity: number | string; lineTotalCents: number }>;
  signatures: Array<{ id: string; decision: string; decidedAt: Date | string | null; name: string | null }>;
}

/**
 * Amprenta a ceea ce s-a tipărit. Intră DOAR câmpurile pe care le vede omul cu hârtia în mână:
 * suma, liniile, lanțul de aprobări. Un câmp intern care se schimbă singur (de pildă `updatedAt`)
 * ar face ca orice hârtie să pară „depășită" a doua zi, iar avertismentul ar fi ignorat.
 *
 * Rândurile se sortează după `id` înainte de amprentare: ordinea în care le întoarce baza de date
 * nu e garantată, iar o amprentă care depinde de ea ar semnala diferențe inexistente.
 */
export function stateFingerprint(d: FingerprintInput): string {
  const items = d.lineItems
    .map((it) => `${it.description}|${it.quantity}|${it.lineTotalCents}`)
    .join(";");
  const sigs = [...d.signatures]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((s) => {
      const t = s.decidedAt ? new Date(s.decidedAt) : null;
      const iso = t && !isNaN(t.getTime()) ? t.toISOString() : "";
      return `${s.id}|${s.decision}|${iso}|${s.name ?? ""}`;
    })
    .join(";");
  const payload = [
    d.requestNo ?? "",
    d.status,
    d.currency,
    String(d.totalEstimatedCents),
    items,
    sigs,
  ].join("\n");
  return derive("par-state-v1", payload, 8);
}

/**
 * Tokenul din QR: 16 caractere base32 = 80 de biți. Nu se poate enumera și nu se poate ghici,
 * deci ruta publică n-are nevoie de altă apărare decât limitarea de rată. E și tipăribil sub QR,
 * ca cineva fără cameră (ori cu un QR șters de fotocopiator) să-l poată tasta.
 */
export function newVerifyToken(): string {
  let out = "";
  while (out.length < 16) {
    for (const byte of randomBytes(16)) {
      // Respingem valorile din coada neuniformă a intervalului: 256 nu se împarte exact la 32,
      // iar un modulo direct ar face primele 8 simboluri puțin mai probabile decât restul.
      if (byte >= 224) continue;
      out += ALPHABET[byte % 32];
      if (out.length === 16) break;
    }
  }
  return out;
}

/** Forma tipărită a tokenului: „K7M2-9QD4-3F8B-X2NV". În URL merge tot fără cratime. */
export function formatToken(token: string): string {
  return group(token);
}

/** „k7m2 9qd4-3f8bX2NV" → „K7M29QD43F8BX2NV". Ce tastează omul nu seamănă cu ce e în bază. */
export function normalizeToken(raw: string): string | null {
  const norm = raw.replace(/[^0-9a-z]/gi, "").toUpperCase();
  if (norm.length !== 16) return null;
  if (![...norm].every((ch) => ALPHABET.includes(ch))) return null;
  return norm;
}

/**
 * URL-ul din QR. Aplicația rutează pe hash, deci tokenul stă în fragment — partea pe care
 * browserul NU o trimite serverului. Un link scanat nu ajunge astfel în jurnalele de acces ale
 * proxy-ului și nici în antetul `Referer` al paginilor externe.
 */
export function verifyUrl(token: string, fingerprint: string): string {
  // Un `APP_URL` lipsă în producție ar tipări sute de formulare cu un cod care duce la
  // `localhost` — greșeală tăcută, descoperită abia de omul care scanează, cu hârtia deja
  // semnată și arhivată. Strigătul e aici, la generare, nu la scanare.
  if (!process.env.APP_URL && process.env.NODE_ENV === "production") {
    console.error(
      "[par-verify] APP_URL nu e setată: codurile QR tipărite acum vor trimite la localhost."
    );
  }
  const base = (process.env.APP_URL ?? "http://localhost:5173").replace(/\/+$/, "");
  return `${base}/#/verificare/par/${token}/${fingerprint}`;
}
