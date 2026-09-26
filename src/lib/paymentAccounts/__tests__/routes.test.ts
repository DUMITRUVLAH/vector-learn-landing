/**
 * CONTPLATA + NAV-02: contul de plată e fila din modulul Facturi, în CRM și în FinDesk.
 */
import { describe, it, expect } from "vitest";
import { newPaymentAccountForLead, paymentAccountsBase } from "../routes";

describe("baza contului de plată", () => {
  it("[blocant] din FinDesk rămâi în FinDesk, din CRM (sau oriunde altundeva) în CRM", () => {
    expect(paymentAccountsBase("/business/fin/invoices/document/nou")).toBe("/business/fin/invoices/document");
    expect(paymentAccountsBase("/business/crm/facturi/cont-de-plata")).toBe("/business/crm/facturi/cont-de-plata");
    expect(paymentAccountsBase("")).toBe("/business/crm/facturi/cont-de-plata");
  });

  it("[normal] contul pornit din lead e mereu în CRM", () => {
    expect(newPaymentAccountForLead("l-1")).toBe("/business/crm/facturi/cont-de-plata/nou?lead=l-1");
  });
});
