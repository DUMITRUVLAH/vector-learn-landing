MANAGER_REVIEW: BUY
ID: CRM-102
FIRST_IMPRESSION_5S: "Fusionarea a două fișe — exact ce mi s-a întâmplat cu Ana Ionescu: am creat-o de două ori din greșeală. Dacă pot face merge în 3 click-uri, mersi."
HOOK_STRENGTH: N/A (funcționalitate internă, nu pagină publică)
TRUST_SIGNALS: N/A
ROI_PROOF: N/A
CTA_CLARITY: N/A
COPY_QUALITY: N/A
DEMO_REALISM: N/A

FRICTION_POINTS (max 5):
- [major] Merge-ul nu este reversibil direct din UI — documentul de arhivare există (mergedIntoId), dar nu există un buton „Desfă merge" în spec; ca manager vreau să pot remedia o greșeală
- [minor] Dedup-ul pe nume normalizat (NFC, fără diacritice) este pentru false-positive detection, dar nu blochează crearea — e o notificare, nu o blocare; bine, dar ar trebui să apară vizibil în formular

WINS (max 3):
- Normalizare completă telefon (0712 345 678 = +40712345678): nu mai am duplicate din cauza formatării
- Câmpurile survivor au prioritate, golurile se completează din source: corect, nu pierd date
- Audit interaction scrisa după merge: pot urmări istoria merge-ului în timeline

QUOTE: "Aveam 3 „Ana Ionescu" pentru că recepționerii introduc diferit. Dacă asta le curăță, plătesc pentru asta."

VERDICT: Implementarea dedup și merge manual este solidă din perspectivă de business. Normalizarea consistentă pe telefon/email/nume elimină principala cauză de duplicate din centrele noastre. API-ul merge este tenant-scoped și trasabil. Singur punct de atenție: reversibilitatea merge-ului — de notat pentru CRM-112 sau un item separat.
