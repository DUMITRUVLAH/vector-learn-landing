/**
 * VM4-04 — potrivirea automată a fișierelor de dovadă cu plățile care le așteaptă.
 *
 * Contextul (Violeta, finanțe): extrasele ștampilate vin a doua zi, în bloc. Cu 20–30 de plăți,
 * varianta „deschide fiecare cerere și atașează" e ora pierdută pe care o descria. Fișierele vin
 * însă din bancă/1C cu numele plin de indicii: numărul ordinului de plată, numele beneficiarului,
 * suma, uneori chiar numărul cererii.
 *
 * Funcția de aici NU atașează nimic — propune. Fiecare fișier primește cea mai bună potrivire, cu
 * un motiv scris în clar și un nivel de încredere; utilizatorul confirmă sau schimbă din listă.
 * Regula e „mai bine incert decât greșit": o potrivire slabă sau ambiguă (două plăți la fel de
 * plauzibile) rămâne fără sugestie, nu ghicește.
 */

export interface ProofCandidate {
  id: string;
  requestNo: string;
  payeeName: string | null;
  paymentRef: string | null;
  /** Suma efectiv plătită (bani); dacă lipsește, se folosește estimatul. */
  amountCents: number | null;
}

export type ProofConfidence = "sigur" | "probabil" | "incert";

export interface ProofMatch {
  /** Cererea propusă; null când nimic nu se potrivește destul de bine. */
  parId: string | null;
  confidence: ProofConfidence;
  /** De ce a fost propusă — text scurt, arătat lângă fișier („după nr. ordinului: OP-2026-0047"). */
  reason: string | null;
}

/** Cuvintele din denumirea juridică nu identifică pe nimeni: „SRL" apare la jumătate din furnizori. */
const LEGAL_FORM_TOKENS = new Set([
  "srl", "sa", "sc", "ii", "gt", "spa", "srls", "societatea", "comerciala", "intreprinderea",
  "individuala", "firma", "company", "ltd", "llc", "inc",
]);

/** Alfanumerice, majuscule, fără diacritice — „OP-2026/0047.pdf" și „op 2026 0047" devin identice. */
export function normalizeToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Cuvintele utile din numele beneficiarului (fără forme juridice și fără scurtături de 1–3 litere). */
function nameTokens(name: string | null): string[] {
  if (!name) return [];
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !LEGAL_FORM_TOKENS.has(t));
}

/** Suma, în formele în care apare într-un nume de fișier: „7000", „700000" (bani), „7,000.00". */
function amountNeedles(amountCents: number | null): string[] {
  if (!amountCents || amountCents <= 0) return [];
  const major = Math.round(amountCents / 100);
  const needles = [String(amountCents), String(major)];
  if (amountCents % 100 !== 0) needles.push(`${major}${String(amountCents % 100).padStart(2, "0")}`);
  return needles.filter((n) => n.length >= 3);
}

interface ScoredCandidate {
  candidate: ProofCandidate;
  score: number;
  reason: string;
}

function scoreCandidate(fileName: string, candidate: ProofCandidate): ScoredCandidate {
  const haystack = normalizeToken(fileName);
  const rawLower = fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  let score = 0;
  const reasons: string[] = [];

  // 1. Numărul cererii — cel mai tare semnal (PAR-2026-0020 e unic).
  const reqNo = normalizeToken(candidate.requestNo);
  if (reqNo.length >= 6 && haystack.includes(reqNo)) {
    score += 100;
    reasons.push(`nr. cererii ${candidate.requestNo}`);
  } else {
    // „PAR-2026-0020" scris în fișier ca „20260020" (fără prefix) — tot identificator, tot unic.
    const digits = candidate.requestNo.replace(/\D/g, "");
    if (digits.length >= 6 && haystack.includes(digits)) {
      score += 90;
      reasons.push(`nr. cererii ${candidate.requestNo}`);
    }
  }

  // 2. Referința plății (numărul ordinului de plată) — exact ce scrie banca în numele fișierului.
  const ref = normalizeToken(candidate.paymentRef ?? "");
  if (ref.length >= 4 && haystack.includes(ref)) {
    score += 80;
    reasons.push(`nr. ordinului ${candidate.paymentRef}`);
  }

  // 3. Beneficiarul — toate cuvintele semnificative trebuie să apară, altfel „Consult" ar lega
  //    fișierul de orice firmă care începe la fel.
  const tokens = nameTokens(candidate.payeeName);
  if (tokens.length > 0 && tokens.every((t) => rawLower.includes(t))) {
    score += 40;
    reasons.push(`beneficiar ${candidate.payeeName}`);
  }

  // 4. Suma — semnal slab singur (două plăți pot avea aceeași sumă), util ca departajare.
  const needle = amountNeedles(candidate.amountCents).find((n) => haystack.includes(n));
  if (needle) {
    score += 20;
    reasons.push("suma");
  }

  return { candidate, score, reason: reasons.join(" · ") };
}

/**
 * Propune o cerere pentru un fișier.
 *
 * Praguri: ≥80 și fără concurență la fel de bună → „sigur"; ≥40 → „probabil";
 * altfel „incert" (fără sugestie). Egalitatea între primele două candidate coboară încrederea:
 * două plăți identice către același beneficiar nu se pot departaja din numele fișierului.
 */
export function matchProofFile(fileName: string, candidates: ProofCandidate[]): ProofMatch {
  if (candidates.length === 0) return { parId: null, confidence: "incert", reason: null };

  const scored = candidates
    .map((c) => scoreCandidate(fileName, c))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const runnerUp = scored[1];
  if (best.score < 40) return { parId: null, confidence: "incert", reason: null };

  const ambiguous = !!runnerUp && runnerUp.score === best.score;
  if (ambiguous) {
    return {
      parId: null,
      confidence: "incert",
      reason: `mai multe plăți se potrivesc la fel de bine (${best.reason})`,
    };
  }

  return {
    parId: best.candidate.id,
    confidence: best.score >= 80 ? "sigur" : "probabil",
    reason: best.reason || null,
  };
}

/**
 * Potrivește o listă întreagă de fișiere; rezultatul păstrează ordinea intrării (indice cu indice,
 * nu pe nume — două fișiere pot avea același nume din foldere diferite).
 *
 * O cerere primește o singură sugestie automată: dacă două fișiere trag la aceeași plată, îl
 * păstrează pe cel mai bine punctat, iar celălalt rămâne de ales manual — altfel un extras ar
 * acoperi în tăcere dovada altei plăți.
 */
export function matchProofFiles(
  fileNames: string[],
  candidates: ProofCandidate[]
): ProofMatch[] {
  const strength = (m: ProofMatch) => (m.confidence === "sigur" ? 2 : m.confidence === "probabil" ? 1 : 0);

  const ranked = fileNames
    .map((fileName, index) => ({ index, match: matchProofFile(fileName, candidates) }))
    .sort((a, b) => strength(b.match) - strength(a.match));

  const taken = new Set<string>();
  const out: ProofMatch[] = new Array(fileNames.length);
  for (const { index, match } of ranked) {
    if (match.parId && taken.has(match.parId)) {
      out[index] = {
        parId: null,
        confidence: "incert",
        reason: "altă dovadă a fost deja potrivită cu aceeași plată",
      };
      continue;
    }
    if (match.parId) taken.add(match.parId);
    out[index] = match;
  }
  return out;
}
