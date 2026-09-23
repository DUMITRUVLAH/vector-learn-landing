# Nu poți reinvita pe cineva scos din PAR

**Simptom (2026-09-23):** adminul scoate o persoană din PAR, apoi o reinvită → „Acest email există deja în organizație.", deși persoana nu mai apare nicăieri.

**Cauza:** scoaterea din PAR (`DELETE /api/par/members/:id`) șterge doar rândurile din `par_members`. Rândul din `users` rămâne, fiindcă de el țin cererile și semnăturile vechi. `POST /api/par/invites` refuza dacă găsea orice rând în `users`, adică „are cont" era tratat ca „e membru".

**Fix:** invitația e refuzată doar dacă persoana încă are acces în PAR: un rând în `par_members` sau un rol de tenant cu drept implicit de admin (`IMPLICIT_PAR_ADMIN_TENANT_ROLES`). `accept-invite` redă deja rolul unui cont existent din același tenant (cu parola lui sau prin Google).

**Regula:** când o verificare de tip „există deja" se uită la o tabelă de conturi, întreabă-te dacă ștergerea din UI chiar șterge din tabela aceea. Dacă e ștergere logică sau parțială, verificarea trebuie să urmeze aceeași definiție de „membru" ca ecranul.

**Test:** `server/__tests__/invite-redemption-integration.test.ts` → „re-invite a member removed from PAR".
