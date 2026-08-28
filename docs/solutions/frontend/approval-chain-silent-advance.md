# „Aprob din inbox și cererea nu se duce în coada de finanțe"

**Categorie:** frontend / feedback · **Data:** 2026-08-28 · **Raportat de:** utilizatori ATIC

## Simptom
Aprobatorul apasă „Aprobă" în *Inbox aprobare*, modalul se închide — și cererea e tot în listă.
Concluzia lui: aprobarea nu s-a salvat / aplicația nu trimite cererea la finanțe.

## Cauza reală
Nu e un bug de state machine. Verificat pe prod: **zero** cereri cu tot lanțul semnat rămase în
`pending_approval` (interogare în `par_approvals`), iar `GET /api/par/finance` întoarce exact ce
trebuie. Ce se întâmplă:

1. Matricea DOA a tenantului (`par_doa_matrix`) are **mai mult de un pas** — la ATIC un pas 2
   „Oricine · PAR Admin", adăugat pe 2026-08-25.
2. `approveParStep` semnează pasul activ și **avansează** lanțul (`chain_status: "advanced"`).
   Statusul rămâne `pending_approval` până la ultima semnătură; abia atunci trece în `in_finance`.
3. Pasul 2 cere rolul `par_admin`. În tenant nu există niciun `par_members.role = 'par_admin'` —
   doar unul *implicit* (adminul de tenant, `IMPLICIT_PAR_ADMIN_TENANT_ROLES`). Adică **aceeași
   persoană** care a semnat pasul 1 trebuie să semneze și pasul 2, iar cererea îi reapare în inbox.
4. UI-ul arunca răspunsul serverului (`chain_status`, `next_step_label`) și doar reîncărca lista.

## Fix
`ParInbox` folosește răspunsul: mesaj explicit după decizie („RĂMÂNE în inbox, urmează pasul N
(<rol>)" vs „a intrat în Coadă finanțe") + „Pasul X din Y" pe rând, înainte de semnătură.
Inbox-ul întoarce `steps_total` / `steps_approved`. Regresii în `ParInbox.test.tsx`.

## Lecția
Un ecran care execută o acțiune cu efect **întârziat sau parțial** trebuie să spună ce s-a
întâmplat. „Lista s-a reîncărcat" nu e feedback — e ambiguu între „a mers" și „n-a mers", iar
utilizatorul alege interpretarea proastă. Când serverul întoarce deja starea (aici `chain_status`),
a o ignora în client transformă o configurație corectă într-un bug raportat.

## Verificare rapidă când reapare reclamația
```sql
-- cereri cu tot lanțul semnat, dar încă în pending_approval (ar fi bug real; a ieșit gol)
select r.request_no from par_requests r
where r.status='pending_approval'
  and not exists (select 1 from par_approvals a where a.par_id=r.id and a.step>0 and a.decision='pending');

-- pasul activ + dacă rolul cerut e ținut de cineva EXPLICIT în tenant
select t.name, r.request_no, a.step, a.approver_par_role::text,
  (select count(*) from par_members m where m.tenant_id=r.tenant_id and m.role::text=a.approver_par_role::text) as membri_expliciti
from par_requests r join tenants t on t.id=r.tenant_id
join par_approvals a on a.par_id=r.id and a.decision='pending' and a.locked=false and a.step>0
where r.status='pending_approval';
```
