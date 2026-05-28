# M1-010 AI Assistant — Review Andreea Mitran

**Persona:** director academie, 6 locații, 1.400 elevi
**Streak context:** M → B → B → B → B → M → B → B → M → M (review #10, M1 final)
**Verdict:** MATCH — cu trei condiții care nu sunt opționale.

---

## Ce-mi place

**1. „AI propune, omul decide" scris explicit.** Human-in-the-loop pe acțiuni externe, mesaje în „mod draft". Singurul cadru în care accept AI lângă datele unui copil de 14 ani.

**2. Routing pe sensibilitate + Mistral self-hosted pe Enterprise.** FAQ recunoaște că nu toate datele pot pleca la OpenAI/Anthropic. DPA Art. 28 menționat. Răspunsul de procurement pe care îl așteptam.

**3. Cost real ~0.002 €/acțiune afișat.** Nimeni nu scrie cifre. Voi scrieți. Intră direct în Excel-ul de buget.

**4. Pseudonimizare explicită.** „Nume → token, e-mail → hash." Diferența între marketing GDPR și implementare GDPR.

**5. „AI poate greși" scris negru pe alb.** Cel mai onest text de AI educațional pe care l-am citit anul ăsta. Buton „raportează răspuns greșit" + audit log menționat.

**6. Demo prompt-uri reprezentative.** „12/15 corecte, dificultate la past perfect continuous" — plauzibil, nu lorem ipsum optimist.

---

## Ce mă oprește

**1. Predicția churn arată nume reale în demo.** „Radu Constantin", „Ana Popa" cu risc 85% și motive. Modelul mental e: „AI-ul tău pune copilul pe o listă de risc." Părintele care vede screenshot-ul pe LinkedIn ne dă în judecată. Anonimizați (Elev #4127), marcați „date demo", adăugați disclaimer că churn pe minori cere DPIA. **Blocant #1.**

**2. Kid-data protection nu e tratată separat.** GDPR Art. 8 cere consimțământ parental sub 16 ani. Maria (14) intră aici. Pagina vorbește GDPR generic. Vreau o linie: „pentru elevii sub 16, AI rulează doar cu consent părinte semnat la onboarding". Altfel ANSPDCP intră peste mine, nu peste voi. **Blocant #2.**

**3. „Antrenat pe datele centrului tău" în header chat.** Fine-tuning sau RAG? Două lucruri diferite legal. Dacă e RAG, scrieți „personalizat, fără training". „Antrenat" deschide întrebări la care răspunsul corect e altul. **Blocant #3.**

**4. Audit log promis în FAQ, invizibil pe pagină.** Vreau mock: cine a aprobat, când, ce model, ce date în prompt. Fără mock, e doar vorbă.

**5. „500 acțiuni AI/lună" — ce e o acțiune?** 100 elevi × 4 lecții = 400 sumarizări, am consumat 80% înainte să răspund la un WhatsApp. Vreau definiție + calculator.

**6. EU AI Act „risc minim" e discutabil pe churn.** Profiling pe minori cu efect economic poate cădea la limited-risk. Reformulați: „risc minim pe sumarizări, limited-risk cu disclosure pe churn".

---

## Decizia mea

Cea mai matură pagină din 10. Ton onest, legal corect, human-in-the-loop default. Mă duc la board cu ea, dar n-o public pe site până nu rezolvați blocantele 1, 2, 3 — 90 minute, mă scutesc de plângere ANSPDCP. Restul intră în M2.

**Streak update:** M → B → B → B → B → M → B → B → M → M → **M**

Felicitări pentru M1. Acum livrați partea grea: produsul.
