# Corpus de documente PAR — date salvate pentru retestare

Fiecare document pe care extragerea l-a tratat greșit trăiește aici ca **pereche de fișiere**:

| Fișier | Ce conține |
|---|---|
| `<slug>.txt` | textul documentului, exact cum iese din PDF (păstrează diacriticele și rândurile!) |
| `<slug>.json` | ce trebuie să extragă sistemul din el (sursa de adevăr, editabilă) |

`documentCorpus.test.ts` le încarcă automat pe toate — nu trebuie să atingi codul testului
ca să adaugi un document nou.

## Cum retestezi tot corpusul

```bash
npm run par:corpus
```

## Cum adaugi un document nou (când găsești unul care iese prost)

```bash
# 1. vezi ce extrage acum dintr-un PDF/text real
npm run par:extract -- ~/Downloads/factura.pdf

# 2. dacă e greșit, salvează-l în corpus (creează .txt + schelet de .json)
npm run par:extract -- ~/Downloads/factura.pdf --save 12-nume-scurt-descriptiv

# 3. editează 12-....json cu ce TREBUIE să iasă, apoi:
npm run par:corpus     # va PICA → repari codul → trece
```

## Reguli pentru `.json`

Toate câmpurile sunt opționale — pune doar ce contează pentru documentul acela.

- Potrivire exactă: `payeeName`, `payeeIdno`, `payeeIban`, `payeeBic`, `payeeAdministrator`,
  `amountCents` (în bani, nu lei), `currency`, `documentClass`, `needsClarification`
- Potrivire parțială: `payeeNameContains`, `payeeBankContains`, `payeeLegalAddressContains`
- Expresie regulată: `payeeNameMatches`, `scopeMatches`
- Negativ: `payeeBankNotContains`, `payeeIsNull: true`
- `null` explicit înseamnă „trebuie să fie gol" (ex. `"payeeIban": null` pe o chitanță)

Peste asta, **fiecare** document e verificat automat pentru invarianta de puritate:
niciun nume nu conține IBAN / cod fiscal / adresă / etichetă de rol, iar câmpul „Bancă"
nu conține niciodată IBAN sau cod fiscal.

## De ce contează documentele reale

Fixture-urile sintetice ratează exact ce rupe producția: rânduri tăiate de PDF în locuri
ciudate, diacritice vechi cu sedilă (`ş`/`ţ`), etichete bilingve fără „:", coloane de tabel
lipite. Documentele marcate `sursa: Document real al owner-ului` sunt cele mai valoroase din
corpus — fiecare a prins un bug pe care testele sintetice îl declaraseră „verde".
