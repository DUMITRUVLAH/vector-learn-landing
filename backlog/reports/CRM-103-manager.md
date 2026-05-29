MANAGER_REVIEW: BUY
ID: CRM-103
FIRST_IMPRESSION_5S: "Am 200 de leaduri în Excel. Dacă pot să le import în 5 minute cu preview și să văd câte sunt duplicate, e exact ce-mi trebuie."
HOOK_STRENGTH: N/A (funcționalitate internă)
TRUST_SIGNALS: N/A
ROI_PROOF: N/A

FRICTION_POINTS (max 5):
- [major] Câmpul "Responsabil" din modalul add lead acceptă UUID brut — recepționerul nu știe UUID-ul colegului; ar trebui un dropdown cu useri din tenant
- [minor] Import CSV: nu există buton de descărcare template CSV — recepționerul nu știe ce format trebuie
- [minor] Bannerul de dedup zice "Deschide" dar nu navighează — adaugă un link real la lead (`/app/leads/:id`)

WINS (max 3):
- Import CSV cu preview 5 rânduri + raport X create/Y duplicate/Z erori: exact ce-a cerut echipa
- Mapare automată coloane (detectează "Telefon", "Email", "Nume"): nu trebuie să stea să alinieze manual
- Câmpul assigned_to salvat la creare: am responsabilul setat instant

QUOTE: "Importul cu preview înainte de commit e exact ce-mi lipsea. Nu mai import orb și nu mai am duplicate fără să știu."

VERDICT: CRM-103 livrează ce promite: adăugare manuală extinsă cu assigned_to și dedup live, plus import CSV complet (upload → mapare → preview → commit). Principalul friction pentru Andreea: câmpul responsabil ar trebui dropdown cu useri reali, nu UUID brut — de notat pentru CRM-106 (editare inline) sau un item separat.
