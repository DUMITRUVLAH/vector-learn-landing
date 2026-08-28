---
category: frontend
date: 2026-08-28
symptom: Linkul din emailul de notificare apare ca text neclicabil (Outlook), deși în Gmail se poate da click
---

# Linkuri „moarte" în emailurile de notificare pe Outlook

## Simptom
Emailul FinFlow („Deschide cererea: https://finflow.best/#/business/par/<id>") arăta corect în
Gmail — URL-ul era clicabil. Pe Outlook, același email afișa URL-ul ca text simplu; destinatarul
trebuia să-l selecteze și să-l copieze manual în bara de adrese.

## Cauza
`buildHtml` (`server/services/messaging/providers.ts`) escapa corpul plain-text și îl insera într-un
`<p>`, **fără nicio ancoră `<a href>`**. Gmail autolinkează URL-urile scrise ca text în HTML mail;
**Outlook nu o face** (nici desktop/motorul Word, nici outlook.com). Deci clicabilitatea depindea
de clientul destinatarului — exact tipul de bug care nu se vede la testul propriu pe Gmail.

Al doilea defect din același email: corpul reutiliza textul notificării in-app, care conține calea
relativă `Link: /business/par/<id>` — moartă în orice client de mail — deci utilizatorul vedea
întâi linkul care nu funcționează.

## Soluția
1. `linkify()` — după escape, orice `https?://…` devine `<a href>` explicit.
2. `extractCta()` + `ctaHtml()` — ultima linie „Etichetă: URL" devine buton CTA „bulletproof":
   culoarea și zona de click stau pe `<td bgcolor>`, pentru că Outlook desktop ignoră `padding`
   pe `<a>`. Sub buton se repetă URL-ul ca text-link, pentru clienții care taie stilurile.
3. `stripInAppLink()` în `server/services/par/notify.ts` — scoate calea relativă din corpul preluat
   de la notificarea in-app, ca emailul să conțină un singur link, cel funcțional.

## Regresia care blochează
- `server/services/messaging/__tests__/emailHtml.test.ts` → describe „buildHtml — linkuri clicabile"
  (buton cu `<a href>`, autolink în corp, fără evadare din atribut, fără buton când nu există link).
- `server/services/par/__tests__/notify.test.ts` → describe „stripInAppLink".

## Regula generală
Într-un email HTML, un URL nu e link decât dacă e scris ca `<a href>`. Nu te baza niciodată pe
autolink-ul clientului — și verifică pe Outlook, nu doar pe Gmail.
