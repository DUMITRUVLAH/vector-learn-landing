/**
 * Extragerea datelor beneficiarului din actele LUI: buletin, rechizite bancare, patentă.
 *
 * Separat de `parExtractor.ts` intenționat: acolo documentul e comercial și întrebarea grea e
 * „cine încasează?"; aici documentul are un singur om și întrebarea e „ce scrie pe el?". Un
 * prompt care le amestecă le face pe amândouă mai prost.
 *
 * Cade ÎNTOTDEAUNA pe parserul determinist (`payeeDocStub.ts`) când modelul nu e disponibil sau
 * răspunde cu ceva ce nu e JSON — iar `unavailable` călătorește cu rezultatul, ca interfața să
 * spună DE CE nu a rulat AI-ul, nu doar „(demo)".
 */
import { callAi } from "./client";
import { parsePayeeDoc, type PayeeDocFields, type PayeeDocKind } from "../par/payeeDocStub";
import { normalizePatentDate, normalizePatentSeries } from "../../../src/lib/par/patent";
import { isValidIBAN, normalizeIban } from "../../../src/lib/par/iban";

const MAX_AI_TEXT_CHARS = 8000;

export const PAYEE_DOC_SYSTEM_PROMPT = `Extragi datele unei PERSOANE (beneficiarul unei plăți) din actul ei.
Actul poate fi: buletin/carte de identitate, certificat sau extras cu rechizite bancare,
patentă de întreprinzător, certificat de înregistrare — inclusiv scanat sau fotografiat.
Returnează STRICT un JSON valid, fără text în plus.

REGULI:
1. Nu inventa NIMIC. Câmpul care nu apare în act → null. Mai bine null decât greșit.
2. "name" = numele titularului în ordinea "NUME Prenume", exact ca în act, fără titluri.
   NU returna eticheta tipărită pe act ("Nume", "Surname", "Prenume") drept valoare.
3. "idnp" = codul personal/fiscal al titularului: 13 cifre în Moldova (IDNP/IDNO). Nu confunda
   cu seria și numărul actului de identitate, cu data nașterii sau cu numărul patentei.
4. "iban" = contul bancar complet, fără spații. "bank" = doar denumirea băncii.
   "bic" = codul bancar/SWIFT (în Moldova apare cu sufix de filială, ex. MOLDMD2X322).
5. Pentru PATENTA DE ÎNTREPRINZĂTOR:
   - "patentSeries" = seria și numărul, cum sunt tipărite (ex. "AA 0123456").
   - "patentValidUntil" = ULTIMA ZI de valabilitate, în format "YYYY-MM-DD".
     Actul scrie de obicei "valabilă de la <data1> până la <data2>" → ia data2, NU data1.
     Data eliberării, data nașterii sau data înregistrării NU sunt termen de valabilitate.
6. "kind" = "buletin" | "rechizite" | "patenta" | "unknown" — ce fel de act este.
7. "payeeType" = "fizic" dacă titularul e o persoană fizică, "juridic" dacă e o companie.

Format JSON:
{"name":string|null,"idnp":string|null,"address":string|null,"iban":string|null,
 "bank":string|null,"bic":string|null,"patentSeries":string|null,
 "patentValidUntil":string|null,"kind":string,"payeeType":"fizic"|"juridic"|null}`;

export interface PayeeDocExtraction extends PayeeDocFields {
  payeeType: "fizic" | "juridic" | null;
  /** true când a răspuns parserul determinist, nu modelul. */
  isStub: boolean;
  unavailable?: "no_key" | "feature_disabled" | "budget_exceeded" | "api_error";
}

export interface ExtractPayeeDocOpts {
  kindHint?: PayeeDocKind | "auto";
  imageDataUrl?: string;
  fileDataUrl?: string;
  fileName?: string;
  tenantId: string;
  userId?: string;
  /** UUID real — ajunge în `ai_audit_log.entity_id`, care e o coloană uuid. */
  prefillId: string;
}

function extractJsonBlock(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const obj = body.match(/\{[\s\S]*\}/);
  return obj ? obj[0] : body;
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && t.toLowerCase() !== "null" ? t : null;
}

/** Rezultatul modelului trece prin ACELEAȘI validări ca cel determinist. */
function normalize(json: Record<string, unknown>, fallback: PayeeDocFields): PayeeDocExtraction {
  const iban = str(json.iban) ? normalizeIban(str(json.iban)) : null;
  const kindRaw = str(json.kind);
  const kind: PayeeDocKind =
    kindRaw === "buletin" || kindRaw === "rechizite" || kindRaw === "patenta" ? kindRaw : fallback.kind;
  const typeRaw = str(json.payeeType);
  return {
    name: str(json.name) ?? fallback.name,
    idnp: str(json.idnp)?.replace(/\s+/g, "") ?? fallback.idnp,
    address: str(json.address) ?? fallback.address,
    // Un IBAN care nu trece mod-97 nu se completează, oricât de sigur ar suna modelul —
    // un cont greșit trimite banii altcuiva.
    iban: iban && isValidIBAN(iban) ? iban : fallback.iban,
    bank: str(json.bank) ?? fallback.bank,
    bic: str(json.bic)?.toUpperCase() ?? fallback.bic,
    // Modelul o întoarce cum e tipărită („seria AA nr. 0123456"), parserul determinist o
    // curăță — aceeași patentă trebuie să arate la fel indiferent cine a citit-o.
    patentSeries: normalizePatentSeries(str(json.patentSeries)) ?? fallback.patentSeries,
    patentValidUntil: normalizePatentDate(str(json.patentValidUntil)) ?? fallback.patentValidUntil,
    kind,
    payeeType: typeRaw === "fizic" || typeRaw === "juridic" ? typeRaw : null,
    isStub: false,
  };
}

export async function extractPayeeDoc(
  text: string,
  opts: ExtractPayeeDocOpts,
): Promise<PayeeDocExtraction> {
  const fallback = parsePayeeDoc(text ?? "", opts.kindHint);
  const aiText = (text ?? "").slice(0, MAX_AI_TEXT_CHARS);
  const hasAttachment = Boolean(opts.imageDataUrl || opts.fileDataUrl);
  const what =
    opts.kindHint === "buletin"
      ? "un act de identitate (buletin)"
      : opts.kindHint === "rechizite"
        ? "un document cu rechizite bancare"
        : opts.kindHint === "patenta"
          ? "o patentă de întreprinzător"
          : "actul beneficiarului";

  const result = await callAi({
    action: "capture_extract", // aceeași acțiune → același audit + aceleași plafoane
    systemPrompt: PAYEE_DOC_SYSTEM_PROMPT,
    userMessage: hasAttachment
      ? aiText.trim().length > 0
        ? `Extrage datele titularului din ${what} atașat. Text parțial extras din el:\n\n${aiText}`
        : `Extrage datele titularului din ${what} atașat (scanat / fotografiat).`
      : `Extrage datele titularului din ${what}. Text OCR:\n\n${aiText}`,
    imageDataUrl: opts.imageDataUrl,
    fileDataUrl: opts.fileDataUrl,
    fileName: opts.fileName,
    maxTokens: 500,
    entityType: "fin_capture",
    entityId: opts.prefillId,
    tenantId: opts.tenantId,
    userId: opts.userId,
  });

  if (result.isStub) {
    return { ...fallback, payeeType: null, isStub: true, unavailable: result.unavailable ?? "no_key" };
  }
  try {
    return normalize(JSON.parse(extractJsonBlock(result.text)) as Record<string, unknown>, fallback);
  } catch {
    return { ...fallback, payeeType: null, isStub: true, unavailable: "api_error" };
  }
}
