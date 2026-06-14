/**
 * EXPORT-002: Generator XML compatibil 1C:Accounting (format Moldova).
 *
 * Structura XML minimă pentru import în 1C:
 *   <ЗагрузкаДанных>
 *     <Документ Тип="ОперацияПроизвольная" Дата="..." Номер="...">
 *       <Операция Описание="...">
 *         <ДвиженияПоРегистрам>
 *           <ДвиженияПоРегиструБухгалтерия>
 *             <Движение ВидДвижения="Дебет|Кредит">
 *               <Счет>...</Счет>
 *               <Сумма>...</Сумма>
 *             </Движение>
 *           </ДвиженияПоРегиструБухгалтерия>
 *         </ДвиженияПоРегистрам>
 *       </Операция>
 *     </Документ>
 *   </ЗагрузкаДанных>
 *
 * Encoding: UTF-8 (declarație XML explicită).
 * Fără librărie externă — generare cu template strings.
 */

/** Escaping XML standard */
function x(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmtAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

export interface OneCEntry {
  date: string;          // YYYY-MM-DD
  ref: string | null;
  description: string | null;
  accountCode: string;
  debitCents: number;
  creditCents: number;
}

/**
 * Grupează înregistrările după ref/date pentru a forma Documente 1C.
 * Fiecare grupă → un <Документ> cu mișcări de debit și credit.
 */
export function generate1cXml(entries: OneCEntry[]): string {
  // Grupare după (date, ref) = document
  const groups = new Map<string, OneCEntry[]>();
  for (const e of entries) {
    const key = `${e.date}__${e.ref ?? e.description ?? ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  const docs: string[] = [];
  let docNum = 1;
  for (const [, grp] of groups) {
    const first = grp[0];
    const movements: string[] = [];
    for (const m of grp) {
      if (m.debitCents > 0) {
        movements.push(`        <Движение ВидДвижения="Дебет">
          <Счет>${x(m.accountCode)}</Счет>
          <Сумма>${fmtAmount(m.debitCents)}</Сумма>
        </Движение>`);
      }
      if (m.creditCents > 0) {
        movements.push(`        <Движение ВидДвижения="Кредит">
          <Счет>${x(m.accountCode)}</Счет>
          <Сумма>${fmtAmount(m.creditCents)}</Сумма>
        </Движение>`);
      }
    }
    docs.push(`  <Документ Тип="ОперацияПроизвольная" Дата="${x(first.date)}" Номер="${x(first.ref ?? String(docNum))}">
    <Операция Описание="${x(first.description ?? "")}">
      <ДвиженияПоРегистрам>
        <ДвиженияПоРегиструБухгалтерия>
${movements.join("\n")}
        </ДвиженияПоРегиструБухгалтерия>
      </ДвиженияПоРегистрам>
    </Операция>
  </Документ>`);
    docNum++;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<ЗагрузкаДанных>
${docs.join("\n")}
</ЗагрузкаДанных>`;
}
