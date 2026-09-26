# Gmail — integrare prin Gmail API (OAuth 2.0)

> Sursa: developers.google.com (Gmail API, OAuth 2.0, cote actualizate 1 mai 2026),
> docs.cloud.google.com (Pub/Sub), verificate 2026-09-26. Linkurile sunt la final.

## 1. Ce e

**Fiecare agent își conectează propria cutie** (Gmail sau Google Workspace):
- emailurile trimise din CRM pleacă din adresa lui reală și stau în folderul lui „Trimise";
- răspunsurile clienților apar în inboxul FinFlow, în același fir, și în fișa leadului.

**Confidențialitate:** Gmail e cutia personală a agentului. În CRM intră doar:
- emailurile de la adrese care sunt deja leaduri;
- emailurile de la contacte deja legate de un lead;
- răspunsurile din fire pornite din CRM.

Restul (newslettere, facturi, prieteni) **nu se stochează deloc**. Pe o cutie comună (office@)
se poate bifa „Creează lead din orice email primit".

## 2. Decizia importantă: verificarea Google

Ca să citim răspunsurile, avem nevoie de scope-ul `gmail.readonly`, pe care Google îl clasifică
**restricted**. Din asta rezultă trei variante:

| Variantă | Cine se poate conecta | Verificare | Potrivit pentru |
|---|---|---|---|
| **A. Internal** (proiect în organizația Google Workspace a firmei) | doar conturile din domeniul firmei | **niciuna** | o singură firmă cu Google Workspace: **cea mai rapidă cale** |
| **B. External, Testing** | max **100 de utilizatori-test** adăugați manual | niciuna | pilot. **Tokenurile expiră la 7 zile**, deci agenții trebuie să reconecteze săptămânal |
| **C. External, In production** | orice cont Google | **verificare Google + evaluare de securitate CASA anuală** (săptămâni–luni, cost) | SaaS pentru mulți clienți |

**Recomandare:**
- **acum:** varianta **A** pentru workspace-ul propriu, sau **B** pentru pilotul cu un client;
- **când** Gmail devine funcție vândută tuturor clienților: se pornește dosarul de verificare pentru **C**.

Scope-urile cerute:

```
openid  email  https://www.googleapis.com/auth/gmail.readonly  https://www.googleapis.com/auth/gmail.send
```

(`gmail.metadata` nu citește corpul mesajelor, deci nu ajunge.)

## 3. Ce trebuie să facă owner-ul (o dată, pe platformă)

1. **Google Cloud Console** (console.cloud.google.com): proiect nou, ex. „FinFlow Mail". Pentru varianta A, creează-l în organizația Workspace a firmei.
2. *APIs & Services → Library*: activează **Gmail API** (și **Cloud Pub/Sub API** dacă vrei push în timp real, pasul 6).
3. **Google Auth Platform** (fostul „OAuth consent screen"):
   - *Branding*:
     - numele aplicației „FinFlow";
     - email de suport și logo;
     - **App domain**: home page `https://finflow.best`, privacy policy, terms;
     - **Authorized domains**: `finflow.best` (și domeniul Vercel dacă e altul);
     - contact dezvoltator.
   - *Audience*: **Internal** (A), sau **External** + *Testing* + adaugă utilizatorii-test (B).
   - *Data Access*: adaugă scope-urile de mai sus.
4. *Clients → Create client → **Web application***:
   - **Authorized redirect URI:** `https://<domeniul-app>/api/comms/gmail/oauth/callback`, ex. `https://finflow.best/api/comms/gmail/oauth/callback`;
   - pentru dezvoltare locală, și `http://localhost:3131/api/comms/gmail/oauth/callback`.
5. Copiază **Client ID** și **Client secret** în Vercel:
   ```
   GOOGLE_OAUTH_CLIENT_ID=…apps.googleusercontent.com
   GOOGLE_OAUTH_CLIENT_SECRET=…
   APP_URL=https://finflow.best        # ca redirect-ul să fie stabil
   ```
6. **Opțional: push în timp real (Pub/Sub).** Fără el, mesajele noi se aduc la deschiderea inboxului (max o dată pe minut per cutie) și zilnic prin cron.
   ```bash
   gcloud pubsub topics create gmail-inbound
   gcloud pubsub topics add-iam-policy-binding gmail-inbound \
     --member=serviceAccount:gmail-api-push@system.gserviceaccount.com --role=roles/pubsub.publisher
   gcloud iam service-accounts create gmail-push-invoker
   gcloud pubsub subscriptions create gmail-inbound-push --topic=gmail-inbound \
     --push-endpoint=https://finflow.best/api/comms/webhooks/gmail \
     --push-auth-service-account=gmail-push-invoker@<PROIECT>.iam.gserviceaccount.com \
     --push-auth-token-audience=https://finflow.best/api/comms/webhooks/gmail
   ```
   În Vercel:
   ```
   GMAIL_PUBSUB_TOPIC=projects/<PROIECT>/topics/gmail-inbound
   GMAIL_PUSH_AUDIENCE=https://finflow.best/api/comms/webhooks/gmail
   GMAIL_PUSH_SA_EMAIL=gmail-push-invoker@<PROIECT>.iam.gserviceaccount.com
   ```
   Agentul de serviciu Pub/Sub (`service-<NR_PROIECT>@gcp-sa-pubsub.iam.gserviceaccount.com`) are
   nevoie de rolul *Service Account Token Creator*. Dacă o politică de organizație „Domain restricted
   sharing" blochează adăugarea `gmail-api-push@system.gserviceaccount.com`, fă o excepție pentru acest topic.
7. Fiecare agent: **CRM → Canale de mesaje → Gmail → Conectează cu Google**, apoi alege contul și bifează **toate** permisiunile.

**Ce ne dai:** Client ID și Client Secret, puse direct în Vercel. Opțional, valorile Pub/Sub.

## 4. Cum funcționează tehnic

### OAuth
1. `POST /api/comms/gmail/oauth/start` construiește URL-ul `https://accounts.google.com/o/oauth2/v2/auth` cu:
   - `access_type=offline` și `prompt=consent` (ca Google să dea `refresh_token` și la reconectare);
   - `include_granted_scopes=true`, `login_hint`;
   - **PKCE S256**;
   - `state` semnat HMAC, legat de utilizator și workspace, valabil 10 minute.
2. Google redirecționează la `/api/comms/gmail/oauth/callback?code&state`. Verificăm că `state` e al omului logat, apoi:
   - `POST https://oauth2.googleapis.com/token` (`grant_type=authorization_code` + `code_verifier`);
   - `GET https://openidconnect.googleapis.com/v1/userinfo` pentru adresă.
3. Verificăm că au fost bifate **ambele** scope-uri Gmail (Google permite debifarea). Altfel conectarea e refuzată cu mesaj clar.
4. `refresh_token` se păstrează criptat. `access_token` se reîmprospătează automat cu 2 minute înainte de expirare.
   La `invalid_grant` canalul trece în „Eroare — reconectează". Cauze posibile:
   - acces revocat;
   - parolă schimbată;
   - 6 luni de inactivitate;
   - modul Testing (7 zile);
   - limita de 100 de refresh tokenuri per cont și client.

### Sincronizare
- `users.history.list?startHistoryId=<salvat>&historyTypes=messageAdded&labelId=INBOX`, apoi `users.messages.get?format=full` pentru fiecare mesaj nou.
- **Prima conectare nu importă toată cutia:** doar mesajele din INBOX din ultimele 3 zile (max 20).
- `historyId` expirat (404) duce la același import restrâns.
- Ignorăm: SENT, DRAFT, SPAM, propriile mesaje, `no-reply@`, `mailer-daemon@`.
- Din corpul mesajului se taie citatul („On … wrote:" / „În … a scris:"), ca în inbox să se vadă ce a scris omul acum.
- **Push:** `users.watch` (topic, `labelIds: ["INBOX"]`, `labelFilterBehavior: "INCLUDE"`) expiră în 7 zile, iar cronul zilnic îl reînnoiește.
  - Notificarea Pub/Sub aduce doar `{emailAddress, historyId}` și declanșează sincronizarea.
  - Push-ul e autentificat prin **JWT OIDC**: semnătura RS256 cu cheile Google, `iss`, `aud`, contul de serviciu și `exp`.

### Trimitere
`POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send` cu `{ raw, threadId }`, unde `raw`
e un mesaj RFC 2822 în base64url. Ca răspunsul să rămână în firul clientului:
- același `threadId`;
- subiect „Re: …";
- `In-Reply-To` și `References` = **Message-ID-ul** mesajului primit (nu id-ul Gmail).

Subiectul cu diacritice e codat RFC 2047. CR/LF din câmpuri e eliminat, ca să nu se poată injecta un „Bcc:" ascuns.

### Cote (din 1 mai 2026)
- 6.000 de unități/minut per utilizator.
- Costuri: `messages.send` 100, `messages.get` **20**, `history.list` 2, `watch` 100.
- Limite zilnice de trimitere: **500/zi** pe Gmail personal, **2.000/zi** pe Workspace (500 în perioada de trial).

### Garda de trimitere
Ca emailul din fișă, trimiterea Gmail trece prin `emailGuard`. Domeniile demo sunt blocate, iar în
afara producției nu pleacă email real decât cu `EMAIL_SEND_MODE=on`.

## 5. Linkuri oficiale

- OAuth pentru aplicații web: https://developers.google.com/identity/protocols/oauth2/web-server
- Expirarea refresh tokenurilor: https://developers.google.com/identity/protocols/oauth2#expiration
- PKCE: https://developers.google.com/identity/protocols/oauth2/native-app
- OpenID Connect / userinfo: https://developers.google.com/identity/openid-connect/openid-connect
- Audience / Testing / utilizatori-test: https://support.google.com/cloud/answer/15549945
- Scope-uri Gmail (sensitive/restricted): https://developers.google.com/workspace/gmail/api/auth/scopes
- Verificarea scope-urilor restricted + CASA: https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- Trimitere: https://developers.google.com/workspace/gmail/api/guides/sending
- `messages.send`: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send
- `messages.get`: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get
- Sincronizare: https://developers.google.com/workspace/gmail/api/guides/sync
- `history.list`: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list
- Push / `watch`: https://developers.google.com/workspace/gmail/api/guides/push
- Cote: https://developers.google.com/workspace/gmail/api/reference/quota
- Autentificarea push-ului Pub/Sub: https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions
- Limite de trimitere Workspace: https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace
- Limite Gmail personal: https://support.google.com/mail/answer/22839
