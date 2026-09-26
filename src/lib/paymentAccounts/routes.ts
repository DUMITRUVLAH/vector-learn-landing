/**
 * CONTPLATA-faza-1 + NAV-02 — unde stă contul de plată.
 *
 * E fila „Cont de plată" din modulul Facturi, montată de două ori: în FinDesk și în CRM (același
 * ecran, meniul din jur îl alege shellul după prefix). Paginile își iau baza din adresa curentă,
 * ca un link din CRM să nu arunce omul în meniul FinDesk și invers.
 */
import { CRM_INVOICING_ROUTES, FIN_INVOICING_ROUTES } from "@/lib/fin/finNav";

export function paymentAccountsBase(path: string): string {
  return path.startsWith("/business/fin") ? FIN_INVOICING_ROUTES.document : CRM_INVOICING_ROUTES.document;
}

/** Contul pornit de pe fișa unui lead — mereu în CRM, acolo trăiește leadul. */
export function newPaymentAccountForLead(leadId: string): string {
  return `${CRM_INVOICING_ROUTES.document}/nou?lead=${encodeURIComponent(leadId)}`;
}
