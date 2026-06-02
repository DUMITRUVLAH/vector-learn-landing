# MOB-104 — Persona Manager Report (Andreea Mitran)

**Verdict: BUY**

## Reaction

"Exact ce le lipsea părinților. Acum pot vedea datoria copilului, descărca factura și trimite un mesaj profesorului — totul dintr-un singur loc pe telefon."

## Liked

- Balance card cu total restant vizibil imediat — reduce apelurile la secretariat
- Descărcarea PDF-ului direct din app — părinții vor trimite mai ușor la contabil
- Orele de liniște pe chat — evitați mesajele la 23:00 care deranjează profesorii
- Asocierea contului de la admin — workflow clar, nu confuz

## Concerns

- Dacă un copil are doi părinți separați (divorțați), ambii pot vedea aceleași date — e nevoie de clarificare GDPR la asociere (lipsă notă de consimțământ)
- Lipsa notificărilor push când vine un răspuns la chat — părintele trebuie să intre manual

## GDPR flag

Tabelul `parent_student_links` expune datele elevului la orice user cu UUID valid. Există control la nivel de tenant, dar lipsește log-ul GDPR pentru acțiunea de asociere. Recomand audit trail în faza 2.

## Prioritate pentru faza 2

- Push notification la răspuns chat
- Audit log asociere
