/**
 * FIN-604: e-Factura UBL 2.1 XML generator (stub)
 *
 * Generates a minimal UBL 2.1 Invoice XML compatible with ANAF SPV Romania.
 * This is a STUB — the XML structure is complete but ANAF submission requires
 * tenant-specific SPV credentials (out-of-scope for FIN-604).
 *
 * Limitation: `supplierCui` and `supplierName` are hardcoded to demo values
 * until tenant_settings gains `cui` + `company_name` columns (future sprint).
 *
 * Reference: CIUS-RO v1.0.1 (https://mfinante.gov.ro/ro/web/efactura/documentatie-tehnica)
 */

export interface InvoiceForUBL {
  invoiceNumber: string;
  issueDate: Date | string;
  dueDate?: Date | string | null;
  amountCents: number;
  currency: string;
  studentName: string;
  notes?: string | null;
  supplierCui?: string;
  supplierName?: string;
}

/**
 * Generates a minimal UBL 2.1 Invoice XML string.
 * Pure function — no side effects.
 */
export function generateUBL21(invoice: InvoiceForUBL): string {
  const issueStr = formatDate(invoice.issueDate);
  const dueStr = invoice.dueDate ? formatDate(invoice.dueDate) : issueStr;
  const totalWithVat = invoice.amountCents / 100;
  const vatRate = 19; // Romania standard VAT
  // Back-calculate: assume amount is VAT-inclusive
  const vatBase = +(totalWithVat / (1 + vatRate / 100)).toFixed(2);
  const vatAmount = +(totalWithVat - vatBase).toFixed(2);

  const supplierCui = invoice.supplierCui ?? "RO12345678";
  const supplierName = invoice.supplierName ?? "VECT SRL";
  const description = invoice.notes ?? "Servicii educationale";

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${escapeXml(invoice.invoiceNumber)}</cbc:ID>
  <cbc:IssueDate>${issueStr}</cbc:IssueDate>
  <cbc:DueDate>${dueStr}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${escapeXml(invoice.currency)}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName>
        <cbc:Name>${escapeXml(supplierName)}</cbc:Name>
      </cac:PartyName>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escapeXml(supplierCui)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName>
        <cbc:Name>${escapeXml(invoice.studentName)}</cbc:Name>
      </cac:PartyName>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${escapeXml(invoice.currency)}">${vatAmount.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${escapeXml(invoice.currency)}">${vatBase.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${escapeXml(invoice.currency)}">${vatAmount.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${vatRate}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${escapeXml(invoice.currency)}">${vatBase.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${escapeXml(invoice.currency)}">${vatBase.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${escapeXml(invoice.currency)}">${totalWithVat.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${escapeXml(invoice.currency)}">${totalWithVat.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${escapeXml(invoice.currency)}">${vatBase.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Description>${escapeXml(description)}</cbc:Description>
      <cbc:Name>${escapeXml(description)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${vatRate}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${escapeXml(invoice.currency)}">${vatBase.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
}

function formatDate(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
