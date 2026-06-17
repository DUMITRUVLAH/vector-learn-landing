/**
 * EFMD: SIA „e-Factura" Moldova (SFS) — integrare semiautomatizată.
 *
 * Implementează clientul SOAP (BasicHttpBinding + WS-Security UsernameToken)
 * pentru API-ul SFS de la https://api.fisc.md/Service.svc, conform
 * „Ghid de integrare semi-automatizat SIA e-Factura" (Chișinău 2025).
 *
 * Flux semiautomatizat: facturile se TRIMIT prin API (PostInvoices, nesemnate),
 * iar semnarea/anularea/respingerea finală se face manual în web UI-ul SFS de
 * persoanele autorizate. Nu este nevoie de certificat digital în API.
 *
 * Fără credențiale configurate (EFACTURA_MD_USERNAME/PASSWORD) clientul rulează
 * în MOCK MODE: răspunsuri simulate, deterministe, ca tot fluxul să poată fi
 * folosit și testat local cu date de test.
 */

// ─── Statusuri factură în SIA e-Factura (InvoiceStatus) ──────────────────────

export const EFACTURA_MD_STATUS: Record<number, string> = {
  0: "Draft",
  1: "Semnat de Furnizor",
  2: "Refuzat de Cumpărător",
  3: "Acceptat de Cumpărător",
  5: "Anulat de Furnizor",
  6: "Arhivat",
  7: "Trimis la Cumpărător",
  8: "Semnat de Cumpărător",
  10: "Transportat",
};

/** Statutul procesării unei solicitări API (câmpul Status din response). */
export const EFACTURA_MD_REQUEST_STATUS = {
  ACCEPTED: 1,
  SUCCESS: 2,
  ERROR: 3,
} as const;

/** Roluri actor în SIA e-Factura. */
export const EFACTURA_MD_ACTOR = {
  FURNIZOR: 1,
  CUMPARATOR: 2,
  TRANSPORTATOR: 3,
} as const;

// ─── Config ──────────────────────────────────────────────────────────────────

export interface EfacturaMdConfig {
  endpoint: string;
  username: string;
  password: string;
  /** IDNO-ul companiei furnizor (academia). */
  supplierIdno: string;
  /** Contul bancar al furnizorului. */
  supplierBankAccount: string;
  /** true → nu se face niciun apel HTTP, se folosesc răspunsuri simulate. */
  mock: boolean;
}

export function getEfacturaMdConfig(): EfacturaMdConfig {
  const username = process.env.EFACTURA_MD_USERNAME ?? "";
  const password = process.env.EFACTURA_MD_PASSWORD ?? "";
  const forceMock = process.env.EFACTURA_MD_MOCK === "1";
  return {
    endpoint: process.env.EFACTURA_MD_ENDPOINT ?? "https://api-test.fisc.md/Service.svc",
    username,
    password,
    supplierIdno: process.env.EFACTURA_MD_SUPPLIER_IDNO ?? "1002600001257",
    supplierBankAccount: process.env.EFACTURA_MD_BANK_ACCOUNT ?? "22241410046",
    mock: forceMock || !username || !password,
  };
}

// ─── XML helpers ─────────────────────────────────────────────────────────────

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Inversul lui escapeXml — decodează entitățile XML dintr-un conținut text. */
export function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Extrage conținutul text al primului tag `<name>...</name>` (namespace-agnostic). */
export function xmlText(xml: string, name: string): string | null {
  const re = new RegExp(`<(?:[\\w]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w]+:)?${name}>`);
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

/** Extrage toate aparițiile blocului `<name>...</name>` (namespace-agnostic). */
export function xmlBlocks(xml: string, name: string): string[] {
  const re = new RegExp(
    `<(?:[\\w]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w]+:)?${name}>`,
    "g"
  );
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

// ─── Generator XML factură în formatul SFS (NU UBL) ──────────────────────────

export interface SfsInvoiceLine {
  code: string;
  name: string;
  unitOfMeasure: string;
  quantity: number;
  /** Preț unitar fără TVA, în unități monetare (nu cenți). */
  unitPriceWithoutVat: number;
  /** Cota TVA în procente (Moldova standard: 20). */
  vatRate: number;
}

export interface SfsInvoiceInput {
  supplierIdno: string;
  supplierBankAccount: string;
  buyerIdno: string;
  buyerBankAccount?: string;
  deliveryDate: Date | string;
  lines: SfsInvoiceLine[];
  /** Identificatorul intern (AdditionalInformation/id) — îl folosim la reconciliere. */
  internalId: string;
}

export interface SfsLineTotals {
  totalWithoutVat: number;
  totalVat: number;
  totalWithVat: number;
}

export function computeLineTotals(line: SfsInvoiceLine): SfsLineTotals {
  const totalWithoutVat = +(line.quantity * line.unitPriceWithoutVat).toFixed(2);
  const totalVat = +((totalWithoutVat * line.vatRate) / 100).toFixed(2);
  const totalWithVat = +(totalWithoutVat + totalVat).toFixed(2);
  return { totalWithoutVat, totalVat, totalWithVat };
}

/**
 * Generează XML-ul facturii în formatul proprietar SFS
 * (<Documents><Document><SupplierInfo>…), conform §5.12 din ghid.
 */
export function generateSfsInvoiceXml(input: SfsInvoiceInput): string {
  const date = input.deliveryDate instanceof Date ? input.deliveryDate : new Date(input.deliveryDate);
  const deliveryIso = date.toISOString();

  const rows = input.lines
    .map((line) => {
      const t = computeLineTotals(line);
      return (
        `        <Row Code="${escapeXml(line.code)}" Name="${escapeXml(line.name)}"` +
        ` UnitOfMeasure="${escapeXml(line.unitOfMeasure)}" Quantity="${line.quantity}"` +
        ` UnitPriceWithoutTVA="${line.unitPriceWithoutVat.toFixed(2)}"` +
        ` TotalPriceWithoutTVA="${t.totalWithoutVat.toFixed(2)}"` +
        ` TVA="${line.vatRate}" TotalTVA="${t.totalVat.toFixed(2)}"` +
        ` TotalPrice="${t.totalWithVat.toFixed(2)}" />`
      );
    })
    .join("\n");

  const buyerBank = input.buyerBankAccount
    ? `<BankAccount Account="${escapeXml(input.buyerBankAccount)}" />`
    : "";

  return `<Documents>
  <Document>
    <SupplierInfo>
      <DeliveryDate>${deliveryIso}</DeliveryDate>
      <Supplier IDNO="${escapeXml(input.supplierIdno)}"><BankAccount Account="${escapeXml(input.supplierBankAccount)}" /></Supplier>
      <Buyer IDNO="${escapeXml(input.buyerIdno)}">${buyerBank}</Buyer>
      <Merchandises>
${rows}
      </Merchandises>
    </SupplierInfo>
    <AdditionalInformation><id>${escapeXml(input.internalId)}</id></AdditionalInformation>
  </Document>
</Documents>`;
}

// ─── SOAP envelope + transport ───────────────────────────────────────────────

// WS-Security namespaces — the exact OASIS URIs WCF emits for a
// basicHttpBinding + TransportWithMessageCredential UserNameToken (ghid pag. 5).
const WSSE_NS =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";
const WSU_NS =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd";
const PASSWORD_TEXT_TYPE =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText";

/** ISO-8601 UTC with milliseconds + trailing Z, as WCF emits in wsu:Timestamp. */
function wsuTime(d: Date): string {
  return d.toISOString().replace(/(\.\d{3})\d*Z$/, "$1Z");
}

/**
 * Builds the SOAP 1.1 envelope WCF produces for TransportWithMessageCredential.
 *
 * Earlier code sent a bare `<o:UsernameToken>` with no `wsu` namespace, no
 * `Password Type`, and no `wsu:Timestamp` — the SFS WCF endpoint rejects that
 * with AuthenticationFailedException. This emits the full token WCF expects:
 *   - wsse:Security mustUnderstand="1"
 *   - wsu:Timestamp (Created/Expires, 5 min window)
 *   - wsse:UsernameToken with wsu:Id, Password Type="...#PasswordText"
 */
export function buildSoapEnvelope(
  method: string,
  innerXml: string,
  username: string,
  password: string,
  now: Date = new Date()
): string {
  const created = wsuTime(now);
  const expires = wsuTime(new Date(now.getTime() + 5 * 60_000));
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:u="${WSU_NS}">
  <s:Header>
    <o:Security s:mustUnderstand="1" xmlns:o="${WSSE_NS}">
      <u:Timestamp u:Id="_0">
        <u:Created>${created}</u:Created>
        <u:Expires>${expires}</u:Expires>
      </u:Timestamp>
      <o:UsernameToken u:Id="uuid-token-1">
        <o:Username>${escapeXml(username)}</o:Username>
        <o:Password Type="${PASSWORD_TEXT_TYPE}">${escapeXml(password)}</o:Password>
      </o:UsernameToken>
    </o:Security>
  </s:Header>
  <s:Body>
    <${method} xmlns="http://tempuri.org/">
      <request>${innerXml}</request>
    </${method}>
  </s:Body>
</s:Envelope>`;
}

/** Transportul e injectabil ca testele și mock mode să nu facă HTTP real. */
export type SoapTransport = (method: string, envelope: string) => Promise<string>;

async function httpTransport(
  endpoint: string,
  method: string,
  envelope: string
): Promise<string> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: `http://tempuri.org/IService/${method}`,
    },
    body: envelope,
  });
  const text = await res.text();
  if (!res.ok) {
    const fault = xmlText(text, "faultstring") ?? `HTTP ${res.status}`;
    throw new EfacturaMdError(method, fault);
  }
  return text;
}

export class EfacturaMdError extends Error {
  constructor(
    public readonly method: string,
    message: string
  ) {
    super(`e-Factura MD ${method}: ${message}`);
    this.name = "EfacturaMdError";
  }
}

// ─── Mock transport (date de test, determinist) ──────────────────────────────

/**
 * Simulează serverul SFS de test. Comportament:
 *  - PostInvoices: acceptă tot, întoarce TotalInvoicesPosted = nr. documente.
 *  - CheckInvoicesStatus: întoarce InvoiceStatus=7 (Trimis la Cumpărător);
 *    seriile care conțin "REJ" → 2 (Refuzat), "ACC" → 3 (Acceptat).
 *  - PostCanceledInvoices: succes per factură.
 *  - GetTaxpayersInfo: companie de test pentru orice IDNO de 13 cifre.
 */
export function createMockTransport(): SoapTransport {
  return async (method: string, envelope: string): Promise<string> => {
    const now = new Date().toISOString();
    const requestId = xmlText(envelope, "RequestId") ?? "mock-request";

    switch (method) {
      case "PostInvoices": {
        const docCount = (envelope.match(/&lt;Document&gt;|<Document>/g) ?? []).length || 1;
        return `<PostInvoicesResponse><PostInvoicesResult>
          <RequestId>${requestId}</RequestId>
          <TotalInvoices>${docCount}</TotalInvoices>
          <TotalInvoicesPosted>${docCount}</TotalInvoicesPosted>
          <TimeStamp>${now}</TimeStamp>
          <Status>2</Status>
        </PostInvoicesResult></PostInvoicesResponse>`;
      }
      case "CheckInvoicesStatus": {
        const seria = xmlText(envelope, "Seria") ?? "EFMD";
        const number = xmlText(envelope, "Number") ?? "000000001";
        const invoiceStatus = seria.includes("REJ") ? 2 : seria.includes("ACC") ? 3 : 7;
        return `<CheckInvoicesStatusResponse><CheckInvoicesStatusResult>
          <RequestId>${requestId}</RequestId>
          <TimeStamp>${now}</TimeStamp>
          <Status>2</Status>
          <Results><Invoice>
            <Seria>${seria}</Seria><Number>${number}</Number>
            <Status>2</Status><InvoiceStatus>${invoiceStatus}</InvoiceStatus>
            <TimeStamp>${now}</TimeStamp>
          </Invoice></Results>
        </CheckInvoicesStatusResult></CheckInvoicesStatusResponse>`;
      }
      case "PostCanceledInvoices": {
        const seria = xmlText(envelope, "Seria") ?? "EFMD";
        const number = xmlText(envelope, "Number") ?? "000000001";
        return `<PostCanceledInvoicesResponse><PostCanceledInvoicesResult>
          <RequestId>${requestId}</RequestId>
          <TimeStamp>${now}</TimeStamp>
          <Status>2</Status>
          <Results><InvoiceResult>
            <Seria>${seria}</Seria><Number>${number}</Number>
            <Status>2</Status><TimeStamp>${now}</TimeStamp>
          </InvoiceResult></Results>
        </PostCanceledInvoicesResult></PostCanceledInvoicesResponse>`;
      }
      case "GetTaxpayersInfo": {
        const idno = xmlText(envelope, "string") ?? "1002600000000";
        return `<GetTaxpayersInfoResponse><GetTaxpayersInfoResult>
          <RequestId>${requestId}</RequestId>
          <TimeStamp>${now}</TimeStamp>
          <Status>2</Status>
          <Result><Taxpayer>
            <IDNO>${idno}</IDNO>
            <Name>COMPANIE TEST SRL</Name>
            <Address>mun. Chișinău, str. Test 1</Address>
            <TaxpayerType>1</TaxpayerType>
            <IsEFacturaActor>true</IsEFacturaActor>
            <ExistInTaxRegistry>true</ExistInTaxRegistry>
          </Taxpayer></Result>
        </GetTaxpayersInfoResult></GetTaxpayersInfoResponse>`;
      }
      case "SearchInvoices": {
        // Reconciliere: după PostInvoices, căutăm factura după APIeInvoiceId și
        // aflăm seria/numărul atribuite de SFS. Mock: derivăm determinist din id.
        const apiId = xmlText(envelope, "APIeInvoiceId") ?? "";
        const { seria, number } = deriveSfsIdentifier(hashToNumber(apiId));
        return `<SearchInvoicesResponse><SearchInvoicesResult>
          <RequestId>${requestId}</RequestId>
          <TimeStamp>${now}</TimeStamp>
          <Status>2</Status>
          <Results><Invoice>
            <Seria>${seria}</Seria><Number>${number}</Number>
            <Status>2</Status><InvoiceStatus>7</InvoiceStatus>
            <TimeStamp>${now}</TimeStamp>
          </Invoice></Results>
        </SearchInvoicesResult></SearchInvoicesResponse>`;
      }
      case "GetInvoicesContentForPrint": {
        const seria = xmlText(envelope, "Seria") ?? "EFMD";
        const number = xmlText(envelope, "Number") ?? "000000001";
        // "PDF" base64-encoded as a minimal placeholder document.
        const content = Buffer.from(`MOCK-PDF ${seria} ${number}`).toString("base64");
        return `<GetInvoicesContentForPrintResponse><GetInvoicesContentForPrintResult>
          <RequestId>${requestId}</RequestId>
          <TimeStamp>${now}</TimeStamp>
          <Status>2</Status>
          <Results><InvoicePrintResult>
            <Seria>${seria}</Seria><Number>${number}</Number>
            <Status>2</Status><Format>PDF</Format>
            <Content>${content}</Content><TimeStamp>${now}</TimeStamp>
          </InvoicePrintResult></Results>
        </GetInvoicesContentForPrintResult></GetInvoicesContentForPrintResponse>`;
      }
      case "GetInvoicesQRcodes": {
        const seria = xmlText(envelope, "Seria") ?? "EFMD";
        const number = xmlText(envelope, "Number") ?? "000000001";
        const qrPng = Buffer.from(`MOCK-QR ${seria} ${number}`).toString("base64");
        const qrText = `${seria} ${number} Furn-0000000000000 Cump-0000000000000 ` +
          `Suma totala-0.00lei https://efacturatest.sfs.md:443/EFactura.aspx?id=mock`;
        return `<GetInvoicesQRcodesResponse><GetInvoicesQRcodesResult>
          <RequestId>${requestId}</RequestId>
          <TimeStamp>${now}</TimeStamp>
          <Status>2</Status>
          <Result><InvoiceQRCode>
            <Seria>${seria}</Seria><Number>${number}</Number>
            <QRCode>${qrPng}</QRCode><QRCodeText>${escapeXml(qrText)}</QRCodeText>
            <TimeStamp>${now}</TimeStamp>
          </InvoiceQRCode></Result>
        </GetInvoicesQRcodesResult></GetInvoicesQRcodesResponse>`;
      }
      case "GetInvoicesForSigning": {
        return `<GetInvoicesForSigningResponse><GetInvoicesForSigningResult>
          <RequestId>${requestId}</RequestId>
          <TimeStamp>${now}</TimeStamp>
          <Status>2</Status>
          <Results></Results>
        </GetInvoicesForSigningResult></GetInvoicesForSigningResponse>`;
      }
      case "PostInvoicesWithAttachment": {
        // Identic ca PostInvoices, dar acceptă și FileName + FileContent (Base64).
        const docCount = (envelope.match(/&lt;Document&gt;|<Document>/g) ?? []).length || 1;
        return `<PostInvoicesWithAttachmentResponse><PostInvoicesWithAttachmentResult>
          <RequestId>${requestId}</RequestId>
          <TotalInvoices>${docCount}</TotalInvoices>
          <TotalInvoicesPosted>${docCount}</TotalInvoicesPosted>
          <TimeStamp>${now}</TimeStamp>
          <Status>2</Status>
        </PostInvoicesWithAttachmentResult></PostInvoicesWithAttachmentResponse>`;
      }
      case "GetAcceptedInvoices":
      case "GetRejectedInvoices": {
        // Liste pe rol de actor — mock întoarce o singură factură demonstrativă.
        const invoiceStatus = method === "GetRejectedInvoices" ? 2 : 3;
        return `<${method}Response><${method}Result>
          <RequestId>${requestId}</RequestId>
          <TimeStamp>${now}</TimeStamp>
          <Status>2</Status>
          <Results><Invoice>
            <Seria>EFMD</Seria><Number>000000001</Number>
            <Status>2</Status><InvoiceStatus>${invoiceStatus}</InvoiceStatus>
            <TimeStamp>${now}</TimeStamp>
          </Invoice></Results>
        </${method}Result></${method}Response>`;
      }
      case "GetInvoicesBySeriaNumber": {
        const seria = xmlText(envelope, "Seria") ?? "EFMD";
        const number = xmlText(envelope, "Number") ?? "000000001";
        const innerInvoiceXml = escapeXml(`<Documents><Document><AdditionalInformation><id>mock</id></AdditionalInformation></Document></Documents>`);
        return `<GetInvoicesBySeriaNumberResponse><GetInvoicesBySeriaNumberResult>
          <RequestId>${requestId}</RequestId>
          <TimeStamp>${now}</TimeStamp>
          <Status>2</Status>
          <Results><XmlInvoice>
            <Seria>${seria}</Seria><Number>${number}</Number>
            <Status>2</Status><InvoiceStatus>7</InvoiceStatus>
            <XML>${innerInvoiceXml}</XML><TimeStamp>${now}</TimeStamp>
          </XmlInvoice></Results>
        </GetInvoicesBySeriaNumberResult></GetInvoicesBySeriaNumberResponse>`;
      }
      case "GetLogs": {
        const respJson = escapeXml('{"Results":[{"Status":2,"Seria":"EFMD","Number":"000000001"}],"Status":2}');
        return `<GetLogsResponse><GetLogsResult>
          <RequestId>${requestId}</RequestId>
          <TimeStamp>${now}</TimeStamp>
          <Status>2</Status>
          <Results><RequestLog>
            <Username>mock</Username><Method>PostInvoices</Method>
            <StartDateTime>${now}</StartDateTime><EndDateTime>${now}</EndDateTime>
            <Status>2</Status><Response>${respJson}</Response>
          </RequestLog></Results>
        </GetLogsResult></GetLogsResponse>`;
      }
      default:
        throw new EfacturaMdError(method, "metodă nesimulată în mock transport");
    }
  };
}

/** Determinist, stabil hash → întreg pozitiv (pentru numere de factură mock). */
function hashToNumber(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1_000_000_000;
  return h || 1;
}

// ─── Client ──────────────────────────────────────────────────────────────────

export interface PostInvoicesResult {
  requestId: string;
  totalInvoices: number;
  totalInvoicesPosted: number;
  status: number;
  errorMessage: string | null;
}

export interface InvoiceStatusResult {
  seria: string;
  number: string;
  invoiceStatus: number;
  invoiceStatusLabel: string;
  message: string | null;
}

export interface CancelInvoiceResult {
  seria: string;
  number: string;
  ok: boolean;
  message: string | null;
}

export interface TaxpayerInfo {
  idno: string;
  name: string;
  address: string | null;
  taxpayerType: number;
  isEfacturaActor: boolean;
  existsInTaxRegistry: boolean;
}

/** O factură din răspunsurile de listare (GetAccepted/Rejected, SearchInvoices). */
export interface InvoiceListItem {
  seria: string;
  number: string;
  invoiceStatus: number;
  invoiceStatusLabel: string;
  message: string | null;
  /** Conținutul XML al facturii (doar la GetInvoicesBySeriaNumber). */
  xml?: string;
}

/** Un rând de jurnal din GetLogs (§5.7). */
export interface RequestLogItem {
  username: string;
  method: string;
  startDateTime: string | null;
  endDateTime: string | null;
  status: number;
  error: string | null;
  response: string | null;
}

export class EfacturaMdClient {
  private readonly config: EfacturaMdConfig;
  private readonly transport: SoapTransport;

  constructor(config?: Partial<EfacturaMdConfig>, transport?: SoapTransport) {
    this.config = { ...getEfacturaMdConfig(), ...config };
    this.transport =
      transport ??
      (this.config.mock
        ? createMockTransport()
        : (method, envelope) => httpTransport(this.config.endpoint, method, envelope));
  }

  get isMock(): boolean {
    return this.config.mock;
  }

  get supplierIdno(): string {
    return this.config.supplierIdno;
  }

  get supplierBankAccount(): string {
    return this.config.supplierBankAccount;
  }

  private async call(method: string, innerXml: string): Promise<string> {
    const envelope = buildSoapEnvelope(
      method,
      innerXml,
      this.config.username || "mock",
      this.config.password || "mock"
    );
    const responseXml = await this.transport(method, envelope);
    const status = xmlText(responseXml, "Status");
    if (status === String(EFACTURA_MD_REQUEST_STATUS.ERROR)) {
      const message =
        xmlText(responseXml, "ErrorMessage") ?? xmlText(responseXml, "Message") ?? "eroare SFS";
      throw new EfacturaMdError(method, message);
    }
    return responseXml;
  }

  /** §5.12 PostInvoices — trimite XML-ul facturilor (nesemnat) către SFS. */
  async postInvoices(invoicesXml: string, requestId: string): Promise<PostInvoicesResult> {
    const inner =
      `<RequestId>${escapeXml(requestId)}</RequestId>` +
      `<InvoicesXml>${escapeXml(invoicesXml)}</InvoicesXml>` +
      `<ActorRole>${EFACTURA_MD_ACTOR.FURNIZOR}</ActorRole>` +
      `<InvoicesXmlStatus>0</InvoicesXmlStatus>`;
    const xml = await this.call("PostInvoices", inner);
    return {
      requestId: xmlText(xml, "RequestId") ?? requestId,
      totalInvoices: Number(xmlText(xml, "TotalInvoices") ?? 0),
      totalInvoicesPosted: Number(xmlText(xml, "TotalInvoicesPosted") ?? 0),
      status: Number(xmlText(xml, "Status") ?? 0),
      errorMessage: xmlText(xml, "ErrorMessage"),
    };
  }

  /** §5.1 CheckInvoicesStatus — statutul unei facturi după serie+număr. */
  async checkInvoiceStatus(
    seria: string,
    number: string,
    requestId: string
  ): Promise<InvoiceStatusResult | null> {
    const inner =
      `<RequestId>${escapeXml(requestId)}</RequestId>` +
      `<Seria>${escapeXml(seria)}</Seria>` +
      `<Number>${escapeXml(number)}</Number>`;
    const xml = await this.call("CheckInvoicesStatus", inner);
    const block = xmlBlocks(xml, "Invoice")[0];
    if (!block) return null;
    const invoiceStatus = Number(xmlText(block, "InvoiceStatus") ?? 0);
    return {
      seria: xmlText(block, "Seria") ?? seria,
      number: xmlText(block, "Number") ?? number,
      invoiceStatus,
      invoiceStatusLabel: EFACTURA_MD_STATUS[invoiceStatus] ?? `necunoscut (${invoiceStatus})`,
      message: xmlText(block, "Message"),
    };
  }

  /** §5.11 PostCanceledInvoices — anulează o factură transmisă. */
  async cancelInvoice(
    seria: string,
    number: string,
    comment: string,
    requestId: string
  ): Promise<CancelInvoiceResult> {
    const inner =
      `<RequestId>${escapeXml(requestId)}</RequestId>` +
      `<InvoiceComment>` +
      `<Seria>${escapeXml(seria)}</Seria>` +
      `<Number>${escapeXml(number)}</Number>` +
      `<Comment>${escapeXml(comment)}</Comment>` +
      `</InvoiceComment>`;
    const xml = await this.call("PostCanceledInvoices", inner);
    const block = xmlBlocks(xml, "InvoiceResult")[0] ?? xml;
    return {
      seria: xmlText(block, "Seria") ?? seria,
      number: xmlText(block, "Number") ?? number,
      ok: xmlText(block, "Status") === "2",
      message: xmlText(block, "Message"),
    };
  }

  /**
   * §5.9 GetTaxpayersInfo — validare IDNO cumpărător înainte de emitere.
   *
   * Per ghid pag. 22, membrul de request este `String` (array of fiscal codes),
   * nu `FiscalCodes`. Earlier code sent `<FiscalCodes><string>…` which the WCF
   * data contract ignored, returning an empty result for every IDNO.
   */
  async getTaxpayerInfo(idno: string, requestId: string): Promise<TaxpayerInfo | null> {
    const inner =
      `<RequestId>${escapeXml(requestId)}</RequestId>` +
      `<String><string>${escapeXml(idno)}</string></String>`;
    const xml = await this.call("GetTaxpayersInfo", inner);
    const block = xmlBlocks(xml, "Taxpayer")[0];
    if (!block) return null;
    return {
      idno: xmlText(block, "IDNO") ?? idno,
      name: xmlText(block, "Name") ?? "",
      address: xmlText(block, "Address"),
      taxpayerType: Number(xmlText(block, "TaxpayerType") ?? 0),
      isEfacturaActor: xmlText(block, "IsEFacturaActor") === "true",
      existsInTaxRegistry: xmlText(block, "ExistInTaxRegistry") === "true",
    };
  }

  /**
   * §5.15 SearchInvoices — caută factura după identificatorul intern
   * (APIeInvoiceId din AdditionalInformation). Folosit la reconciliere: după
   * PostInvoices, SFS atribuie seria/numărul, pe care le aflăm cu această metodă.
   */
  async searchByApiInvoiceId(
    apiInvoiceId: string,
    requestId: string
  ): Promise<InvoiceStatusResult | null> {
    const inner =
      `<RequestId>${escapeXml(requestId)}</RequestId>` +
      `<ActorRole>${EFACTURA_MD_ACTOR.FURNIZOR}</ActorRole>` +
      `<Parameters><APIeInvoiceId>${escapeXml(apiInvoiceId)}</APIeInvoiceId>` +
      `<InvoiceType>0</InvoiceType></Parameters>`;
    const xml = await this.call("SearchInvoices", inner);
    const block = xmlBlocks(xml, "Invoice")[0];
    if (!block) return null;
    const invoiceStatus = Number(xmlText(block, "InvoiceStatus") ?? 0);
    return {
      seria: xmlText(block, "Seria") ?? "",
      number: xmlText(block, "Number") ?? "",
      invoiceStatus,
      invoiceStatusLabel: EFACTURA_MD_STATUS[invoiceStatus] ?? `necunoscut (${invoiceStatus})`,
      message: xmlText(block, "Message"),
    };
  }

  /**
   * §5.4 GetInvoicesContentForPrint — PDF-ul facturii (Base64) pentru tipărire.
   * Returnează conținutul decodat ca Buffer.
   */
  async getInvoicePdf(
    seria: string,
    number: string,
    requestId: string,
    orientation: "Portrait" | "Landscape" = "Portrait"
  ): Promise<{ seria: string; number: string; pdf: Buffer } | null> {
    const inner =
      `<RequestId>${escapeXml(requestId)}</RequestId>` +
      `<SeriaAndNumbers><InvoiceIndentificator>` +
      `<Seria>${escapeXml(seria)}</Seria><Number>${escapeXml(number)}</Number>` +
      `</InvoiceIndentificator></SeriaAndNumbers>` +
      `<ActorRole>${EFACTURA_MD_ACTOR.FURNIZOR}</ActorRole>` +
      `<Orientation>${escapeXml(orientation)}</Orientation>`;
    const xml = await this.call("GetInvoicesContentForPrint", inner);
    const block = xmlBlocks(xml, "InvoicePrintResult")[0];
    if (!block) return null;
    const content = xmlText(block, "Content");
    if (!content) return null;
    return {
      seria: xmlText(block, "Seria") ?? seria,
      number: xmlText(block, "Number") ?? number,
      pdf: Buffer.from(content, "base64"),
    };
  }

  /**
   * §5.6 GetInvoicesQRcodes — imaginea PNG (Base64) + textul QR pentru o factură.
   */
  async getInvoiceQrCode(
    seria: string,
    number: string,
    requestId: string
  ): Promise<{ seria: string; number: string; pngBase64: string; text: string } | null> {
    const inner =
      `<RequestId>${escapeXml(requestId)}</RequestId>` +
      `<SeriaAndNumbers><InvoiceIndentificator>` +
      `<Seria>${escapeXml(seria)}</Seria><Number>${escapeXml(number)}</Number>` +
      `</InvoiceIndentificator></SeriaAndNumbers>`;
    const xml = await this.call("GetInvoicesQRcodes", inner);
    const block = xmlBlocks(xml, "InvoiceQRCode")[0];
    if (!block) return null;
    return {
      seria: xmlText(block, "Seria") ?? seria,
      number: xmlText(block, "Number") ?? number,
      pngBase64: xmlText(block, "QRCode") ?? "",
      text: xmlText(block, "QRCodeText") ?? "",
    };
  }

  /**
   * §5.13 PostInvoicesWithAttachment — trimite factura + un PDF atașat (Base64,
   * max 10 MB). Aceeași structură ca PostInvoices, plus FileName + FileContent.
   */
  async postInvoicesWithAttachment(
    invoicesXml: string,
    fileName: string,
    fileContentBase64: string,
    requestId: string
  ): Promise<PostInvoicesResult> {
    const inner =
      `<RequestId>${escapeXml(requestId)}</RequestId>` +
      `<InvoicesXml>${escapeXml(invoicesXml)}</InvoicesXml>` +
      `<ActorRole>${EFACTURA_MD_ACTOR.FURNIZOR}</ActorRole>` +
      `<FileName>${escapeXml(fileName)}</FileName>` +
      `<FileContent>${escapeXml(fileContentBase64)}</FileContent>` +
      `<InvoicesXmlStatus>0</InvoicesXmlStatus>`;
    const xml = await this.call("PostInvoicesWithAttachment", inner);
    return {
      requestId: xmlText(xml, "RequestId") ?? requestId,
      totalInvoices: Number(xmlText(xml, "TotalInvoices") ?? 0),
      totalInvoicesPosted: Number(xmlText(xml, "TotalInvoicesPosted") ?? 0),
      status: Number(xmlText(xml, "Status") ?? 0),
      errorMessage: xmlText(xml, "ErrorMessage"),
    };
  }

  /** Parsează o listă de blocuri `<Invoice>` într-un șir de InvoiceListItem. */
  private parseInvoiceList(xml: string, blockName = "Invoice"): InvoiceListItem[] {
    return xmlBlocks(xml, blockName).map((block) => {
      const invoiceStatus = Number(xmlText(block, "InvoiceStatus") ?? 0);
      // Conținutul facturii vine escapat în elementul <XML> — îl decodăm ca să
      // fie XML utilizabil (de-escapat) pentru aplicație.
      const rawXml = xmlText(block, "XML");
      return {
        seria: xmlText(block, "Seria") ?? "",
        number: xmlText(block, "Number") ?? "",
        invoiceStatus,
        invoiceStatusLabel: EFACTURA_MD_STATUS[invoiceStatus] ?? `necunoscut (${invoiceStatus})`,
        message: xmlText(block, "Message"),
        xml: rawXml ? unescapeXml(rawXml) : undefined,
      };
    });
  }

  /** §5.2 GetAcceptedInvoices — facturile emise de furnizor și acceptate. */
  async getAcceptedInvoices(requestId: string): Promise<InvoiceListItem[]> {
    const inner =
      `<RequestId>${escapeXml(requestId)}</RequestId>` +
      `<ActorRole>${EFACTURA_MD_ACTOR.FURNIZOR}</ActorRole>`;
    const xml = await this.call("GetAcceptedInvoices", inner);
    return this.parseInvoiceList(xml);
  }

  /** §5.8 GetRejectedInvoices — facturile respinse de cumpărător. */
  async getRejectedInvoices(requestId: string): Promise<InvoiceListItem[]> {
    const inner =
      `<RequestId>${escapeXml(requestId)}</RequestId>` +
      `<ActorRole>${EFACTURA_MD_ACTOR.FURNIZOR}</ActorRole>`;
    const xml = await this.call("GetRejectedInvoices", inner);
    return this.parseInvoiceList(xml);
  }

  /**
   * §5.3 GetInvoicesBySeriaNumber — facturile (cu conținut XML) după serie+număr.
   */
  async getInvoicesBySeriaNumber(
    identifiers: Array<{ seria: string; number: string }>,
    requestId: string
  ): Promise<InvoiceListItem[]> {
    const items = identifiers
      .map(
        (i) =>
          `<InvoiceIndentificator><Seria>${escapeXml(i.seria)}</Seria>` +
          `<Number>${escapeXml(i.number)}</Number></InvoiceIndentificator>`
      )
      .join("");
    const inner =
      `<RequestId>${escapeXml(requestId)}</RequestId>` +
      `<SeriaAndNumbers>${items}</SeriaAndNumbers>`;
    const xml = await this.call("GetInvoicesBySeriaNumber", inner);
    return this.parseInvoiceList(xml, "XmlInvoice");
  }

  /** §5.7 GetLogs — jurnalul apelurilor API într-un interval de timp. */
  async getLogs(from: Date, to: Date, requestId: string): Promise<RequestLogItem[]> {
    const inner =
      `<RequestId>${escapeXml(requestId)}</RequestId>` +
      `<From>${from.toISOString()}</From>` +
      `<To>${to.toISOString()}</To>`;
    const xml = await this.call("GetLogs", inner);
    return xmlBlocks(xml, "RequestLog").map((block) => ({
      username: xmlText(block, "Username") ?? "",
      method: xmlText(block, "Method") ?? "",
      startDateTime: xmlText(block, "StartDateTime"),
      endDateTime: xmlText(block, "EndDateTime"),
      status: Number(xmlText(block, "Status") ?? 0),
      error: xmlText(block, "Error"),
      response: xmlText(block, "Response"),
    }));
  }
}

/**
 * Identificator de factură folosit DOAR în mock mode.
 *
 * În fluxul real semiautomatizat, SFS atribuie Seria + Number la postare; le
 * aflăm ulterior cu `searchByApiInvoiceId` (§5.15). Pe mediul mock nu există
 * server care să atribuie, așa că derivăm determinist o serie/număr stabile.
 * Seria: "EFMD"; numărul: 9 cifre.
 */
export function deriveSfsIdentifier(invoiceNumber: number): { seria: string; number: string } {
  return { seria: "EFMD", number: String(invoiceNumber).padStart(9, "0") };
}
