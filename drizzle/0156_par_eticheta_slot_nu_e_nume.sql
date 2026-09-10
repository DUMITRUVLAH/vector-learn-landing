-- Eticheta unui slot de aprobare e un ROL, nu un om.
--
-- Builderul de reguli DOA completa automat eticheta cu NUMELE persoanei alese, iar numele ajungea
-- titlu de secțiune peste tot: „15. ANA CHIRITA" în lanțul de semnături, în PDF și în inbox — chiar
-- și pe rânduri pe care persoana nu le mai deține (slotul solicitantului se elimină la depunere,
-- segregarea sarcinilor) sau pe care semnase deja altcineva. Pe PAR-2026-0025 capul spunea „Ana
-- Chirita", iar semnătura de dedesubt „Irina Oriol".
--
-- Codul nu mai scrie nume (ParAdmin.tsx + slotRoleLabel din doa.ts); aici curățăm ce e deja scris:
-- eticheta care nu e decât numele titularului redevine rolul.
UPDATE "par_doa_matrix" d
SET "approver_role_label" = 'Aprobator'
FROM "users" u
WHERE u."id" = d."approver_user_id"
  AND u."name" IS NOT NULL
  AND lower(btrim(d."approver_role_label")) = lower(btrim(u."name"));

-- Pe cererile deja depuse titularul poate lipsi din rând (slot eliberat), așa că numele se caută
-- printre utilizatorii aceluiași tenant, nu doar în titularul rândului.
UPDATE "par_approvals" a
SET "approver_role_label" = 'Aprobator'
WHERE a."approver_role_label" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "users" u
    WHERE u."tenant_id" = a."tenant_id"
      AND u."name" IS NOT NULL
      AND lower(btrim(a."approver_role_label")) = lower(btrim(u."name"))
  );
