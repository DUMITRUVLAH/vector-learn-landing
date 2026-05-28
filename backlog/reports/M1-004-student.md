```
STUDENT_REVIEW: OK
PARENT_REVIEW: TRUSTS
ID: M1-004

MARIA_FIRST_REACTION: "Misto ca pot schimba intre WhatsApp/Telegram/SMS si vad cum arata, dar bula verde e despre mama, nu despre mine."
CRISTINA_FIRST_REACTION: "In sfarsit vad mockup-ul de WhatsApp cu numele scolii si emailul meu pe el — si scrie clar ca am buton STOP."

VISUAL_APPEAL: cool
NOTIFICATION_CLARITY: clear
APP_PREVIEW_REALISM: real
PRIVACY_FEEL: safe
GAMIFICATION: absent
LANGUAGE_REGISTER: right

FRICTION_POINTS (max 5):
- [major] Butonul/footerul „STOP" e mentionat doar in FAQ — nu apare VIZUAL in WhatsAppBubble/EmailPreview. Cristina vrea sa-l VADA in mockup, nu sa citeasca despre el.
- [major] Lipseste un exemplu de notificare push pentru Maria (kid-friendly: „Tema la engleza in 1h" sau „Ai luat 9 la quiz!"). Sectiunea „Notificari push" e doar bullets, fara preview iOS/Android lockscreen.
- [major] Limita anti-spam „max 3 mesaje/elev/saptamana" e ingropata in bullet 3 al sectiunii Automatizari — ar trebui badge vizibil langa fiecare preview de mesaj.
- [minor] Email preview foloseste „cristina.popescu@gmail.com" hardcodat — fain pentru persona, dar nu apare nicaieri „nu vindem datele tale" / link la politica de confidentialitate in footer-ul mockup-ului.
- [minor] SMS preview nu arata textul „STOP la 1234 pentru opt-out" — exact formatul legal pe care Cristina il cauta.

WINS (max 3):
- Mockup WhatsApp e foarte realist: header cu avatar VL, „Lingua School", bula verde #005c4b, dublu-check 14:32 — exact ce a cerut Cristina la M1-002.
- 4 canale togglabile (WA/Telegram/SMS/Email) cu interpolare live `{nume}` → vede instant cum apare la ea.
- FAQ-ul raspunde direct la 3 anxietati: numarul propriu de business, opt-out instant sincronizat pe toate canalele, audit log GDPR exportabil PDF pentru ANSPDCP.

ADDRESSES_PREV_FEEDBACK: partially

QUOTE_MARIA: "Cool ca pot da click pe Telegram, dar unde-i partea cu notificarile mele de quiz?"
QUOTE_CRISTINA: "Bine ca vad cu ochii mei mesajul si ca exista STOP — dar de ce nu apare in bula?"

VERDICT: Pagina face un salt urias fata de M1-002: Cristina vede in sfarsit mockup-ul WhatsApp real cu numele scolii si emailul ei, plus FAQ explicit despre opt-out, GDPR si ANSPDCP. Insa promisiunea „STOP" si „max 3 mesaje/saptamana" raman doar text — n-au reprezentare vizuala in bule. Maria e ignorata: zero preview de notificare push pentru ea, desi spec-ul mentioneaza sectiunea. Suficient pentru TRUSTS, dar urmatorul pas e sa scoatem opt-out-ul si anti-spam-ul DIN FAQ si sa le punem IN preview.
```
