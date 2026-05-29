MANAGER_REVIEW: BUY
ID: CRM-104
FIRST_IMPRESSION_5S: "Leadurile de pe Facebook Ads intră automat, cu atribuire corectă. Nu mai trebuie să le copiez manual din Meta Business Suite în Excel."
HOOK_STRENGTH: N/A
TRUST_SIGNALS: N/A

FRICTION_POINTS (max 5):
- [major] Configurarea webhook-ului (META_APP_SECRET, META_VERIFY_TOKEN, META_PAGE_ACCESS_TOKEN) necesită acces tehnic — Andreea nu poate face asta singură; ar trebui un wizard de setup în UI
- [minor] Conectarea Page ID cu tenant-ul nu are UI — în cod e hardcoded ca „orice tenant din DB" în dev; în producție ar trebui un ecran de configurare

WINS (max 3):
- HMAC SHA256 verificat corect — securitate serioasă, nu un webhook naiv
- Idempotent pe leadgen_id — dacă Meta trimite același lead de două ori, nu se dublează
- gclid salvat și pregătit pentru Google Offline Conversion — ROAS va fi calculabil în CRM-112

QUOTE: "Dacă asta înseamnă că nu mai pierd leaduri Facebook că n-am văzut notificarea, merită upgrade-ul."

VERDICT: Fundația tehnică pentru Facebook Lead Ads este solidă (HMAC, idempotency, mapare câmpuri). Principalul gap pentru Andreea: nu există UI de configurare a webhook-ului — are nevoie de un onboarding wizard sau documentație pas-cu-pas pentru conectare. De adăugat în backlog sau tratabil în CRM-111/112 ca parte din setup campanie.
