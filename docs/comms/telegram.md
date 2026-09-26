# Telegram — integrare prin Bot API

> Sursa: core.telegram.org (Bot API 10.3, 24 august 2026), verificată 2026-09-26. Linkurile sunt la final.

## 1. Ce e

Firma are un **bot** Telegram (ex. `@alfa_vanzari_bot`). Clienții îi scriu botului, iar agenții
răspund din inboxul FinFlow; clientul vede răspunsul venind de la bot. Opțional, cu
**Telegram Business**, răspunsul poate pleca **din contul Telegram al firmei**, nu de la bot.

## 2. Regulile care contează

| Regulă | Ce înseamnă | Cum o tratăm |
|---|---|---|
| **Botul nu poate scrie primul** | „Bots can't start conversations with users." Omul trebuie să-i scrie sau să apese Start. | Din fișa leadului, agentul copiază **linkul de invitație** `https://t.me/<bot>?start=<payload>` și îl trimite clientului (SMS, email, WhatsApp, QR pe site). Când clientul apasă Start, conversația apare în inbox deja legată de lead. |
| **Payload deep link** | Max 64 caractere, doar `A-Z a-z 0-9 _ -`. | Payload-ul e `l` + id-ul leadului + o semnătură HMAC: 49 de caractere, nefalsificabil, fără date personale. |
| **Blocare** | Dacă omul blochează botul primim `my_chat_member` cu `status: "kicked"`, iar trimiterile dau 403. | Contactul e marcat blocat și inboxul spune „Clientul a blocat botul". Deblocarea (un mesaj nou) ridică marcajul. |
| **Limite** | ~1 mesaj/s per chat, ~30 mesaje/s per bot. | Volumul unui CRM e mult sub prag. |
| **Fișiere** | Descărcare până la 20 MB, trimitere până la 50 MB (multipart) sau 20 MB (prin URL). | Descărcarea trece prin server; URL-ul conține tokenul botului și nu ajunge în browser. |
| **Telegram Business** | Botul conectat la contul firmei poate răspunde doar în chaturile cu mesaj primit în **ultimele 24h**. | Aceeași regulă de 24h, doar pe conversațiile venite prin Business. |
| **Grupuri** | Nu sunt „un client care ne scrie". | Ignorate. |

## 3. Ce trebuie să facă owner-ul

1. În Telegram, deschide **@BotFather** și trimite `/newbot`.
2. Dă un **nume** (ce vede clientul, ex. „Alfa Academy") și un **username** (5–32 caractere, litere latine, cifre și `_`, terminat în `bot`, ex. `alfa_academy_bot`).
3. BotFather îți dă **tokenul**, de forma `110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw`. Tratează-l ca pe o parolă.
4. Recomandat, tot în BotFather:
   - `/setdescription`: textul văzut înainte de Start („Scrie-ne aici pentru programări și oferte.");
   - `/setuserpic`: logo-ul;
   - `/setjoingroups` → **Disable** (botul e doar pentru discuții 1-la-1).
5. În FinFlow: **CRM → Canale de mesaje → Telegram → Conectează** și lipești tokenul. Aplicația
   verifică tokenul (`getMe`) și își setează singură webhook-ul (`setWebhook`). Nu ai alt pas.
6. **Opțional, răspunsuri din contul firmei (Telegram Business):**
   - BotFather → `/mybots` → botul → *Bot Settings* → **Business Mode** / „Secretary Mode" → On;
   - în aplicația Telegram a contului firmei: *Settings → Telegram Business → Chatbots* → alegi botul, bifezi chaturile și dreptul de a răspunde;
   - Telegram spune oficial că **nu e nevoie de Premium** pentru a conecta un chatbot.
7. **Nu folosi același token în alt serviciu** (Zapier, un bot vechi). Un bot poate avea un singur webhook, iar cine îl setează ultimul primește mesajele.
8. Token scurs? BotFather → `/revoke` → token nou → în FinFlow **Schimbă tokenul**.

**Ce ne dai:** doar tokenul, lipit de tine în aplicație.

## 4. Cum funcționează tehnic

Toate apelurile: `POST https://api.telegram.org/bot<token>/<metodă>`, cu răspunsul
`{ ok, result | description, error_code, parameters.retry_after }`.

### Conectare
1. `getMe` validează tokenul și ne dă `id` (identifică botul unic; nu poate fi conectat în două workspace-uri) și `username`.
2. `setWebhook`:
   ```json
   { "url": "https://<domeniu>/api/comms/webhooks/telegram/<secret>",
     "secret_token": "<secret>",
     "allowed_updates": ["message","edited_message","callback_query","my_chat_member","business_connection","business_message"],
     "drop_pending_updates": true, "max_connections": 40 }
   ```
3. La deconectare: `deleteWebhook`.

### Webhook
- Autenticitatea: antetul `X-Telegram-Bot-Api-Secret-Token` trebuie să fie egal cu `secret_token`, comparat în timp constant. Altfel răspundem 401.
- `secret_token` e un secret **separat** de segmentul din URL. URL-ul e afișat administratorilor și ajunge în loguri; antetul stă doar criptat la noi și la Telegram.
- Telegram reîncearcă orice non-2xx „de un număr rezonabil de ori". Deduplicăm pe **chat + `message_id`**: `message_id` e unic doar în interiorul unui chat, fiindcă fiecare chat privat numără de la 1. Pe Telegram Business cheia include și conexiunea.
- `drop_pending_updates` se folosește doar la prima conectare. La „Testează" sau la schimbarea tokenului, update-urile ținute de Telegram sunt mesajele clienților care n-au ajuns încă.
- Pe Telegram Business se ignoră ce scrie proprietarul contului din telefonul lui. Acela nu e un mesaj de la client.
- Tratăm: text, poze (cea mai mare rezoluție), documente, voce/audio, video, sticker, contact, locație, `callback_query` (butoane), `my_chat_member` (blocare), `business_connection`, `business_message`.
- Numărul de telefon se ia din contact **doar dacă** `contact.user_id == from.id`, adică omul și-a trimis propriul număr. Un contact redirecționat e al altcuiva.

### Trimitere

```json
POST /bot<token>/sendMessage
{ "chat_id": 123456789, "text": "Da, avem locuri!",
  "reply_parameters": { "message_id": 15, "allow_sending_without_reply": true } }
```

- Prin Telegram Business se adaugă `"business_connection_id": "<id>"` (luat din ultimul mesaj primit).
- Fișiere: `sendPhoto` / `sendDocument` / `sendVideo` / `sendAudio` cu URL https și `caption`.

### Fișiere primite
`getFile(file_id)` → `file_path` → `GET https://api.telegram.org/file/bot<token>/<file_path>`
(link valabil minim o oră). Serverul face proxy.

## 5. Idei de folosire

- **Link pe site / în semnătura emailului:** `https://t.me/<bot>`. Oricine scrie devine lead nou automat (dezactivabil per canal).
- **Link personal din fișă** pentru un lead existent: conversația se lipește de fișa lui, nu se creează duplicat.
- **QR** cu linkul personal pe oferta tipărită.

## 6. Linkuri oficiale

- Bot API (toate metodele): https://core.telegram.org/bots/api
- Webhooks (cerințe TLS, porturi 443/80/88/8443, IP-uri): https://core.telegram.org/bots/webhooks
- Funcționalități, BotFather, deep linking, business bots: https://core.telegram.org/bots/features
- FAQ (limite de trimitere): https://core.telegram.org/bots/faq
- Introducere boți: https://core.telegram.org/bots
- Telegram Business: https://core.telegram.org/api/business
- Connected business bots: https://core.telegram.org/api/bots/connected-business-bots
