# CRM-123 — Persona Manager: Andreea Mitran

**Verdict: BUY**

"Clopotelul a lipsit de la ziua 1. Stăteam cu 3 tab-uri deschise să nu pierd un lead nou de la site. Acum apare direct badge-ul în header. Polling la 30s e acceptabil pentru un CRM educațional — nu am nevoie de WebSocket real-time. 'Marchează toate' e salvator după weekend, când se adună 15 notificări."

**Friction (informațional, nu blocant):**
1. Nu există preferințe pe tipuri de notificări — aș vrea să dezactivez `lead_created` pentru rolul professor (ei nu au acces la CRM).
2. Nu văd notificări pentru task-uri scadente (T-CRM-123 menționează `task_due`) — nu sunt implementate în MVP al acestui item, dar ar fi prioritare.
3. Notificările nu persistă după logout/login — se șterge istoricul vizual (dar DB păstrează). Un "History" tab ar fi util.
