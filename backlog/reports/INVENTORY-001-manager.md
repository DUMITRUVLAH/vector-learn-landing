# Persona Report — Manager (Andreea Mitran)
**Item:** INVENTORY-001 — Schema inventar + cost mediu ponderat + seed
**Verdict: BUY**

## Ce testez
Intru pe /app/fin/inventory — văd link în sidebar (Finanțe → Inventar). Navighează.
5 articole demo: Caiete A4, Markere, Hârtie, Folii, Pixuri.
Cantitate curentă vizibilă per articol. Cost mediu ponderat per unitate.

## Ce imi place (LIKES)
1. **CMP conform SNC 2** — costul mediu ponderat e standardul contabil moldovenesc. Nu FIFO care e complicat.
2. **Seed realist** — "Caiete A4 80 file", "Markere permanente asortate" — asta e ce cumpăr eu efectiv.
3. **Stoc nu poate deveni negativ** — dacă cineva încearcă să vândă 15 caiete din 10 disponibile, primește eroare. Previne dezechilibru.
4. **Legătură cu facturi** — câmpul invoice_id în mișcări pregătit pentru integrare cu BILL. Vizionez viitorul: factură generată → stocul scade automat.
5. **Categoria** — "consumabile", "active_mici", "materiale_didactice" — filtrarea contabilă pe tip articol.

## Ce aș vrea mai mult (FRICTION)
1. **Pagina UI** — această versiune e doar schema + backend. Vreau tabelul cu stocuri curente în /app/fin/inventory — va veni în INVENTORY-002?
2. **Alert stoc minim** — am setat min_qty_alert dar nu văd notificare. Se implementează mai târziu?
3. **Raport valoare stoc** — totalul valorii stocului la o dată (qty × avg_cost) pentru bilanț. Lipsește deocamdată.

## Concluzie
Fundație solidă. CMP corect. Schema bine gândită pentru integrare viitoare cu facturi și achiziții.
Andreea ar "cumpăra" modulul Inventar cu această fundație — dar abia după ce apare UI-ul.
