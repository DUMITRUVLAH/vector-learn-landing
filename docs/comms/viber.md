# Viber — integrare prin REST Bot API

> Sursa: developers.viber.com (REST Bot API 7.3.0), help.viber.com și forbusiness.viber.com,
> verificate 2026-09-26. Linkurile sunt la final.

## 1. ATENȚIE: boturile Viber nu mai sunt gratuite

- **Din 5 februarie 2024, boturile noi se creează doar pe bază de contract comercial.** Aplici la Viber sau la un partener oficial, semnezi contractul și plătești un abonament lunar per bot.
- **Abonament: 115 EUR/lună per bot** (articolul principal și rate card-ul). FAQ-ul încă spune 100 EUR; cifra exactă o confirmă contractul.
- **Mesaje:**
  - în sesiune: **gratuite**, nelimitat. Sesiunea înseamnă 24h de la mesajul clientului.
  - mesajul de bun-venit la deschiderea chatului: **gratuit**.
  - mesajele inițiate de bot în afara sesiunii: **plătite per mesaj livrat**. **Moldova 0,0138 EUR, România 0,0137 EUR.**
- **Boturile create înainte de 5.02.2024** rămân pe modelul vechi (gratuit + 10.000 de mesaje/lună) „până la noi ordine". Dacă firma are deja un bot vechi, se conectează direct.

**Recomandare:** conectează Viber doar dacă o parte importantă din clienți chiar scriu pe Viber
(în Moldova se întâmplă des). Dacă firma vrea doar să **trimită** mesaje pe numere de telefon
(remindere, oferte), produsul potrivit e **Viber Business Messages** (§6), nu botul.

## 2. Regulile care contează

| Regulă | Ce înseamnă | Cum o tratăm |
|---|---|---|
| **Doar abonații** | Botul poate scrie doar oamenilor abonați. Omul se abonează când trimite primul mesaj sau din *Chat info → Receive messages*. | Din fișa leadului, **linkul de invitație** `viber://pa?chatURI=<uri>&context=<payload>`. Când clientul îl deschide, primim `conversation_started` cu `context` și îl legăm de lead. |
| **Dezabonare** | Evenimentul `unsubscribed`; trimiterea dă status 6. | Contactul e marcat, iar inboxul spune „Clientul s-a dezabonat de la bot". |
| **`sender.name` obligatoriu** | Max 28 de caractere, la fiecare mesaj. | Setare pe canal („Numele expeditorului"), implicit numele botului. |
| **Semnătura** | `X-Viber-Content-Signature` = hex HMAC-SHA256(token, **corpul brut**). Un JSON re-serializat nu trece. | Verificăm pe textul brut, înainte de parsare. |
| **`message_token` pe 64 de biți** | `JSON.parse` îl rotunjește (4912661846655238145 → …140). | Îl extragem ca șir din textul brut, înainte de parsare. |
| **Media primite** | URL-urile de imagine/video/fișier **expiră după o oră**. | Linkul se păstrează, dar după o oră descărcarea dă eroare clară. Copierea în Storage e pe lista „ce urmează". |
| **Limite** | Text 7.000 caractere; imagine 1–3 MB; video 26 MB; fișier 50 MB; cerere JSON max 30 KB. | Textul se taie la 7.000. |
| **Reîncercări** | Viber reîncearcă callback-ul de până la 10 ori (10 s … 15 min). | Deduplicare pe `message_token`. |

## 3. Ce trebuie să facă owner-ul

1. **Obține botul:**
   - aplică direct la Viber: https://www.forbusiness.viber.com/en/viber-for-business/ (formularul de pe pagină), sau
   - alege un **partener oficial** din https://www.forbusiness.viber.com/en/messaging-partners/, cu filtrul „Viber Chatbots" și țara Moldova/România.
   - Parteneri care listează Moldova: Abelo, CM.com, Devino Telecom, edna, Infosintez, Kyivstar, Linbots, MessageBird, Messaggio, MSTAT, Nikita Mobile, NTH, Rapporto, SMSBAT, Vonage.
   - Confirmați explicit pentru chatbot: MSTAT, SMSBAT. La ceilalți, verifică pe pagină.
2. Semnezi contractul (EUR, facturare lunară) și alegi numele botului (max 75 de caractere), iconița (JPEG 720×720, ≤512 KB) și categoria.
3. După creare, contul tău Viber e admin al botului. **Tokenul** e la: Viber → *More → Settings → Bots → Edit Info → „Your app key"* (sau în Viber Admin Panel).
4. În FinFlow: **CRM → Canale de mesaje → Viber → Conectează**. Lipești tokenul și, opțional, numele expeditorului (max 28).
   Aplicația verifică tokenul (`get_account_info`) și setează singură webhook-ul (`set_webhook`).
5. Decide politica: **doar răspunsuri** (gratuite în 24h) sau și **mesaje inițiate** (plătite per mesaj).
   Aplicația nu trimite automat mesaje inițiate; orice mesaj pleacă doar când îl scrie un agent.

**Ce ne dai:** tokenul, lipit de tine în aplicație.

## 4. Cum funcționează tehnic

Toate apelurile: `POST https://chatapi.viber.com/pa/<metodă>`, antet `X-Viber-Auth-Token: <token>`,
răspuns `{ status: 0, status_message: "ok", … }`.

### Conectare
1. `get_account_info` → `id`, `uri` (pentru deep link), `name`, `icon`, `subscribers_count`.
2. `set_webhook`:
   ```json
   { "url": "https://<domeniu>/api/comms/webhooks/viber/<secret>",
     "event_types": ["delivered","seen","failed","subscribed","unsubscribed","conversation_started"],
     "send_name": true, "send_photo": true }
   ```
   **În timpul acestui apel** Viber trimite `{"event":"webhook"}` pe URL și cere `200`. De aceea
   rândul canalului e creat înainte de apel, iar ruta răspunde imediat la evenimentul `webhook`.
3. La deconectare: `set_webhook` cu `"url": ""`.

### Callback-uri tratate
- `message`: text, picture, video, file, contact, location, sticker, url;
- `conversation_started`: omul a deschis chatul, eventual cu `context`, deci îl legăm de lead;
- `subscribed` / `unsubscribed`;
- `delivered` / `seen` / `failed`: statusul mesajelor trimise.

### Trimitere

```json
POST /pa/send_message
{ "receiver": "01234567890A=", "min_api_version": 1,
  "sender": { "name": "Alfa Academy" },
  "type": "text", "text": "Bună! Cu ce vă putem ajuta?" }
```

- Imagine: `"type": "picture", "media": "<url .jpg/.png>", "text": "<max 768>"`.
- Alte fișiere se trimit ca link (`"type": "url"`), fiindcă Viber cere mărimea exactă a fișierului.
- Răspunsul are `message_token` (id-ul mesajului) și `billing_status` (5 = mesaj **taxat**). Îl păstrăm pe mesaj.

### Coduri de status

| Cod | Sens |
|---|---|
| 0 | ok |
| 1 | URL de webhook invalid sau nu a răspuns 200 |
| 2 | token invalid |
| 5 | destinatarul nu are Viber |
| 6 | **destinatarul nu e abonat** (trebuie să scrie el primul) |
| 7 / 9 | contul botului blocat / suspendat |
| 10 | webhook nesetat |
| 12 | prea multe cereri |
| 13 | versiunea Viber a destinatarului e prea veche |
| 23 | prag lunar de mesaje gratuite atins |
| 24 | fără sold (bot facturabil) |

Codurile 9, 23 și 24 țin de contract și plăți. Aplicația le arată ca problemă de cont Viber, nu ca eroare a aplicației.

## 5. Idei de folosire

- Linkul de pe site: `viber://pa?chatURI=<uri>`, de preferat ca QR (pe desktop, `viber://` deschide aplicația Viber Desktop).
- Linkul personal din fișă: clientul existent se lipește de fișa lui.

## 6. Viber Business Messages: alt produs

Dacă firma vrea să trimită pe **numărul de telefon** al clientului (fără ca el să fie abonat la
un bot), produsul e **Viber Business Messages**: promoționale, tranzacționale (OTP, remindere) și
conversaționale în 2 sensuri.

- Se vinde **doar prin parteneri/agregatori**; Viber nu oferă un API public pentru el.
- Se plătesc doar mesajele livrate. Partenerul oferă fallback pe SMS și înregistrează profilul de expeditor.
- Integrarea ar fi cu API-ul partenerului ales (ex. edna, Infosintez, SMSBAT). E un canal separat, neinclus acum.

## 7. Linkuri oficiale

- REST Bot API: https://developers.viber.com/docs/api/rest-bot-api/
- Deep links: https://developers.viber.com/docs/tools/deep-links/
- Tastaturi: https://developers.viber.com/docs/tools/keyboards/
- Modelul comercial (115 EUR): https://help.viber.com/hc/en-us/articles/15247629658525-Bot-commercial-model
- FAQ model comercial: https://help.viber.com/hc/en-us/articles/15383950711197-Rakuten-Viber-chatbot-commercial-model-FAQ
- Modelul vechi (boturi dinainte de 2024): https://help.viber.com/hc/en-us/articles/8746671603485-Chatbot-commercial-model-legacy
- Rate card: https://www.forbusiness.viber.com/documents/chatbots.pdf
- Parteneri: https://www.forbusiness.viber.com/en/messaging-partners/
- Aplicare directă: https://www.forbusiness.viber.com/en/viber-for-business/
- Business Messages: https://www.forbusiness.viber.com/en/business-messages/
