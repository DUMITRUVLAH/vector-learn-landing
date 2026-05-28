# M1-005 — Persona Report (Student + Parent)

**Item**: Aplicație mobilă — module page
**Personas**: Maria (14, elevă) + Cristina (41, mama Mariei)
**Date**: 2026-05-29

---

## Maria (14)

**Verdict**: OK

**Reaction**: "OKAY frate, ASTA da. Salut, Maria. Cu emoji. Streak 12 zile lângă o flacără — exact ca pe Snap. XP 2.480 ca pe Duolingo. În sfârșit cineva a înțeles că nu sunt contabil, sunt OM. Mockup-ul de telefon arată legit, are notch, pot să dau swipe (a zis spec-ul touchstart/end, deci merge și cu degetul, nu doar cu săgețile alea pentru bunici). Lecția următoare e într-un card colorat cu gradient, nu un tabel. Iubesc."

**Likes**:
- Streak + XP pe dashboard, primele lucruri pe care le vezi — *acasă, nu îngropate într-un meniu*
- Gradient violet pe cardul "Următoarea lecție" arată ca o story de Insta, nu ca Outlook
- Bullet de pe pagină: "Leaderboard pe clasă (opțional, nu pe centru — anti-bullying)" — *finally cineva care înțelege că leaderboard global e cancer*
- "Audio listening cu redare la viteză variabilă 0.75x — 1.5x" — exact ca TikTok/YouTube, nu mă mai obligă să ascult tanti aia care vorbește în slow-motion
- Upload poză cu tema scrisă de mână + OCR — *nu mai retypez 2 pagini la 11 noaptea*
- Voice notes în chatul cu profa — *finally, scriem mai puțin, vorbim mai mult*

**Dislikes / friction**:
- "Recompense personalizate de profesor (insigne custom)" — sună fain pe hârtie, dar dacă profa pune insigne tip "Cea mai cuminte fetiță" e DEZASTRU. Cine controlează ce insigne pune profa?
- Lista "De făcut azi" arată ca un to-do app boomer — unde-i animația când bifez? Unde-i confetti? Unde-i +50 XP popup?
- Doar 1 din 3 taskuri e marcat done — îmi dă FOMO că rămân în urmă, vreau să văd și un *streak counter* lângă fiecare task, nu doar un checkbox gri
- Badge XP & streak "animate" — spec promite animație, dar din cod nu văd nicio animație reală (doar `transition-all` pe progres bar). Dacă streak-ul nu pulsează la flacără, e doar un număr. Vreau să se MIȘTE.
- Ecranul "Plăți" pe contul meu de elev e bizar — eu n-am card, de ce văd "Următoarea plată: 280 €"? Mă stresează inutil. Ăsta-i ecran de Cristina, nu de mine.
- Nu văd nicăieri chatul cu profa în mockup — 4 ecrane și niciunul nu-i Chat? Frate, ăla-i ecranul pe care l-aș folosi de 20x/zi.
- Toggle iOS/Android la mockup — *nimeni de vârsta mea nu dă click pe ăla, e pentru părinți*

---

## Cristina (41, mama)

**Verdict**: TRUSTS

**Reaction**: "Văd ecranul de Plăți cu istoricul curat, abonament activ, următoarea plată — exact ce-mi trebuie. Și văd că Maria are propria ei aplicație unde se joacă cu XP-uri, iar eu am partea mea serioasă. FAQ-ul spune clar: conturi separate părinte/elev. Asta-i mare. Nu vreau să primesc eu notificările ei de badge-uri, și nici ea facturile mele."

**Likes**:
- FAQ #4 explicit: *"Părintele vede plățile, orarul, progresul. Elevul vede gamification, temele, chat-ul. Un părinte poate avea legate mai mulți copii."* — clar, am încredere
- "Mod 'liniștit' pentru profesor în afara orelor" — înseamnă că Maria nu primește spam la 23:00
- "Părintele poate participa la conversație (cont separat sau cu copilul)" — pot să verific ce-i scrie profa fără să par paranoică
- Notificări instant pe lock screen pentru "Lecție mutată, temă nouă, plată" — exact cele 3 lucruri pe care vreau să le știu imediat
- Offline mode pentru orar și materiale — în mașină, în metrou, la țară la bunici — funcționează

**Concerns (TRUSTS, nu DISLIKES)**:
- Chat-ul cu profa — read receipts și typing indicator "configurabil" e ok, dar implicit ce e? Aș vrea ca implicit pentru minori să fie OFF (privacy by default)
- "Upload poze cu tema" + OCR — pozele alea se șterg după review? Unde se stochează? Nu văd în FAQ. La M2, vă rog adăugați un FAQ "Ce se întâmplă cu pozele temelor după notare?"
- Leaderboard "opțional" — cine îl activează? Eu (părinte) sau profa? Dacă-l activează profa fără să mă întrebe, am o problemă
- Notificările push pe lock screen — pot să le văd și eu (Cristina) când Maria primește o temă? Sau doar ea? Vreau control granular: "vreau notif administrative, NU vreau notif de XP/badge"

---

## Summary

Maria în sfârșit se vede în produs (XP, streak, gradient, emoji în "Salut, Maria 👋"). Dashboard arată ca o aplicație 2026, nu ca un Excel colorat — promisiunea din M1-001 e respectată. Friction real: lipsește ecranul Chat din mockup (deși e bullet point major), animațiile XP/streak promise în spec nu sunt vizibile în cod, și ecranul Plăți n-ar trebui să existe pe contul de elev.

Cristina are încredere — separarea conturilor și mod liniștit sunt argumentele câștigătoare. Vrea însă mai mult control granular pe notificări și un FAQ despre retenția pozelor cu teme.

**Feed forward to M2**:
- Adaugă ecran "Chat" în mockup (5 ecrane în loc de 4) — e cel mai folosit feature menționat și lipsește din demo
- Implementează animații reale pe XP gain / streak (confetti, pulse, +XP popup) — spec spune "animate", codul nu animă
- Pe contul de elev: ascunde ecranul Plăți SAU înlocuiește-l cu "Profil/Avatar" (Maria vrea să-și personalizeze avatarul)
- FAQ nou: retenția datelor copilului (poze teme, voice notes, mesaje chat)
- Granularitate notificări părinte: separate toggle pentru "administrative" vs "engagement copil"
- Control parental explicit pe leaderboard (opt-in părinte, nu doar profesor)
