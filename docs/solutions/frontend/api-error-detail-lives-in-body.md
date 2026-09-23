# Fraza în română a unei erori stă în `ApiError.body.detail`, nu în `e.detail`

**Categorie:** frontend · **Data:** 2026-09-23 · **Găsit la:** verificatorul solicitantului (PAR)

## Simptomul
Panoul de completare de după semnare (`src/components/par/ParFinanceAmend.tsx`) afișa, la un refuz
al serverului, codul sec — `forbidden_after_signature` — deși ruta trimitea și motivul în română
(„După semnare se pot completa doar linia de buget…").

## Cauza, într-o propoziție
`errorText()` căuta `e.detail`, dar `api()` (`src/lib/api.ts`) aruncă `ApiError`, care ține corpul
JSON al erorii în `e.body` — deci `detail` e la `e.body.detail`, iar `e.message` e doar codul.

## Reparația
`errorText()` citește și `e.body.detail` înainte de a cădea pe `e.message`. Același helper servește
acum și corecturile verificatorului solicitantului.

## Testul care ține lecția
`src/pages/par/__tests__/ParDetail.verifierAmend.test.tsx` → „refuzul serverului se citește în
română, nu ca un cod": aruncă un `ApiError` real cu `body.detail` și cere ca pe ecran să apară fraza,
iar codul să NU apară.

## Regula
Când o rută întoarce `{ error, detail }`, ecranul afișează `detail`. Pentru un `ApiError`, fraza e în
`err.body.detail` (vezi și `ParAdmin` → `MemberAccessEditor`, care citește la fel motivul refuzului
unui verificator).
