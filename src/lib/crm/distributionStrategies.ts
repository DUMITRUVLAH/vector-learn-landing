/**
 * CRM — strategiile de împărțire automată a unui lot (partea PURĂ, pentru interfață).
 *
 * Stau AICI, nu în `src/lib/api/crmDistribution.ts`, din același motiv pentru care stau aici
 * filtrele de segment și șabloanele de pâlnie: în `lib/api/` trăiește doar ce vorbește cu
 * serverul, fiindcă ecranele testate înlocuiesc modulul cu un dublu (`vi.mock`). O constantă
 * adăugată acolo obligă fiecare suită să o declare în mock — s-a întâmplat de două ori.
 *
 * Cheile sunt cele validate de server (`server/lib/crm/distribution.ts`); textele sunt pentru om.
 */
export const AUTO_STRATEGIES = [
  {
    key: "round_robin",
    label: "Egal, pe rând",
    hint: "Fiecare agent bifat primește același număr. Restul de la împărțire merge la primii.",
  },
  {
    key: "capacity",
    label: "Cât îi mai încape fiecăruia azi",
    hint: "Se respectă norma zilnică din setările agentului. Cine e plin nu mai primește, iar contactele rămân în rezervă.",
  },
  {
    key: "weighted",
    label: "Ponderat",
    hint: "Cine are greutatea 2 primește dublu față de cine are 1 (setările de vânzări ale agentului).",
  },
  {
    key: "rules",
    label: "După regulile de distribuire",
    hint: "Folosește regulile scrise în Automatizări (teritoriu, condiții). Singura care se uită la CE e contactul, nu doar la cine e liber.",
  },
] as const;

export type AutoStrategyKey = (typeof AUTO_STRATEGIES)[number]["key"];
