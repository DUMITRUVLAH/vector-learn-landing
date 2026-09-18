/**
 * Numărul ordinului de plată, luat din dovada primită de la bancă.
 *
 * De ce (owner, 18.09.2026): „numărul ordinului de plată eu după trebuie să-l iau din bancă, când
 * îți dau să citești numărul". La ora plății numărul nu există încă — extrasul ștampilat vine a
 * doua zi. Până acum rubrica „Referință plată" se completa de mână, cerere cu cerere, iar când
 * rămânea goală numele dosarului rămânea fără blocul `_OP-2065_` și coloana „Nr. ordin" fără nimic.
 *
 * Ce face: când se atașează o dovadă (`kind = payment_order`), îi citește numărul și data și le
 * scrie în `par_payments` — DOAR în rubricile încă goale. Ce a scris omul nu se rescrie niciodată:
 * o cifră tastată de finanțe bate un regex, oricât de bun ar fi.
 *
 * Ce NU face: nu ghicește. Un scan fără strat de text, un extras cu douăzeci de operațiuni sau un
 * document care nu se recunoaște lasă rubricile exact cum erau (vezi `parsePaymentOrderRef`).
 */
import { and, eq, isNull, or } from "drizzle-orm";

import { db } from "../../db/client";
import { parAudit, parPayments } from "../../db/schema/par";
import { parsePaymentOrderRef } from "./documentRef";

export interface FilledPaymentRef {
  paymentRef: string | null;
  paymentDate: string | null;
}

/**
 * `null` dacă nu s-a completat nimic (nici număr citit, nici rubrică liberă). Nu aruncă: o dovadă
 * atașată cu succes nu are voie să pice fiindcă n-am putut citi un număr din ea.
 */
export async function fillPaymentRefFromProof(params: {
  tenantId: string;
  parId: string;
  attachmentId: string;
  actorUserId: string;
  rawText: string | null | undefined;
}): Promise<FilledPaymentRef | null> {
  const { tenantId, parId, attachmentId, actorUserId, rawText } = params;
  try {
    const ref = parsePaymentOrderRef(rawText);
    // Fără număr n-am identificat documentul, deci nici data lui nu e de încredere (un extras de
    // cont are o dată pe fiecare rând). Se completează amândouă sau niciuna.
    if (!ref?.number) return null;

    const [payment] = await db
      .select({ paymentRef: parPayments.paymentRef, paymentDate: parPayments.paymentDate })
      .from(parPayments)
      .where(and(eq(parPayments.tenantId, tenantId), eq(parPayments.parId, parId)));
    if (!payment) return null;

    const takesRef = !payment.paymentRef?.trim();
    const takesDate = !payment.paymentDate && !!ref.date;
    if (!takesRef && !takesDate) return null;

    // `where` repetă condiția de rubrică goală: între citire și scriere poate intra omul care
    // tocmai completa rubrica în ecranul de plată.
    const updated = await db
      .update(parPayments)
      .set({
        ...(takesRef ? { paymentRef: ref.number } : {}),
        ...(takesDate ? { paymentDate: new Date(`${ref.date}T12:00:00.000Z`) } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(parPayments.tenantId, tenantId),
          eq(parPayments.parId, parId),
          takesRef ? or(isNull(parPayments.paymentRef), eq(parPayments.paymentRef, "")) : undefined,
          takesDate ? isNull(parPayments.paymentDate) : undefined,
        ),
      )
      .returning({ id: parPayments.id });
    if (!updated.length) return null;

    const filled: FilledPaymentRef = {
      paymentRef: takesRef ? ref.number : null,
      paymentDate: takesDate ? ref.date : null,
    };
    await db.insert(parAudit).values({
      tenantId,
      parId,
      actorUserId,
      event: "payment_ref_read_from_proof",
      detail: JSON.stringify({ attachmentId, ...filled }),
    });
    return filled;
  } catch {
    // Citirea numărului e un bonus, nu o condiție a atașării.
    return null;
  }
}
