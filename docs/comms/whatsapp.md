# WhatsApp Business Platform (Cloud API) — integrare

> Sursa: documentația oficială Meta, verificată 2026-09-26. Meta a mutat documentația de la
> `/docs/whatsapp/...` la `/documentation/business-messaging/whatsapp/...`.
> Linkurile complete sunt la final.

## 1. Ce e și ce nu e

- E **API-ul oficial** Meta pentru WhatsApp Business: un număr al firmei trimite și primește mesaje prin servere, nu prin telefon.
- **Nu** e aplicația „WhatsApp Business" de pe telefon. Un număr activ în aplicație trebuie fie mutat pe API, fie conectat în modul **Coexistence** (doar prin Embedded Signup, max 20 msg/s).
- Nu există un „API neoficial" acceptabil. Bibliotecile care emulează WhatsApp Web încalcă termenii și duc la ban de număr.

## 2. Regulile care contează pentru CRM

| Regulă | Ce înseamnă | Cum o tratăm |
|---|---|---|
| **Fereastra de 24h** | După ultimul mesaj al clientului ai 24h de text liber. Apoi doar **template aprobat** (eroarea 131047). | Inboxul arată când se închide fereastra. După ea, câmpul de text dispare și rămâne „Alege template". Serverul refuză textul liber cu `window_closed` înainte să cheme Meta. |
| **Template-uri** | Create în WhatsApp Manager, aprobate de Meta. Categorii: `marketing`, `utility`, `authentication`. | `GET /{WABA_ID}/message_templates`: listăm doar cele `APPROVED`, cu parametrii `{{1}}…`. |
| **Preț** (din 1 iulie 2025) | Se plătește **per template livrat**. Mesajele din fereastră sunt gratuite; template-urile *utility* trimise în fereastră sunt gratuite; *marketing* se plătește mereu. | Informativ. Nu blocăm nimic pe cost. |
| **Opt-in** | Poți scrie doar oamenilor care ți-au dat numărul ȘI au acceptat mesaje WhatsApp de la firma ta. | Consimțământul leadului (CRM-101) e verificat la fiecare trimitere. Opt-in-ul pentru WhatsApp se colectează în formularele de captare. |
| **Format număr** | Meta cere `to` **cu `+`** și prefix de țară. Fără `+` se prefixează țara FIRMEI, iar mesajul poate ajunge la alt om. | Trimitem `"+" + wa_id`. |
| **Utilizatori cu username** (2026) | Webhook-ul poate veni **fără număr de telefon**, doar cu un BSUID (`US.1349…`). | Contactul se identifică după `wa_id` sau, în lipsă, după BSUID. Trimiterea către BSUID folosește câmpul `recipient`. |
| **Statusuri** | `sent → delivered → read` sau `failed`, pot veni în orice ordine. | Statusul doar înaintează (un „delivered" venit după „read" e ignorat). |
| **Limite** | 80 msg/s per număr. Mesaje inițiate în afara ferestrei: 250 → 2.000 → 10.000 → 100.000 → nelimitat utilizatori unici/24h, per portofoliu. | Mult peste volumul unui CRM. |

## 3. Ce trebuie să facă owner-ul (modul A: numărul propriu, token lipit)

Acesta e modul implementat acum: fiecare workspace își lipește propriile credențiale.

1. **Business portfolio (Meta Business Manager)**: `business.facebook.com`. Verifică firma (**Business Verification**). Verificarea deblochează limita de 2.000 de conversații inițiate/zi și până la 20 de numere.
2. **Aplicația Meta**: `developers.facebook.com` → *My Apps* → *Create App* → cazul de utilizare **„Connect with customers through WhatsApp"**, legată de portofoliu.
3. **Numărul**: *WhatsApp → API Setup → Add phone number*.
   - Numărul **nu** trebuie să fie activ în aplicația WhatsApp. Dacă e, șterge contul de WhatsApp de pe el sau folosește Coexistence.
   - Trebuie să poată primi SMS sau apel pentru OTP.
   - Numerele scurte nu sunt acceptate.
   - Numele afișat (*display name*) trebuie aprobat de Meta.
4. **Metoda de plată** în WhatsApp Manager (pentru template-uri).
5. **Tokenul permanent**:
   - *Business Settings → Users → System Users → Add* (rol Admin).
   - *Assign assets* → aplicația → *Manage app*.
   - Apoi *Generate token* → aplicația → expirare **Never** → bifează `whatsapp_business_messaging`, `whatsapp_business_management` (și `business_management`).
   - Tokenul „temporar" din *API Setup* expiră în câteva ore, deci **nu** îl folosi.
6. Copiază din *WhatsApp → API Setup*: **Phone Number ID** și **WhatsApp Business Account ID**.
7. **App Secret**: *App Settings → Basic → App Secret → Show*.
8. În FinFlow: **CRM → Canale de mesaje → WhatsApp → Conectează**. Lipești Access token, Phone Number ID, WABA ID și App Secret.
9. **Pasul manual** (dialogul ți-l arată): *App Dashboard → WhatsApp → Configuration → Webhook → Edit*:
   - **Callback URL** = cel afișat (`https://<domeniu>/api/comms/webhooks/whatsapp/<secret>`).
   - **Verify token** = cel afișat.
   - *Verify and save*, apoi la **Webhook fields** → *Subscribe* la **`messages`**.
10. Dacă numărul e nou pe API: `POST /{PHONE_NUMBER_ID}/register` cu `{"messaging_product":"whatsapp","pin":"123456"}`. Se face o dată; *API Setup* te ghidează.
11. Creează cel puțin un **template utility** (ex. „Bună, {{1}}! Revin la discuția despre {{2}}.") ca să poți relua conversațiile după 24h.

**Ce ne dai:** Access token (System User), Phone Number ID, WABA ID, App Secret. Le lipești chiar
tu în aplicație; nu trebuie trimise pe chat sau email.

## 4. Cum funcționează tehnic

### Conectare
`GET https://graph.facebook.com/v25.0/{PHONE_NUMBER_ID}?fields=display_phone_number,verified_name,quality_rating`
cu `Authorization: Bearer <token>`. Dacă Meta răspunde, credențialele sunt valide. Fără App Secret
conectarea e refuzată, fiindcă fără el nu am putea verifica webhook-urile.

### Webhook
- **Handshake (GET):** Meta trimite `hub.mode=subscribe&hub.verify_token=…&hub.challenge=…`. Răspundem `200` cu `hub.challenge` doar dacă tokenul e cel al canalului, altfel `403`.
- **Mesaje (POST):** verificăm `X-Hub-Signature-256: sha256=<hex>` = HMAC-SHA256(App Secret, **corpul brut**) înainte de orice parsare.
- Meta reîncearcă orice non-200 până la **7 zile**. Deduplicăm pe `wamid` (index unic).
- Un POST poate grupa schimbări pentru mai multe numere. Le împărțim după `metadata.phone_number_id` și dăm fiecare parte canalului ei.

```json
{ "object": "whatsapp_business_account",
  "entry": [{ "id": "<WABA_ID>", "changes": [{ "field": "messages", "value": {
    "metadata": { "display_phone_number": "15550783881", "phone_number_id": "106540352242922" },
    "contacts": [{ "profile": { "name": "Sheena Nelson" }, "wa_id": "16505551234", "user_id": "US.13491208655302741918" }],
    "messages": [{ "from": "16505551234", "id": "wamid.HBgL...", "timestamp": "1749416383",
                   "type": "text", "text": { "body": "Does it come in another color?" } }],
    "statuses": [{ "id": "wamid...", "status": "delivered", "timestamp": "1751142888", "recipient_id": "16505551234" }]
  }}]}]}
```

Tipuri primite tratate: text, image, video, audio, document, sticker, location, contacts,
button, interactive (răspuns la butoane/liste) și reaction. Orice alt tip apare ca „[mesaj … nesuportat]".

### Trimitere
`POST https://graph.facebook.com/v25.0/{PHONE_NUMBER_ID}/messages`

```json
{ "messaging_product": "whatsapp", "recipient_type": "individual", "to": "+37360000000",
  "type": "text", "text": { "preview_url": false, "body": "Bună ziua!" },
  "context": { "message_id": "wamid.<citat>" } }
```

Template:

```json
{ "messaging_product": "whatsapp", "to": "+37360000000", "type": "template",
  "template": { "name": "salut_revenire", "language": { "code": "ro" },
    "components": [{ "type": "body", "parameters": [{ "type": "text", "text": "Ion" }, { "type": "text", "text": "panouri" }] }] } }
```

Imagine sau document prin link: `"type": "image", "image": { "link": "https://…", "caption": "…" }`, respectiv
`"document": { "link", "filename", "caption" }`.

Confirmarea de citire (bifele albastre) la deschiderea conversației:
`{ "messaging_product": "whatsapp", "status": "read", "message_id": "<wamid>" }`.

### Fișiere primite
`GET /v25.0/{MEDIA_ID}` → `{ url, mime_type }`, apoi `GET url` **cu același Bearer**.
- URL-ul expiră în **5 minute**, iar media-id-ul din webhook în **7 zile**.
- Serverul face proxy (`/api/comms/inbox/media/:messageId/:i`), deci tokenul nu ajunge în browser.
- Limite: imagine 5 MB, audio și video 16 MB, document 100 MB.

### Coduri de eroare frecvente

| Cod | Sens | Ce facem |
|---|---|---|
| 131047 | au trecut 24h, e nevoie de template | blocăm înainte (`window_closed`) |
| 131026 | destinatarul nu are WhatsApp sau are client vechi | `failed` cu motivul |
| 131050 | clientul a oprit mesajele de marketing | `failed`, nu retrimite |
| 131056 | prea multe mesaje către același om | `failed`, reîncearcă mai târziu |
| 130429 | throughput depășit | `failed` |
| 132000 / 132001 | parametrii template-ului nu se potrivesc / template inexistent în limba aleasă | `failed` |
| 190 | token expirat | reconectare (Schimbă tokenul) |
| 100 | parametru invalid | `failed` |

## 5. Modul B (viitor): Embedded Signup, fiecare client își conectează numărul dintr-un popup

Pentru SaaS cu mulți clienți e varianta corectă, dar cere pași pe partea platformei (FinFlow):

1. FinFlow devine **Tech Provider** (fiecare client plătește Meta cu cardul lui) sau **Solution Partner**.
2. Aplicația FinFlow trece **App Review** cu *Advanced Access* pe `whatsapp_business_management` + `whatsapp_business_messaging`.
3. *Facebook Login for Business* → configurare **Embedded Signup** → `config_id`.
4. Frontend: `FB.login(cb, { config_id, response_type: "code", override_default_response_type: true, extras: { setup: {} } })`. Evenimentul `WA_EMBEDDED_SIGNUP / FINISH` aduce `phone_number_id`, `waba_id`.
5. Backend, **în 30 de secunde**:
   - `GET /oauth/access_token?client_id&client_secret&code` → tokenul clientului;
   - `POST /{WABA_ID}/subscribed_apps`;
   - `POST /{PHONE_NUMBER_ID}/register`.
6. Webhook-ul **aplicației platformei** e deja implementat: `GET/POST /api/comms/webhooks/whatsapp` cu `META_WEBHOOK_VERIFY_TOKEN` și `META_APP_SECRET`, cu rutare după `phone_number_id`.

Variabile de mediu pentru modul B: `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_ES_CONFIG_ID`.

## 6. Linkuri oficiale

- Get started: https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started
- Access tokens: https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens
- Message API: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api
- Text / Image / Document: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/text-messages · …/image-messages · …/document-messages
- Mark as read: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/mark-message-as-read
- Templates: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview
- Webhooks (endpoint): https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint
- Webhook messages / status: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages · …/messages/status
- Webhook override per WABA: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/override
- Business-scoped user IDs: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids/
- Media: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media
- Phone numbers / registration: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers · …/registration
- Pricing: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- Throughput / messaging limits: https://developers.facebook.com/documentation/business-messaging/whatsapp/throughput · …/messaging-limits
- Error codes: https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes
- Opt-in: https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in
- Embedded Signup: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/
- Politica WhatsApp Business: https://whatsappbusiness.com/policy/
- Versiunile Graph API: https://developers.facebook.com/docs/graph-api/changelog
