/**
 * STMT-006 test fixtures — the TAB-delimited text the upload route produces from a MAIB
 * .xlsx (via cellTextForStatement). SYNTHETIC partner data (fake names/IDNO/IBAN), REAL
 * structure verbatim from actual exports: merged-cell duplication, multiline details, and
 * one transaction spread across 2–3 sibling rows cycling name → IDNO → IBAN.
 *
 * FORMAT_A = classic export (3 rows/txn, header "Total Iesiri/Intrari", merged dup columns).
 * FORMAT_B = newer export (2 rows/txn, header "Cod fiscal" + "Total Intrări/Ieșiri").
 */

// FORMAT A: columns duplicated (merged cells) → "1\t1\t01.04.2025\t01.04.2025\t…". Debit=20000
// credit=0 for txn 1 (out, own transfer); txn 2 is an incoming client payment with IDNO+IBAN.
export const MAIB_EXCEL_TSV_FORMAT_A = [
  "BC ”MAIB” SA\t\t\t\t\t\t\t",
  "Titular:\tACME TEST SRL\t\tIDNO:\t1099999999999\t\t\t",
  "Extras de Cont nr. 22516065719 din 01.05.2025\t\t\t\t\t\t\t",
  "N/O\tN/O\tData tranzactiei\tData tranzactiei\tNo doc.\tNo doc.\tDate partener\tDate partener\tDetalii plata\tDetalii plata\tDebit\tDebit\tCredit\tCredit",
  "1\t1\t04.05.2025\t04.05.2025\t524\t524\tACME TEST SRL\tACME TEST SRL\tAlimentare cont\tAlimentare cont\t20000.00\t20000.00\t0.00\t0.00",
  "1\t1\t04.05.2025\t04.05.2025\t524\t524\t1099999999999\t1099999999999\tAlimentare cont\tAlimentare cont\t20000.00\t20000.00\t0.00\t0.00",
  "1\t1\t04.05.2025\t04.05.2025\t524\t524\tMD49AG000000022586068781\tMD49AG000000022586068781\tAlimentare cont\tAlimentare cont\t20000.00\t20000.00\t0.00\t0.00",
  "2\t2\t05.05.2025\t05.05.2025\t299\t299\t(R) BETA CLIENT SRL\t(R) BETA CLIENT SRL\tPlata pentru servicii instruire conform Factura Nr.224\tPlata pentru servicii instruire conform Factura Nr.224\t0.00\t0.00\t7866.00\t7866.00",
  "2\t2\t05.05.2025\t05.05.2025\t299\t299\t1009600020033\t1009600020033\tPlata pentru servicii instruire conform Factura Nr.224\tPlata pentru servicii instruire conform Factura Nr.224\t0.00\t0.00\t7866.00\t7866.00",
  "2\t2\t05.05.2025\t05.05.2025\t299\t299\tMD94AG000000022512036601\tMD94AG000000022512036601\tPlata pentru servicii instruire conform Factura Nr.224\tPlata pentru servicii instruire conform Factura Nr.224\t0.00\t0.00\t7866.00\t7866.00",
  "3\t3\t06.05.2025\t06.05.2025\t100\t100\tBC 'MAIB' S.A.\tBC 'MAIB' S.A.\tComision pentru acceptarea cardurilor de plata\tComision pentru acceptarea cardurilor de plata\t50.00\t50.00\t0.00\t0.00",
  "3\t3\t06.05.2025\t06.05.2025\t100\t100\t1002600003778\t1002600003778\tComision pentru acceptarea cardurilor de plata\tComision pentru acceptarea cardurilor de plata\t50.00\t50.00\t0.00\t0.00",
  "SOLD FINAL:\t\t\t\t\t\t\t",
].join("\n");

// FORMAT B: 2 rows/txn (name row + IDNO row), amounts with space thousands + comma decimal.
export const MAIB_EXCEL_TSV_FORMAT_B = [
  "Titular:\tACME TEST SRL\t\tSold inițial\t0\t",
  "Cod fiscal:\t1099999999999\t\tTotal Intrări:\t207 866,00\t",
  "IBAN::\tMD87AG000000022516065719\t\tTotal Ieșiri:\t0,00\t",
  "Valuta:\tMDL\t\tSold final:\t207 866,00\t",
  "N/O\tData tranzacției\tNo doc\tDate partener\tDetalii plată\tDebit\tCredit",
  "1\t16.05.2024\tFT241377866457\t(R) GAMMA DONOR SRL\tDepunere capital social\t0\t200000",
  "1\t16.05.2024\tFT241377866457\t2014002000786\tDepunere capital social\t0\t200000",
  "2\t17.05.2024\t299\t(R) BETA CLIENT SRL\tPlata pentru servicii conform Factura Nr.224\t0\t7 866,00",
  "2\t17.05.2024\t299\t1009600020033\tPlata pentru servicii conform Factura Nr.224\t0\t7 866,00",
].join("\n");

// A card statement flattens to tab text but has NO recognizable N/O+Debit+Credit rows →
// parser returns []. Used to prove the AI-fallback guard (no 30s timeout on prod).
export const MAIB_CARD_TSV_UNPARSEABLE = [
  "Card account statement\t\t",
  "Date\tMerchant\tAmount",
  "01.04.2025\tSOME SHOP\t-123.45",
].join("\n");
