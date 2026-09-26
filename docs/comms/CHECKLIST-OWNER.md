# Ce trebuie să creezi și să ne dai: checklist pe canale

Codul e gata: inboxul, conectarea, webhook-urile și trimiterea funcționează. Fiecare canal
pornește în momentul în care îi lipești credențialele în **CRM → Canale de mesaje**. Tokenurile
se lipesc direct în aplicație, se salvează criptat și nu se mai afișează niciodată. **Nu le
trimite pe chat sau email.**

Până atunci, fiecare canal se poate testa ca **simulat** (bifa din dialogul de conectare, în afara producției).

---

## 0. O singură dată, pe platformă (Vercel), înainte de orice canal real

- [ ] `ENCRYPTION_KEY`: **obligatorie**. Fără ea, tokenurile nu pot fi stocate în producție. (Era deja semnalată ca lipsă la auditul din 29.08.)
- [ ] `APP_URL=https://finflow.best` (sau domeniul final). Webhook-urile trebuie să bată la un URL stabil, nu la unul de preview.
- [ ] `CRON_SECRET`: există deja; noul cron `/api/comms/cron/daily` îl folosește.

## 1. Telegram: cel mai rapid, 5 minute, gratuit

- [ ] @BotFather → `/newbot` → nume + username terminat în `bot`.
- [ ] Copiezi tokenul.
- [ ] FinFlow → Canale → Telegram → Conectează → lipești tokenul. **Gata** (webhook-ul se setează singur).
- [ ] Opțional: `/setdescription`, `/setuserpic`, `/setjoingroups → Disable`.
- [ ] Opțional: Telegram Business (răspunzi din contul firmei), vezi [telegram.md §3](telegram.md).

**Ne dai:** nimic, lipești tu tokenul.

## 2. WhatsApp: 1–3 zile (verificarea firmei la Meta)

- [ ] business.facebook.com: portofoliu + **Business Verification** (acte ale firmei).
- [ ] developers.facebook.com → Create App → „Connect with customers through WhatsApp".
- [ ] API Setup → adaugi numărul (să nu fie activ în aplicația WhatsApp; să primească SMS/apel pentru cod).
- [ ] Display name aprobat și metodă de plată în WhatsApp Manager.
- [ ] System User → token **permanent** cu `whatsapp_business_messaging` + `whatsapp_business_management`.
- [ ] Copiezi: **Access token**, **Phone Number ID**, **WhatsApp Business Account ID**, **App Secret**.
- [ ] FinFlow → Canale → WhatsApp → Conectează → lipești cele 4 valori.
- [ ] **Pas manual în Meta** (dialogul ți-l arată): WhatsApp → Configuration → Webhook → Callback URL + Verify token → *Verify and save* → abonezi câmpul **`messages`**.
- [ ] Creezi cel puțin un **template utility** în WhatsApp Manager, pentru mesajele de după 24h.

**Ne dai:** nimic, lipești tu valorile. Detalii: [whatsapp.md](whatsapp.md).

## 3. Gmail: depinde de varianta aleasă

**Decizia ta:** cine își conectează Gmail-ul?
- **Doar oamenii firmei tale, cu Google Workspace:** varianta *Internal*, fără verificare Google. Recomandat acum.
- **Un client-pilot:** varianta *Testing*, max 100 de utilizatori, dar reconectare la 7 zile.
- **Toți clienții FinFlow:** verificare Google + evaluare CASA (săptămâni–luni).

- [ ] Google Cloud Console: proiect, activezi **Gmail API**.
- [ ] Google Auth Platform: Branding (domeniu, privacy policy), Audience (Internal/External), Data Access (scope-urile din [gmail.md §2](gmail.md)).
- [ ] Client OAuth tip **Web application**, cu redirect URI `https://finflow.best/api/comms/gmail/oauth/callback`.
- [ ] În Vercel: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`.
- [ ] Opțional, pentru timp real: Pub/Sub, cu comenzile din [gmail.md §3.6](gmail.md), plus `GMAIL_PUBSUB_TOPIC`, `GMAIL_PUSH_AUDIENCE`, `GMAIL_PUSH_SA_EMAIL`.
- [ ] Fiecare agent: Canale → **Conectează cu Google**.

**Ne dai:** Client ID + Client Secret, puse direct în Vercel (sau mi le spui și le pun eu cu `vercel env add`).

## 4. Viber: plătit, prin contract

- [ ] Decizia: merită? Abonamentul e **~115 EUR/lună**, iar mesajele inițiate de bot costă 0,0138 EUR în MD. Răspunsurile în 24h sunt gratuite.
- [ ] Aplici: forbusiness.viber.com (formular) sau un partener (ex. SMSBAT, MSTAT pentru MD).
- [ ] După contract: Viber → Settings → Bots → Edit Info → **„Your app key"**.
- [ ] FinFlow → Canale → Viber → Conectează → lipești tokenul (+ numele expeditorului, max 28 de caractere). Webhook-ul se setează singur.
- [ ] Dacă firma are deja un bot Viber creat **înainte de februarie 2024**: e pe modelul vechi gratuit, deci doar lipești tokenul.

**Ne dai:** nimic, lipești tu tokenul. Detalii: [viber.md](viber.md).

---

## După conectare: cum verifici că merge

1. Scrie tu, de pe telefonul personal, pe canalul conectat (WhatsApp la numărul firmei, Telegram și Viber la bot, un email de la o adresă care e lead).
2. **CRM → Mesaje**: conversația trebuie să apară în câteva secunde (Gmail: la deschiderea paginii).
3. Răspunde din inbox și verifică pe telefon că a ajuns.
4. Deschide fișa leadului: în „Activitate" apar ambele mesaje.
5. Dacă nu apare nimic: **Canale → Jurnal** pe canal. Ghidul de depanare e în [README.md §9](README.md).
