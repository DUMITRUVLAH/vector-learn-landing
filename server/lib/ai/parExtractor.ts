/**
 * PAR-specific multi-party LLM extractor.
 *
 * Builds the multi-party prompt, calls the shared `callAi`, parses the JSON into a
 * `ParPartiesExtraction`. On stub mode (no API key) OR parse failure it delegates to the
 * deterministic `parsePartiesFromText` regex parser over the SAME text — so the no-API-key
 * CI path reproduces every scenario.
 *
 * Keeps captureExtractor.ts (the FinDesk invoice path) byte-for-byte untouched.
 */

import { callAi } from "./client";
import { parsePartiesFromText } from "../par/stubPartyParser";
import type {
  ParPartiesExtraction,
  ParExtractedParty,
  ParRole,
} from "../par/parPartyTypes";

const MAX_AI_TEXT_CHARS = 14000;

export const PAR_MULTIPARTY_SYSTEM_PROMPT = `Ești un asistent care extrage TOATE părțile și rechizitele dintr-un document
(contract, factură, ordin de plată, act, chitanță) pentru o cerere de plată (PAR).
Returnează STRICT un JSON valid, fără text adițional.

REGULI ABSOLUTE:
1. Nu inventa NIMIC. Dacă un câmp nu apare în document → null. Mai bine null decât greșit.
2. Listează TOATE părțile menționate (de obicei 2; pot fi 3 sau mai multe), fiecare cu:
   - name: denumirea legală exact ca în document (păstrează SRL/SA/ÎI/ООО/GmbH/LLC),
     fără ghilimele și fără titluri ("dl.", "dna", "ООО").
   - role: rolul părții, ales DUPĂ FUNCȚIE, nu după cuvânt:
       "executor"  = cel care PRESTEAZĂ serviciul / lucrarea și ESTE PLĂTIT (RO "Executor").
       "provider"  = cel care VINDE / PRESTEAZĂ / LIVREAZĂ și ESTE PLĂTIT
                     (Prestator, Furnizor, Vânzător, Antreprenor, Subantreprenor,
                      RU Исполнитель/Поставщик/Подрядчик/Субподрядчик, EN Supplier/Seller/Contractor/Bill From).
       "client"    = cel care PLĂTEȘTE / cumpără / comandă (Cumpărător, Plătitor, Ordonator,
                     Achizitor, "Autoritatea contractantă", "Bill To", "Către" pe o factură,
                     RU Заказчик/Плательщик, EN Buyer/Bill To). ATENȚIE FOARTE IMPORTANT: în
                     contractele și actele din Moldova cuvântul "BENEFICIAR" și "Autoritatea
                     contractantă" înseamnă aproape ÎNTOTDEAUNA CLIENTUL care plătește (cel care
                     primește serviciul) — deci role = "client", NU "provider", chiar dacă scrie
                     "Beneficiar". Pe o factură, "De la" = vânzătorul (provider), "Către" = clientul.
       "bank"      = o instituție bancară (BC ... S.A., Maib, Victoriabank ...). NU e o parte plătibilă.
       "unknown"   = rolul nu poate fi stabilit.
   REGULĂ DE AUR: beneficiarul plății (cel pe care îl alegem) este ÎNTOTDEAUNA Prestatorul /
   Furnizorul / Executorul / Vânzătorul (provider/executor) — cel care PRESTEAZĂ și PRIMEȘTE banii.
   NU alege niciodată Clientul / Beneficiarul-din-contract / Autoritatea contractantă ca fiind plătit.
   INDICII PUTERNICE pentru a găsi VÂNZĂTORUL/PRESTATORUL (= provider):
     • Pe o factură/cont de plată: "De la" / "Furnizor" / "Vânzător" / "Bill From" = vânzătorul (provider);
       "Către" / "Client" / "Cumpărător" / "Bill To" = cumpărătorul (client). NU confunda direcția.
     • Partea ale cărei DATE BANCARE (IBAN, cont, bancă) sunt listate PENTRU ÎNCASARE este aproape
       sigur VÂNZĂTORUL/PRESTATORUL (provider) — pune IBAN-ul respectiv la ACEA parte.
     • EXEMPLU: "Cont de plată 251. Către S.R.L. MIXBOOK. De la Vector Academy. IBAN MD87... (al Vector
       Academy)." → MIXBOOK = "client" (Către, cumpărătorul care plătește); Vector Academy = "provider"
       (De la, vânzătorul, are IBAN-ul de încasare) = beneficiarul plății. Deci role MIXBOOK="client",
       role "Vector Academy"="provider", iar IBAN-ul MD87... aparține Vector Academy.
   - TABEL CU DOUĂ COLOANE (foarte frecvent în contractele MD): blocul de recuzite e adesea un
     tabel "EXECUTOR | BENEFICIAR" care, în text, are fiecare etichetă REPETATĂ pe linie
     ("Cod fiscal X Cod fiscal Y", "IBAN X IBAN Y", "Banca X Banca Y"). PRIMA valoare aparține
     PRIMEI părți (coloana stângă, de obicei EXECUTOR), A DOUA valoare celei de-a doua părți
     (coloana dreaptă, CLIENT). Asociază fiecare IBAN/cod fiscal/bancă cu partea CORECTĂ — nu le
     amesteca și nu le pune pe toate la o singură parte.
   - FORMULAR DE PLATĂ / PAR / secțiune "Beneficiar plată / Payee": dacă documentul e un formular de
     cerere de plată (ex. "Payment Action Request (PAR) Form") sau are o secțiune de beneficiar al
     plății, BENEFICIARUL este persoana/firma de la "Name, Surname" / "Nume, Prenume" / "Beneficiar" /
     "Payee" din secțiunea de plată — NU "Requested By"/"Solicitant"/"Requestor", NU semnatarii
     ("Approver"/"Aprobator"/"Director"/"Executive Director"). Acel beneficiar poate fi o PERSOANĂ
     FIZICĂ (un nume de om, ex. "Daria Roitman", fără SRL/SA) — listează-l ca parte cu role="provider"
     (e cel plătit). Ia IDNP-ul, IBAN-ul și banca din APROPIEREA acelui nume. Ignoră solicitantul și
     aprobatorii ca beneficiari.
   - RECUNOAȘTE VALORILE DUPĂ FORMAT, nu doar după etichetă (etichetele pot fi greșite/încurcate într-un
     formular): un IBAN = "MD" + 2 cifre + 20 caractere (sau IBAN străin RO../DE..); un IDNP/IDNO/cod
     fiscal = EXACT 13 cifre. Dacă sub eticheta "IDNP:" apare o valoare în format IBAN (MD...), aceea e
     IBAN-ul → pune-o în iban. ORICE număr de EXACT 13 cifre din secțiunea beneficiarului — chiar pe o
     linie separată, fără etichetă, sau după "Bank:" — este IDNP-ul beneficiarului → pune-l în idno.
     Asociază fiecare valoare cu beneficiarul după FORMAT, nu după poziția etichetei.
     EXEMPLU (formular PAR): "Name, Surname: Daria Roitman / IDNP: / MD48ML000002259A19498121 / IBAN: /
     Bank: BC Moldindconbank S.A. / 2008001007903" → beneficiar persoană fizică "Daria Roitman",
     iban="MD48ML000002259A19498121" (e format IBAN, deși scrie sub IDNP), idno="2008001007903" (13 cifre,
     deși plutește după bancă), bank="BC Moldindconbank S.A.".
   - idno: codul fiscal / IDNO / IDNP — EXACT 13 cifre. "cod fiscal" = "IDNO" = "IDNP" = "ИДНО"
     = "fiscal code" — toate sunt ACELAȘI lucru. Pune-l în idno.
   - vatCode: "Cod TVA" / "Cod IVA" / "VAT" / "Код НДС" / "USt-IdNr" — acesta NU este idno.
     Pune-l SEPARAT în vatCode ca să nu fie confundat cu idno.
   - iban: contul bancar (ex. MD.. sau IBAN străin DE..). Scrie-l fără spații dacă poți.
     Dacă în dreptul "IBAN"/"Cont" apare un număr de 13 cifre, acela e de fapt codul fiscal →
     pune-l în idno, NU în iban.
   - bank: numele băncii părții (ex. "BC Victoriabank S.A.", "Maib").
   - bic: codul SWIFT/BIC dacă există.
3b. line_items: lista ARTICOLELOR/serviciilor din document (din tabelul de produse/servicii/devizul de
   cost — "Denumire", "Serviciu", "Items/Services", "Descriere"). Fiecare cu: description (denumirea
   serviciului/produsului, scurtă), quantity (cantitatea ca NUMĂR întreg, implicit 1), unit (unitatea de
   măsură: "buc"/"sesie"/"ore"/"participanți"/"zi" etc., sau null), unit_price (prețul UNITAR în unități
   ÎNTREGI ale valutei — NU în cenți, NU înmulțit cu 100; dacă în tabel apare doar suma totală pe rând,
   pune-o ca unit_price cu quantity=1). Returnează un rând PER serviciu listat. Dacă documentul nu are
   articole detaliate (doar un total), returnează [] (lista goală). Exemplu: "Ziua 1 de training ... 4 000",
   "Pregătire materiale ... 10 500" → 2 articole. "provision of psihologic session services 1 sesie 7 000"
   → un articol {description:"provision of psihologic session services", quantity:1, unit:"sesie", unit_price:7000}.
3. amount: suma DE PLATĂ în UNITĂȚI ÎNTREGI ale valutei (lei/euro/dolari) — NU în cenți,
   NU înmulți cu 100; aplicația face conversia. Folosește TOTALUL de plată ("Total de plată",
   "TOTAL DUE", "Итого к оплате", "всего", "Suma", "Remunerația", "în mărime de", "стоимость",
   "preț"), NU subtotalul fără TVA și NU doar TVA-ul.
   Exemplu: "5000 lei" → 5000. "45 000,00 lei" → 45000. "EUR 2,400.00" → 2400.
   Dacă documentul nu conține o sumă de plată → null.
4. currency: "MDL" pentru lei/лей, "EUR" pentru €/EUR, "USD" pentru $/USD. Implicit "MDL".
5. scope: o frază scurtă (max 15 cuvinte) cu obiectul plății / serviciul.
6. documentClass: "invoice" / "receipt" / "not_invoice" (contract/proces-verbal/poză = not_invoice).
   NU forța "invoice" pe un document care nu e factură.
7. NU decide tu cine e beneficiarul plății. Doar listează părțile cu rolul lor corect.
   Selecția finală a beneficiarului se face în alt pas.

Returnează DOAR JSON:
{
  "parties": [
    { "name": "...", "role": "executor|provider|client|bank|unknown",
      "idno": "..." sau null, "vatCode": "..." sau null,
      "iban": "..." sau null, "bank": "..." sau null, "bic": "..." sau null,
      "confidence": 0.0 }
  ],
  "amount": { "value": 0.0 sau null, "confidence": 0.0 },
  "currency": "MDL|EUR|USD" sau null,
  "scope": { "value": "..." sau null, "confidence": 0.0 },
  "line_items": [
    { "description": "...", "quantity": 1, "unit": "..." sau null, "unit_price": 0.0 }
  ],
  "document_class": { "value": "invoice|receipt|not_invoice" sau null, "confidence": 0.0, "reason": "..." }
}`;

const VALID_ROLES: readonly ParRole[] = ["executor", "provider", "client", "bank", "unknown"];
const VALID_CURRENCIES = ["MDL", "EUR", "USD"] as const;
const VALID_CLASSES = ["invoice", "receipt", "not_invoice"] as const;

/** Strip ```json fences and isolate the JSON object. */
function extractJsonBlock(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const obj = body.match(/\{[\s\S]*\}/);
  return obj ? obj[0] : body;
}

function clamp01(n: unknown): number {
  const v = typeof n === "number" ? n : 0;
  return Math.min(1, Math.max(0, v));
}

function asStringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/** Normalize the model JSON into a ParPartiesExtraction (isStub:false). */
export function normalizeParExtraction(json: Record<string, unknown>): ParPartiesExtraction {
  const rawParties = Array.isArray(json.parties) ? json.parties : [];
  const parties: ParExtractedParty[] = [];
  for (const raw of rawParties) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    const name = asStringOrNull(p.name);
    if (!name) continue; // drop empty-name parties
    const role = (VALID_ROLES as readonly string[]).includes(String(p.role))
      ? (p.role as ParRole)
      : "unknown";
    parties.push({
      name,
      role,
      idno: asStringOrNull(p.idno),
      iban: asStringOrNull(p.iban),
      bank: asStringOrNull(p.bank),
      bic: asStringOrNull(p.bic),
      vatCode: asStringOrNull(p.vatCode),
    });
  }

  // Amount: model returns MAJOR units → ×100 → cents (mirrors captureExtractor).
  const amountObj = (json.amount ?? {}) as { value?: unknown; confidence?: unknown };
  let amountCents: number | null = null;
  let amountConfidence = 0;
  if (amountObj.value != null) {
    const major =
      typeof amountObj.value === "number"
        ? amountObj.value
        : parseFloat(String(amountObj.value).replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(major) && major >= 0) {
      amountCents = Math.round(major * 100);
      amountConfidence = clamp01(amountObj.confidence);
    }
  }

  const currency = (VALID_CURRENCIES as readonly string[]).includes(String(json.currency))
    ? (json.currency as "MDL" | "EUR" | "USD")
    : null;

  const scopeObj = (json.scope ?? {}) as { value?: unknown };
  const scope = asStringOrNull(scopeObj.value);

  const dcObj = (json.document_class ?? {}) as { value?: unknown; reason?: unknown };
  const documentClass = (VALID_CLASSES as readonly string[]).includes(String(dcObj.value))
    ? (dcObj.value as "invoice" | "receipt" | "not_invoice")
    : null;
  const documentClassReason = asStringOrNull(dcObj.reason) ?? undefined;

  // line_items: unit_price is in MAJOR units in the JSON → ×100 to cents (same as amount).
  const rawItems = Array.isArray(json.line_items) ? (json.line_items as Array<Record<string, unknown>>) : [];
  const lineItems = rawItems
    .map((it) => {
      const description = (asStringOrNull(it.description) ?? "").trim();
      const major =
        typeof it.unit_price === "number"
          ? it.unit_price
          : parseFloat(String(it.unit_price ?? "").replace(/\s/g, "").replace(",", "."));
      const qty = Math.max(1, Math.round(Number(it.quantity) || 1));
      return {
        description,
        quantity: qty,
        unit: asStringOrNull(it.unit),
        unitPriceCents: Number.isFinite(major) && major >= 0 ? Math.round(major * 100) : 0,
      };
    })
    .filter((it) => it.description.length > 0)
    .slice(0, 30);

  return {
    parties,
    amountCents,
    amountConfidence,
    currency,
    scope,
    documentClass,
    documentClassReason,
    lineItems,
    isStub: false,
  };
}

export interface ExtractParPartiesOpts {
  imageDataUrl?: string;
  tenantId: string;
  userId?: string;
  prefillId: string;
}

/**
 * Extract all parties + requisites from a document for the PAR payee selection step.
 * Stub mode / parse failure → deterministic regex parser over the same text.
 */
/**
 * Build the text sent to the LLM. A naïve slice(0, N) truncated long multi-page contracts BEFORE the
 * "DATELE JURIDICE / DATE BANCARE" requisites block (IBAN, cod fiscal) which often sits on page 5-9 —
 * so the IBAN was never extracted. Instead keep the document HEAD (parties/intro/price live here) PLUS
 * every requisite-bearing line from the rest of the document, capped at the budget.
 */
export function buildAiText(raw: string): string {
  const text = raw ?? "";
  if (text.length <= MAX_AI_TEXT_CHARS) return text;
  const HEAD = Math.min(6000, Math.floor(MAX_AI_TEXT_CHARS / 2));
  const head = text.slice(0, HEAD);
  // Window-based (NOT line-based) selection: PDF text often has a single huge line, so we take a small
  // window AROUND each strong requisite anchor anywhere past the head — IBAN, cod fiscal, and the
  // "DATELE JURIDICE / DATE BANCARE / DATE DE FACTURARE" requisites section (often on page 5-9).
  const anchorRe =
    /IBAN|cod\s*fiscal|\bc\/f\b|\bc\/b\b|\bIDNO\b|\bIDNP\b|date(?:le)?\s*(?:juridice|bancare|de\s*facturare|de\s*pl[ăa]ți|de\s*plat)|\bBIC\b|SWIFT|cod\s*bancar|spre\s*plat|total\s*contract/gi;
  const windows: Array<[number, number]> = [];
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(text)) !== null && windows.length < 60) {
    if (m.index < HEAD) continue;
    windows.push([Math.max(HEAD, m.index - 140), m.index + 220]);
  }
  windows.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const w of windows) {
    const last = merged[merged.length - 1];
    if (last && w[0] <= last[1] + 40) last[1] = Math.max(last[1], w[1]);
    else merged.push([w[0], w[1]]);
  }
  let body = "";
  for (const [s, e] of merged) {
    if (head.length + body.length + (e - s) + 4 > MAX_AI_TEXT_CHARS) break;
    body += `\n…\n${text.slice(s, e)}`;
  }
  return `${head}\n\n--- DATE DE PLATĂ / RECHIZITE (din restul documentului) ---${body}`;
}

export async function extractParParties(
  text: string,
  opts: ExtractParPartiesOpts,
): Promise<ParPartiesExtraction> {
  const aiText = buildAiText(text ?? "");

  const result = await callAi({
    action: "capture_extract", // reuse existing action → existing audit + stub plumbing
    systemPrompt: PAR_MULTIPARTY_SYSTEM_PROMPT,
    userMessage: opts.imageDataUrl
      ? "Extrage TOATE părțile din documentul din imagine."
      : `Extrage TOATE părțile din textul OCR:\n\n${aiText}`,
    imageDataUrl: opts.imageDataUrl,
    maxTokens: 900,
    entityType: "fin_capture",
    entityId: opts.prefillId,
    tenantId: opts.tenantId,
    userId: opts.userId,
  });

  // STUB or non-JSON → deterministic regex parser over the SAME text.
  if (result.isStub) {
    return { ...parsePartiesFromText(text ?? ""), isStub: true };
  }

  try {
    const json = JSON.parse(extractJsonBlock(result.text)) as Record<string, unknown>;
    return normalizeParExtraction(json);
  } catch {
    return { ...parsePartiesFromText(text ?? ""), isStub: true };
  }
}
