# M1-010 — Persona Review: Maria + Cristina

**Pagina**: `/modules/ai` — AI Assistant
**Reviewers**: Maria (14, elevă) + Cristina (mama Mariei, plătește facturile)
**Verdict global**: DISLIKES (Cristina) / NEUTRAL (Maria)

---

## Cristina (mama, anxioasă cu tehnologia)

### 1. "Maria Popescu, Engleză B2" apare in chat demo

Stai. Numele copilului meu e în demo-ul public de pe site? Sau e doar un exemplu inventat care întâmplător are același nume? Nu pot să-mi dau seama — și asta în sine mă sperie. Dacă e exemplu fictiv, OK, dar de ce tocmai "Maria Popescu"? Sunt 50.000 de Maria Popescu în țară, dar tot mi se ridică păr pe ceafă. **Adăugați "(exemplu fictiv)" lângă nume**, vă rog. Altfel părinții ca mine se gândesc imediat: "Datele copiilor reali apar în demouri?"

### 2. "Datele tale nu sunt folosite pentru training" — credibil?

Sincer? Vreau să cred, dar **nu am cum să verific**. Spuneți: "DPA semnat", "Art. 28 GDPR", "Frankfurt". Pentru mine astea sunt cuvinte. Eu vreau un buton **"Vezi ce date pleacă spre AI și unde"** — un log, în clar, pentru contul Mariei. Dacă pot vedea cu ochii mei că numele ei devine `student_8a7f3`, atunci da, vă cred. Promisiunile pe pagină nu echivalează cu transparență reală.

### 3. "Pseudonimizare" — știu ce înseamnă?

Nu. Am dat search după ce am citit FAQ-ul. Apoi am înțeles: numele Mariei devine token, mailul devine hash. OK, sună rezonabil, dar **scrieți-o pe limba mea**: "Numele Mariei nu ajunge niciodată la OpenAI — se înlocuiește cu un cod. Conținutul lecției pleacă, dar fără să se știe că e al ei." Asta e o frază pe care o pot spune soțului meu fără să mă bâlbâi.

### 4. Churn prediction folosește datele Mariei — îmi convine?

**Cel mai mult mă deranjează asta.** AI-ul calculează probabilitatea ca Maria să plece — 78%, 85% — și apoi cineva primește o "acțiune": "apel direct manager". Adică Maria devine **un caz de salvat**, nu un copil. Și dacă modelul greșește? Dacă mă sună managerul cu o ofertă "ca să rămânem" când eu nici nu mă gândeam să plec — îi dau idea. Vreau un opt-out clar: **"Nu vreau ca fiul/fiica mea să fie evaluat(ă) algoritmic pentru risc churn."** Asta nu apare nicăieri.

### 5. Răspunsul auto-părinte

Aici sunt OK. "Human-in-the-loop, AI propune omul decide" — îmi place. Dar întrebarea reală: **când expiră modul draft?** După 6 luni, când e clar că AI-ul "merge bine", cineva o să dea click pe "auto-approve all" și gata. Vreau să știu că **nu se poate dezactiva human-in-the-loop pentru mesaje către părinți**, niciodată. Spuneți asta explicit.

---

## Maria (14, elevă)

### AI care vede tot ce face — creepy sau OK?

Onest? **Creepy.** "12/15 exerciții corecte", "7 răspunsuri voluntare", "dificultate la past perfect continuous" — cineva (un robot) ține scor. La fiecare lecție. Și apoi îi spune mamei. Adică nu mai pot avea o zi proastă în liniște — totul se transformă într-un raport.

**Ce vreau**: să văd ȘI EU sumarul, înainte să-l vadă mama. Sau măcar să știu ce s-a spus despre mine. Acum simt că sunt subiectul unui dosar la care nu am acces.

Partea bună: dacă AI-ul mă ajută cu temele (gen explică Past Perfect altfel decât prof), aș folosi-o. Dar pagina asta nu vorbește deloc cu mine — vorbește cu părintele meu despre mine. **Diferență mare.**

---

## TL;DR pentru M2

- Etichetează "Maria Popescu" ca exemplu fictiv în ChatDemo
- Buton "Vezi log date trimise la AI" pentru părinți (transparență reală)
- Reformulează "pseudonimizare" în limbaj uman
- Opt-out explicit pentru churn prediction la nivel de student
- Garanție scrisă: human-in-the-loop pe mesaje către părinți NU se poate dezactiva
- Vedere "ce știe AI-ul despre mine" pentru elev (Maria vrea acces la propriul dosar)
