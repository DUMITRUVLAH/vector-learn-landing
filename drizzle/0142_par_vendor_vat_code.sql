-- PAR: codul de TVA al beneficiarului primește coloana lui.
-- Pe documentele moldovenești rechizitele se tipăresc pe un singur rând
-- („BC'MAIB'S.A. sucursala Stefan cel Mare, AGRNMD2X885 c.f./ nr.TVA 1014600022332"), iar
-- registrul le păstra așa, îngrămădite în `bank`. Codul fiscal are deja coloană (`idnp`),
-- codul bancar la fel (`bic_swift`) — lipsea doar TVA-ul. Separarea propriu-zisă o face
-- server/lib/par/bankRequisites.ts la fiecare scriere.
ALTER TABLE "par_vendors" ADD COLUMN IF NOT EXISTS "vat_code" varchar(50);
