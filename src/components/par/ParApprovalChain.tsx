/**
 * PAR-118: ParApprovalChain — renders the full ordered approval chain
 * (sections 14–15). Each step shows: role label, approver, decision, date, comment, locked state.
 *
 * Design: Vector 365, light+dark, WCAG AA.
 */
import type { ParApproval } from "@/lib/api/par";
import { ParSignatureBlock } from "./ParSignatureBlock";

interface Props {
  approvals: ParApproval[];
}

/**
 * Ce scrie în capul unui bloc de semnătură.
 *
 * Eticheta pasului vine din matricea DOA, iar builderul o completează automat cu NUMELE persoanei
 * alese — deci pe un pas semnat capul spunea „15. ANA CHIRITA" fix deasupra semnăturii „Ana
 * Chirita". Când eticheta doar repetă persoana din bloc, capul devine ce e cu adevărat: rolul.
 * Pe un pas nesemnat eticheta rămâne, pentru că acolo e singurul loc care spune pe cine așteptăm.
 */
function slotLabel(appr: ParApproval): string {
  const label = appr.approverRoleLabel?.trim();
  if (!label) return `Pas ${appr.step}`;
  const person = (appr.signatureName ?? appr.approverName ?? "").trim();
  if (person && label.toLocaleLowerCase("ro") === person.toLocaleLowerCase("ro")) return "Aprobator";
  return label;
}

export function ParApprovalChain({ approvals }: Props) {
  const sorted = [...approvals].sort((a, b) => a.step - b.step);
  const requestorStep = sorted.find((a) => a.step === 0) ?? null;
  const approverSteps = sorted.filter((a) => a.step > 0);

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nicio semnătură înregistrată.</p>
    );
  }

  return (
    <div className="space-y-3" aria-label="Lanț de aprobare">
      {requestorStep && (
        <ParSignatureBlock
          approval={requestorStep}
          sectionLabel="14. Solicitant"
        />
      )}
      {approverSteps.map((appr) => (
        <ParSignatureBlock
          key={appr.id}
          approval={appr}
          sectionLabel={`15. ${slotLabel(appr)}`}
          isLocked={appr.locked}
        />
      ))}
    </div>
  );
}
