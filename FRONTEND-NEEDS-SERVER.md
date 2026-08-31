# Atașamente PAR peste ~3 MB — ce mai trebuie făcut

**Stare: plafon client 3 MB (`src/lib/par/attachmentLimits.ts`). Nu e o soluție, e o oprire onestă
înainte de eroarea de platformă.**

## Ce se întâmpla înainte
Interfața accepta fișiere până la 10 MB și le trimitea ca data-URL base64 într-un corp JSON
(`ParCreateForm.tsx`, `ParFinanceQueue.tsx` → `uploadAttachment`). Base64 umflă cu ~33%, iar
funcția serverless de pe Vercel refuză corpurile peste ~4,5 MB. Rezultat: orice fișier de peste
~3,3 MB pica cu un `413` fără explicație, după ce utilizatorul aștepta încărcarea.

## De ce NU e multipart/form-data răspunsul
Trecerea la `multipart` scoate doar umflarea base64 de pe fir: plafonul real ar urca de la ~3,3 MB
la ~4,4 MB. Tot un plafon arbitrar, tot sub ce cere un scan de contract. Nu merită o rescriere a
căii de încărcare pentru un megabyte.

## Soluția reală: fișierele în object storage, nu în baza de date
`par_attachments.file_url` ține azi fișierul întreg ca text în Postgres. Modulul FinDesk are deja
tiparul corect (`server/lib/storage/captureStorage.ts`: URL semnat de upload direct din browser
către Supabase Storage, iar în DB rămâne doar calea). Pașii:

1. URL semnat de upload pentru atașamente PAR, cu aceeași verificare de tenant ca la captures
   (`isSafeTenantObjectPath`, `server/lib/storage/safePath.ts`).
2. Browserul urcă direct în storage — corpul nu mai trece prin funcția serverless, deci limita de
   4,5 MB dispare complet.
3. `file_url` devine calea din storage; ruta de preview
   (`GET /api/par/:parId/attachments/:attId/preview`) o rezolvă și livrează fișierul, păstrând
   verificarea de acces exact unde e acum.
4. Migrare pentru atașamentele existente: pot rămâne data-URL — ruta de preview le tratează deja
   pe amândouă (`/^https?:\/\//` → redirect, `data:` → body).

Până atunci, plafonul de 3 MB e explicit în interfață, cu motivul scris în mesajul de eroare.
