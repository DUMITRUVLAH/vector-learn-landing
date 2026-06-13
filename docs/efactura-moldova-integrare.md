# Integrare SIA „e-Factura" Moldova (SFS) — Vector Learn

> Document de integrare pentru modulul **EFMD** (e-Factura Moldova).
> Varianta **semiautomatizată**, conform *Ghidului de integrare semi-automatizat
> SIA „e-Factura", Chișinău 2025*.
> Cod sursă: [`server/lib/efacturaMoldova.ts`](../server/lib/efacturaMoldova.ts),
> rute în [`server/routes/invoices.ts`](../server/routes/invoices.ts).
> PR: [#144](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/144).

---

## 1. Rezumat

Vector Learn transmite facturile fiscale către SIA „e-Factura" (SFS, Republica
Moldova) prin API, în varianta **semiautomatizată**:

- Facturile se **trimit prin API, nesemnate** (`PostInvoices`, `InvoicesXmlStatus=0`).
- **Semnarea, anularea sau respingerea finală se fac manual** în interfața web a
  SFS de către persoanele autorizate.
- **Nu este nevoie de certificat digital** în momentul transmiterii prin API —
  autentificarea se face cu username + parolă (utilizator API).

> Aceasta este integrarea pentru **Moldova (SFS, `api.fisc.md`)** și este
> distinctă de stub-ul UBL 2.1 pentru **România (ANAF)** din
> [`server/lib/efactura.ts`](../server/lib/efactura.ts). Cele două nu trebuie
> confundate: formatele XML și protocoalele sunt diferite.

---

## 2. Diferențe față de România (ANAF)

| | România (ANAF) | **Moldova (SFS)** |
|---|---|---|
| Standard XML | UBL 2.1 / CIUS-RO | **format propriu SFS** (`Documents/Document`) |
| Protocol | REST (OAuth2) | **SOAP / WCF BasicHttpBinding** |
| Autentificare | certificat SPV | **username + parolă** (WS-Security UsernameToken) |
| Semnare la trimitere | obligatorie | **nu** — semnare manuală ulterioară în web |
| Endpoint test | mfinante.gov.ro | `https://api-test.fisc.md/Service.svc` |
| Endpoint prod | mfinante.gov.ro | `https://api.fisc.md/Service.svc` |

---

## 3. Arhitectură

```
┌──────────────────────────────────────────────────────────────────┐
│ UI (InvoicesPage)                                                  │
│   buton „e-Fact MD"  ·  badge status SFS  ·  buton „Sync"          │
└───────────────┬──────────────────────────────────────────────────┘
                │  src/lib/api/invoices.ts
                ▼
┌──────────────────────────────────────────────────────────────────┐
│ Rute Hono  (server/routes/invoices.ts)                            │
│   POST /api/invoices/:id/efactura-md          → submit             │
│   POST /api/invoices/:id/efactura-md/cancel   → anulare            │
│   POST /api/invoices/efactura-md/sync         → status refresh     │
│   GET  /api/invoices/efactura-md/taxpayer/:idno → validare IDNO    │
└───────────────┬──────────────────────────────────────────────────┘
                │  server/lib/efacturaMoldova.ts
                ▼
┌──────────────────────────────────────────────────────────────────┐
│ EfacturaMdClient                                                  │
│   ├─ generateSfsInvoiceXml()  → XML format SFS                     │
│   ├─ buildSoapEnvelope()      → SOAP + WS-Security                 │
│   └─ transport:                                                    │
│        - httpTransport  → fetch către SFS (cu credențiale)         │
│        - createMockTransport → răspunsuri simulate (fără cred.)    │
└──────────────────────────────────────────────────────────────────┘
```

SOAP-ul este implementat cu `fetch` nativ + parsing XML (regex, testat) —
**zero dependențe externe adăugate**.

---

## 4. Mock mode (date de test)

Clientul intră **automat în MOCK MODE** când lipsesc `EFACTURA_MD_USERNAME` sau
`EFACTURA_MD_PASSWORD` (sau dacă `EFACTURA_MD_MOCK=1`). În mock mode:

- nu se face niciun apel HTTP real;
- răspunsurile sunt simulate determinist;
- tot fluxul (submit → sync → cancel) funcționează local cu date de test.

Convenții de test în mock:

| Intrare | Rezultat simulat |
|---|---|
| `PostInvoices` | acceptă tot; `TotalInvoicesPosted` = nr. documente |
| `CheckInvoicesStatus`, serie normală | `InvoiceStatus = 7` (Trimis la Cumpărător) |
| serie ce conține `REJ` | `InvoiceStatus = 2` (Refuzat) |
| serie ce conține `ACC` | `InvoiceStatus = 3` (Acceptat) |
| `GetTaxpayersInfo` | „COMPANIE TEST SRL", actor e-Factura |

---

## 5. Configurare

### 5.1 Variabile de mediu (`.env`)

```bash
# Fără username+password → MOCK MODE.
EFACTURA_MD_ENDPOINT=https://api-test.fisc.md/Service.svc   # prod: https://api.fisc.md/Service.svc
EFACTURA_MD_USERNAME=                  # utilizatorul API creat în SFS
EFACTURA_MD_PASSWORD=                  # parola utilizatorului API
EFACTURA_MD_SUPPLIER_IDNO=             # IDNO-ul academiei (furnizor)
EFACTURA_MD_BANK_ACCOUNT=             # contul bancar al furnizorului
# EFACTURA_MD_MOCK=1                    # forțează mock chiar și cu credențiale
```

### 5.2 Crearea utilizatorului API în SFS

Funcție disponibilă doar pentru rolul **Manager (Director)** în SFS:

1. SFS web → **Setări**
2. → **Utilizatorii companiei**
3. → **CREEAZĂ UN UTILIZATOR API** (Register API user)
4. Completează câmpurile obligatorii, rol **API User**, → **Register**
5. Username + parola → în `EFACTURA_MD_USERNAME` / `EFACTURA_MD_PASSWORD`

---

## 6. Fluxul complet

```
1. Manager apasă „e-Fact MD" pe o factură emisă/plătită
        │
        ▼
   POST /api/invoices/:id/efactura-md
        ├─ generează XML format SFS (TVA 20%, suma considerată cu TVA inclus)
        ├─ PostInvoices (nesemnat) → SFS confirmă
        └─ salvează efactura_md_seria/number/status=0(Draft)/request_id
        │
        ▼
2. Manager intră în web-ul SFS și SEMNEAZĂ factura manual
        │  (status: 0 Draft → 1 Semnat Furnizor → 7 Trimis la Cumpărător)
        ▼
3. Periodic / la cerere: POST /api/invoices/efactura-md/sync
        └─ CheckInvoicesStatus pentru facturile ne-terminale → update status
        │
        ▼
4. Cumpărătorul acceptă/respinge în web-ul SFS
        │  (status → 3 Acceptat  sau  2 Refuzat)
        ▼
5. (opțional) anulare: POST /api/invoices/:id/efactura-md/cancel
        └─ PostCanceledInvoices → status 5 Anulat de Furnizor
```

Statusuri terminale (nu mai necesită sync): **2** (Refuzat), **3** (Acceptat),
**5** (Anulat), **6** (Arhivat).

---

## 7. Statusurile facturii în SFS (`InvoiceStatus`)

| Cod | Semnificație |
|---|---|
| 0 | Draft |
| 1 | Semnat de Furnizor |
| 2 | Refuzat de Cumpărător |
| 3 | Acceptat de Cumpărător |
| 5 | Anulat de Furnizor |
| 6 | Arhivat |
| 7 | Trimis la Cumpărător |
| 8 | Semnat de Cumpărător |
| 10 | Transportat (confirmare primire bunuri/servicii) |

(Codurile 4 și 9 nu există în SFS.)

---

## 8. Formatul XML al facturii (SFS, NU UBL)

```xml
<Documents>
  <Document>
    <SupplierInfo>
      <DeliveryDate>2026-06-12T00:00:00.000Z</DeliveryDate>
      <Supplier IDNO="1002600001257"><BankAccount Account="22241410046" /></Supplier>
      <Buyer IDNO="1002600003354"></Buyer>
      <Merchandises>
        <Row Code="1" Name="Servicii educaționale — Ana Popescu"
             UnitOfMeasure="buc" Quantity="1"
             UnitPriceWithoutTVA="500.00" TotalPriceWithoutTVA="500.00"
             TVA="20" TotalTVA="100.00" TotalPrice="600.00" />
      </Merchandises>
    </SupplierInfo>
    <AdditionalInformation><id>VECT-2026-0001</id></AdditionalInformation>
  </Document>
</Documents>
```

- TVA standard Moldova: **20%**.
- Suma facturii (`amountCents`) este considerată **cu TVA inclus**; baza =
  `total / (1 + cota/100)`.
- `AdditionalInformation/id` = numărul intern al facturii Vector Learn — folosit
  la reconciliere (`APIeInvoiceId` în `SearchInvoices`).

---

## 9. Endpoint-uri API (Vector Learn)

Toate sub `/api/invoices`, protejate cu `requireAuth`, scoped pe tenant.

### `POST /:id/efactura-md`

Transmite factura la SFS (nesemnată).

Body (toate opționale):
```json
{ "buyerIdno": "1002600003354", "vatRate": 20 }
```

Răspuns (200):
```json
{
  "ok": true, "seria": "EFMD", "number": "000000001",
  "requestId": "…", "mock": true,
  "invoiceStatus": 0, "invoiceStatusLabel": "Draft",
  "message": "Transmis în mod TEST (mock) — …"
}
```

Erori: `404 not_found`, `409 invoice_cancelled`, `409 already_submitted`,
`502 sfs_error` / `sfs_rejected`.

### `POST /efactura-md/sync`

Re-verifică statusul tuturor facturilor transmise ne-terminale.

```json
{ "checked": 1, "synced": 1, "mock": true,
  "items": [ { "id":"…","seria":"EFMD","number":"000000001",
               "invoiceStatus":7,"invoiceStatusLabel":"Trimis la Cumpărător" } ] }
```

### `POST /:id/efactura-md/cancel`

```json
{ "comment": "Anulare — eroare de emitere" }
```
→ `{ "ok": true, "mock": true, "invoiceStatusLabel": "Anulat de Furnizor" }`

### `GET /efactura-md/taxpayer/:idno`

Validare IDNO cumpărător (13 cifre) înainte de emitere.
```json
{ "idno":"1002600004030","name":"COMPANIE TEST SRL","address":"…",
  "taxpayerType":1,"isEfacturaActor":true,"existsInTaxRegistry":true,"mock":true }
```
Erori: `400 invalid_idno`, `404 not_found`, `502 sfs_error`.

---

## 10. Model de date

Migrare [`drizzle/0115_efactura_moldova.sql`](../drizzle/0115_efactura_moldova.sql),
coloane noi pe `invoices`:

| Coloană | Tip | Descriere |
|---|---|---|
| `efactura_md_seria` | varchar(20) | Seria atribuită la SFS |
| `efactura_md_number` | varchar(30) | Numărul atribuit la SFS |
| `efactura_md_status` | integer | Status SFS curent (vezi §7) |
| `efactura_md_request_id` | varchar(64) | RequestId-ul transmiterii (reconciliere) |
| `efactura_md_submitted_at` | timestamptz | Data transmiterii |
| `efactura_md_message` | text | Ultimul mesaj/eroare de la SFS |

---

## 11. Metode SFS implementate vs. disponibile

Din cele 15 metode ale API-ului SFS, sunt implementate cele necesare fluxului:

| Metodă SFS | Implementat | Folosit pentru |
|---|---|---|
| `PostInvoices` | ✅ | transmitere factură |
| `CheckInvoicesStatus` | ✅ | sync status |
| `PostCanceledInvoices` | ✅ | anulare |
| `GetTaxpayersInfo` | ✅ | validare IDNO cumpărător |
| `GetAcceptedInvoices` | ⏳ | sincronizare batch (extindere viitoare) |
| `GetRejectedInvoices` | ⏳ | alertare respinse (extindere viitoare) |
| `GetInvoicesContentForPrint` | ⏳ | download PDF oficial SFS (viitor) |
| `SearchInvoices` | ⏳ | reconciliere periodică (viitor) |
| `PostInvoicesWithAttachment` | ⏳ | facturi cu PDF atașat (viitor) |
| `GetInvoicesQRcodes`, `GetLogs`, `GetInvoicesBySeriaNumber`, `GetInvoicesForSigning`, `PostAcceptedInvoices`, `PostRejectedInvoices` | ⏳ | după nevoie |

Adăugarea unei metode noi: o metodă nouă în `EfacturaMdClient` + un caz în
`createMockTransport` + o rută (dacă e expusă în UI).

---

## 12. Trecerea pe SFS real (producție)

1. Manager creează utilizator API în SFS (§5.2).
2. Completează `EFACTURA_MD_USERNAME` / `PASSWORD` / `SUPPLIER_IDNO` /
   `BANK_ACCOUNT` în env.
3. Testează întâi pe `EFACTURA_MD_ENDPOINT=https://api-test.fisc.md/Service.svc`.
4. După validare, schimbă endpoint-ul pe `https://api.fisc.md/Service.svc`.

Codul detectează automat prezența credențialelor și iese din mock mode — nu sunt
necesare modificări de cod.

---

## 13. Teste

[`server/__tests__/efacturaMoldova.test.ts`](../server/__tests__/efacturaMoldova.test.ts)
— 26 teste: XML escaping, totaluri TVA 20%, generator XML format SFS, SOAP
envelope + WS-Security, fluxul complet pe mock transport, mapa de statusuri (§7),
și gate-uri structurale (migrare/journal, bidirectional schema match,
DB-portability).

Smoke live verificat: login → create invoice → submit → sync (status 7) →
dublu-submit (409) → cancel (status 5).
