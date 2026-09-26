# Modulul de comunicare omnicanal — WhatsApp, Telegram, Viber, Gmail

> COMMS-301/302 · construit 2026-09-26 · documentația oficială a fiecărui canal verificată la aceeași dată
> (linkurile sunt în fișierul fiecărui canal).

Clienții scriu pe canalul care le e comod. Modulul adună toate conversațiile într-un singur
inbox (**CRM → Mesaje**), le leagă de lead și trimite răspunsul pe același canal, din aplicație.
Fiecare mesaj, primit sau trimis, apare și în cronologia leadului („Activitate" din fișă).
Leadul are o singură istorie, nu una per canal.

| Document | Pentru cine | Ce găsești |
|---|---|---|
| [CHECKLIST-OWNER.md](CHECKLIST-OWNER.md) | owner | **Ce trebuie să creezi și să ne dai** pentru fiecare canal, în ordine |
| [whatsapp.md](whatsapp.md) | owner + dev | WhatsApp Business Platform (Cloud API, Meta) |
| [telegram.md](telegram.md) | owner + dev | Telegram Bot API (+ Telegram Business) |
| [viber.md](viber.md) | owner + dev | Viber REST Bot API (model comercial din 2024) |
| [gmail.md](gmail.md) | owner + dev | Gmail API, OAuth 2.0 și Pub/Sub |

---

## 1. Ce face, pe scurt

| | WhatsApp | Telegram | Viber | Gmail |
|---|---|---|---|---|
| Cine conectează | admin/manager, o dată pe număr | admin/manager, o dată pe bot | admin/manager, o dată pe bot | **fiecare agent, cutia lui** |
| Cum | token lipit + un pas manual în Meta | token lipit, restul automat | token lipit, restul automat | butonul „Conectează cu Google" (OAuth) |
| Clientul poate scrie primul | da | da | da | da |
| **Noi putem scrie primii** | da, **doar cu template aprobat** | **nu**: clientul trebuie să deschidă botul | **nu**: clientul trebuie să fie abonat | da |
| Limite de timp | 24h text liber după ultimul mesaj al clientului, apoi doar template | fără limită (24h prin Telegram Business) | fără limită pentru abonați | fără limită |
| Cost la furnizor | per template trimis (mesajele din fereastră sunt gratuite) | gratuit | **abonament lunar ~115 EUR + mesaje inițiate de bot** | gratuit (cote Google) |
| Legare de lead | după telefon | deep link semnat din fișă | deep link semnat din fișă | după adresa de email |

---

## 2. Arhitectura

```
 Meta / Telegram / Viber / Google Pub/Sub
        │  webhook HTTPS (semnat)
        ▼
 /api/comms/webhooks/<canal>/<secret>   ← PUBLIC, dar: 1) secretul din URL identifică canalul
        │                                          2) semnătura furnizorului e obligatorie
        │                                          3) totul se scrie în comm_webhook_events (jurnal)
        ▼
 adaptor (server/lib/comms/adapters/<canal>.ts)  → evenimente normalizate
        ▼
 ingest (server/lib/comms/ingest.ts)
   contact ─► lead (deep link / telefon / email / lead nou) ─► conversație ─► mesaj (idempotent)
        │                                                        │
        └──► lead_interactions (cronologia leadului)             └──► notificare responsabilului
        ▼
 Inbox UI  /business/crm/mesaje   ──►  POST /api/comms/inbox/conversations/:id/messages
                                              │  reguli: consimțământ, blocat, 24h WhatsApp, garda email
                                              ▼
                                        adaptor.send()  ──► API-ul furnizorului
```

**Principiul:** un canal nou înseamnă un fișier în `server/lib/comms/adapters/` și o intrare în
`registry.ts`. Ingestul, inboxul și cronologia nu știu nimic despre furnizor.

### Fișierele

| Fișier | Rol |
|---|---|
| `server/db/schema/comms.ts` | tabelele (vezi §3) |
| `drizzle/0195_comms_omnichannel.sql` + `server/db/ensure/comms.ts` | migrarea + heal-ul de pe prod (sync-schema) |
| `server/lib/comms/types.ts` | contractul adaptoarelor (`ChannelAdapter`, evenimente normalizate) |
| `server/lib/comms/adapters/{whatsapp,telegram,viber,gmail}.ts` | traducerea furnizor ↔ model comun |
| `server/lib/comms/ingest.ts` | mesaj primit → contact → lead → conversație → cronologie |
| `server/lib/comms/send.ts` + `rules.ts` | trimiterea și regulile ei |
| `server/lib/comms/gmailService.ts` | OAuth, refresh token, sincronizare `history.list`, verificare OIDC Pub/Sub |
| `server/lib/comms/deepLink.ts` | payload semnat care leagă un om de pe Telegram/Viber de un lead |
| `server/lib/comms/channelStore.ts` | criptarea secretelor, forma publică a canalului, URL-ul de webhook |
| `server/routes/commsWebhooks.ts` | webhook-urile publice |
| `server/routes/commsChannels.ts` | conectare / test / rotire token / deconectare / jurnal / simulare |
| `server/routes/commsInbox.ts` | inboxul (liste, fir, trimitere, template-uri, fișiere) |
| `server/routes/commsGmail.ts` | OAuth Google + sincronizare la cerere |
| `server/routes/commsCron.ts` | cron zilnic: reînnoiește `watch` Gmail, sincronizare de siguranță, curățare jurnal |
| `src/pages/business/crm/CrmInboxPage.tsx` | **Mesaje** |
| `src/pages/business/crm/CrmChannelsPage.tsx` | **Canale de mesaje** |
| `src/components/crm/LeadChannelsPanel.tsx` | panoul „Mesaje" din fișa leadului |

---

## 3. Modelul de date

| Tabel | Ce ține | Chei importante |
|---|---|---|
| `comm_channels` | un cont conectat (număr WA, bot TG, bot Viber, cutie Gmail) | `credentials_enc` (AES-256-GCM), `webhook_secret` (unic), unic `(kind, external_id)`: același bot nu poate fi în două workspace-uri |
| `comm_contacts` | un om **așa cum îl vede un canal** | unic `(channel_id, external_user_id)`, `lead_id`, `blocked_at` |
| `comm_conversations` | o discuție; pe Gmail una per fir | unic `(channel_id, contact_id, external_thread_id)`, `unread_count`, `last_inbound_at` (fereastra de 24h) |
| `comm_messages` | un mesaj | unic `(channel_id, external_id)`: **idempotența** la re-livrarea webhook-urilor; `status` înaintează doar (`sent → delivered → read`) |
| `comm_webhook_events` | jurnalul brut al webhook-urilor, 14 zile | `signature_ok`, `error`, `processed_at` |

`lead_interactions.type` primește valorile `telegram` și `viber`. WhatsApp și email existau deja.

**De ce tabele noi și nu `messages` (COMM-201):** `messages` e jurnalul trimiterilor AUTOMATE
ale aplicației (notificări, digesturi): un singur sens, fără contact extern, fără fir. Aici e o
conversație în ambele sensuri, cu identificatorul și regulile fiecărui furnizor.

---

## 4. Endpoint-uri

### Publice (furnizori)

| Metodă | Cale | Autentificare |
|---|---|---|
| GET | `/api/comms/webhooks/whatsapp/:secret` | handshake Meta: `hub.verify_token` = secretul canalului |
| POST | `/api/comms/webhooks/whatsapp/:secret` | `X-Hub-Signature-256` = HMAC-SHA256(App Secret, corp brut) |
| GET/POST | `/api/comms/webhooks/whatsapp` | aplicația **platformei** (Embedded Signup): `META_WEBHOOK_VERIFY_TOKEN` / `META_APP_SECRET`; rutare după `phone_number_id` |
| POST | `/api/comms/webhooks/telegram/:secret` | `X-Telegram-Bot-Api-Secret-Token` = secretul canalului |
| POST | `/api/comms/webhooks/viber/:secret` | `X-Viber-Content-Signature` = hex HMAC-SHA256(token bot, corp brut) |
| POST | `/api/comms/webhooks/gmail` | JWT OIDC Pub/Sub (`GMAIL_PUSH_AUDIENCE`) sau `?token=GMAIL_PUSH_TOKEN` |
| GET | `/api/comms/cron/daily` | `Authorization: Bearer CRON_SECRET` (Vercel Cron, 05:00 UTC) |

Un secret necunoscut dă 404, o semnătură greșită dă 401 și nu se scrie nimic în afară de jurnal.
O eroare de bază de date dă 500, ca furnizorul să reîncerce. Re-livrarea nu dublează nimic.

### Cu sesiune (aplicația)

| Metodă | Cale | Drept |
|---|---|---|
| GET | `/api/comms/channels` | oricine din CRM |
| POST | `/api/comms/channels` | `comms.manage` (admin, manager) |
| PATCH / POST `…/credentials` / POST `…/test` / GET `…/events` / POST `…/simulate` | `/api/comms/channels/:id…` | `comms.manage` |
| DELETE | `/api/comms/channels/:id` | `comms.manage`, sau proprietarul cutiei Gmail |
| POST | `/api/comms/gmail/oauth/start` · GET `/oauth/callback` · POST `/sync` | oricine (cutia proprie) |
| GET | `/api/comms/inbox/summary`, `/conversations`, `/conversations/:id`, `/leads/:leadId`, `/channels/:id/templates`, `/media/:messageId/:i` | oricine din CRM |
| POST | `/api/comms/inbox/conversations/:id/messages`, `/start` | oricine din CRM; **refuzat în impersonare** |
| POST/PATCH | `/api/comms/inbox/conversations/:id/read`, `/conversations/:id` | oricine din CRM |

---

## 5. Regulile de trimitere (verificate ÎNAINTE de apelul la furnizor)

1. **Consimțământ retras** (`leads.consent_revoked_at`): se refuză pe orice canal (403 `consent_revoked`).
2. **Contact blocat**: a blocat botul Telegram (`my_chat_member: kicked`) sau s-a dezabonat de la Viber (409 `blocked`).
3. **WhatsApp, fereastra de 24h**: fără un mesaj de la client în ultimele 24h se poate trimite doar
   un template aprobat (409 `window_closed`; altfel Meta ar da eroarea 131047).
4. **Telegram Business**: răspunsul din contul firmei merge doar în 24h de la ultimul mesaj al clientului.
5. **Gmail**: trece prin `emailGuard` (domeniile demo sunt blocate, iar în afara producției nu pleacă email real).
6. Un mesaj care n-a plecat rămâne în conversație cu status `failed` și motivul furnizorului.
   **Nu dispare.**

---

## 6. Securitate și date personale

Deciziile de mai jos vin din revizia de securitate și corectitudine din 2026-09-26. Fiecare are test de regresie în `server/__tests__/comms.routes.test.ts`.

- **Acces:** tot `/api/comms/*` (în afară de webhook-uri și cron) cere acces CRM, ca `/api/crm/*`. Părinții, studenții și oamenii scoși din CRM primesc 403.
- **Webhook WhatsApp per canal:** o semnătură validă cu App Secret-ul unui canal poate atinge **doar numărul acelui canal**. App Secret-ul e dat de client și Meta nu ni-l confirmă. Doar ruta platformei (semnată cu `META_APP_SECRET`) rutează după `phone_number_id`.
- **Gmail:** din cutia unui agent **scrie doar el**. Citirea e comună (sunt doar emailurile leadurilor, pe care cronologia leadului le arată oricum echipei).
- **URL-urile de webhook și verify token-ul** se văd doar de cine are `comms.manage`.

- Tokenurile, App Secret-ul și refresh token-ul Gmail se stochează **doar criptat** (`server/lib/crypto.ts`, AES-256-GCM). Nu apar în niciun răspuns API.
  **Condiție: `ENCRYPTION_KEY` setată în producție.** Fără ea, criptarea refuză să scrie.
- Webhook-urile: segmentul secret de 48 hex din URL plus semnătura furnizorului, comparate în timp constant. Fără secret configurat, cererea se refuză; verificarea nu se sare.
- Un token deja folosit de alt workspace e refuzat **înainte** de a-i muta webhook-ul (`identify` rulează înainte de `setWebhook`).
- Fișierele primite trec prin server (proxy): tokenul botului din URL-ul Telegram și Bearer-ul Meta nu ajung în browser. Se servesc cu `Content-Disposition: attachment` și `nosniff`. Media Viber se descarcă doar de pe `https://*.viber.com`, fără redirect (anti-SSRF).
- **Idempotența:** mesajul, actualizarea conversației și urma din cronologie se scriu într-o singură tranzacție. Legarea unui contact nou de lead e atomică, deci webhook-urile paralele nu creează leaduri duble. Statusurile doar înaintează, printr-un UPDATE condiționat.
- Cererile de webhook respinse se jurnalizează fără corp (doar mărimea).
- **Gmail e cutia personală a agentului.** În CRM intră doar emailurile de la leaduri, de la contacte deja legate sau răspunsurile din fire pornite din CRM. Restul nu se stochează deloc, nici măcar expeditorul. Excepție: pe o cutie comună (office@) se poate bifa „Creează lead din orice email".
- Deep link-ul Telegram/Viber nu conține date personale: e id-ul leadului plus o semnătură HMAC legată de workspace, deci nu poate fi fabricat pentru alt lead.
- Deconectarea unui canal șterge secretele și legătura cu contul extern, dar **păstrează istoricul** conversațiilor (e istoria relației cu clientul). Ștergerea datelor unui lead urmează fluxul GDPR existent.

---

## 7. Variabile de mediu (Vercel)

| Variabilă | Obligatorie | Pentru |
|---|---|---|
| `ENCRYPTION_KEY` | **da** | criptarea tokenurilor tuturor canalelor |
| `APP_URL` | recomandat | URL-ul public stabil (acum `https://finflow.best`). Fără ea se folosește originea cererii, iar un URL de preview moare la următorul deploy |
| `COMMS_WEBHOOK_BASE_URL` | nu | domeniul exact pentru webhook-uri, ex. `https://www.finflow.best`. **De ce contează:** furnizorii NU urmează redirecționări, iar `finflow.best` răspunde 308 → `www.finflow.best`. Fără variabilă, serverul urmează singur redirecționarea când înregistrează webhook-ul (verificat de test) |
| `CRON_SECRET` | da (există deja) | cronul zilnic |
| `WHATSAPP_GRAPH_VERSION` | nu | implicit `v25.0` |
| `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` | doar pentru aplicația platformei (Embedded Signup) | webhook-ul comun al tuturor numerelor |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | pentru Gmail | OAuth |
| `GOOGLE_OAUTH_REDIRECT_URI` | nu | implicit `<APP_URL>/api/comms/gmail/oauth/callback` |
| `GMAIL_PUBSUB_TOPIC` | nu (fără el: sincronizare la deschiderea inboxului + zilnic) | push în timp real |
| `GMAIL_PUSH_AUDIENCE` + `GMAIL_PUSH_SA_EMAIL` | cu Pub/Sub | verificarea OIDC a push-ului |
| `GMAIL_PUSH_TOKEN` | alternativă la OIDC | secret în query string |
| `COMMS_ALLOW_MOCK` | nu | `1` = permite canale simulate și în producție (demo) |

---

## 8. Testare fără chei reale (canale simulate)

În afara producției, în **Canale → Conectează** apare bifa „Canal simulat". Un canal simulat nu
contactează niciun furnizor: trimiterile reușesc local, iar butonul „Simulează mesaj" parcurge
exact drumul unui mesaj real (contact → lead → conversație → cronologie → notificare).

Testele automate:

```bash
LENT_NOLOCK=1 npx vitest run server/lib/comms/__tests__/adapters.test.ts   # 25 — contractul fiecărui furnizor
LENT_NOLOCK=1 npx vitest run server/__tests__/comms.routes.test.ts         # 18 — cap-coadă pe migrările reale
LENT_NOLOCK=1 npx vitest run src/__tests__/comms/omnichannel-inbox.test.tsx # 7 — interfața (acțiunile)
```

---

## 9. Depanare: „clientul zice că a scris și nu apare"

1. **Canale → Jurnal** pe canalul respectiv:
   - **niciun eveniment**: furnizorul nu trimite. WhatsApp: URL-ul sau câmpul `messages` nu e setat în Meta. Telegram/Viber: apasă **Testează**, care re-setează webhook-ul.
   - **„respins"**: semnătura nu trece. WhatsApp: App Secret-ul greșit. Viber/Telegram: tokenul a fost schimbat din afara aplicației, deci trebuie folosit **Schimbă tokenul**.
   - **procesat cu eroare**: mesajul erorii e în jurnal.
2. Gmail: emailul nu era de la un lead, iar regula de confidențialitate l-a ignorat intenționat (§6). Sau cutia cere reconectare: status „Eroare" pe canal.
3. WhatsApp: un număr trimis de Meta, dar necunoscut apare în jurnal ca „numere necunoscute: …". Asta înseamnă că numărul nu e conectat în niciun workspace.

---

## 10. Ce urmează (nu e în această livrare)

- **WhatsApp Embedded Signup**: fiecare client își conectează numărul dintr-un popup Meta, fără token lipit. Cere statut de Tech Provider și App Review (vezi [whatsapp.md §5](whatsapp.md)). Ruta de webhook a platformei e deja pregătită.
- **Upload de fișiere** din inbox. Acum se trimite fișier prin link https; API-ul suportă, interfața încă nu are buton de upload.
- **Coadă de retrimitere** pentru 429/limite de rată (Telegram ~30 msg/s per bot, Meta 80 msg/s per număr). Volumul unui CRM de vânzări e mult sub prag.
- **Păstrarea fișierelor primite în Storage-ul nostru.** Linkurile Viber expiră într-o oră, media WhatsApp în 7 zile.
- **Viber Business Messages** (mesaje către numere de telefon, nu doar abonați). E alt produs, doar prin parteneri (vezi [viber.md §6](viber.md)).
