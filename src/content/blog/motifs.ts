import type { CoverSpec, Motif } from "./cover";

/**
 * Biblioteca de motive — geometrie abstractă, randată ca SVG inline în HTML-ul pre-randat.
 *
 * Regula dură: **geometria nu minte.** Un cover pe un site despre bani nu are voie să conțină o
 * captură dintr-o aplicație reală (ar publica date de client), o factură „exemplu” care arată ca un
 * document autentic, sau o fotografie de stoc prezentată ca fiind a noastră. Un desen abstract nu
 * pretinde că e dovadă.
 *
 * Motivul e o abstractizare a MECANISMULUI, nu o ilustrare a subiectului: „limite de aprobare” nu
 * se desenează cu un ciocănel de judecător, ci cu trepte tăiate de o linie — valori care cresc
 * până unde ai voie singur.
 *
 * Constrângeri de construcție, ca seria să rămână o serie:
 *   · viewBox 300×180, un singur gest, lizibil la 160×96 px (dimensiunea din rândul de listă)
 *   · stroke-width 2.5, capete rotunde, doar cerneala paletei la opacități diferite
 *   · fără text în motiv, fără a doua culoare, fără gradient
 */

const S = 'fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"';

function motifMarkup(motif: Motif, ink: string): string {
  const st = `${S} stroke="${ink}"`;

  switch (motif) {
    // ── control ───────────────────────────────────────────────────────────────
    // Praguri: trei trepte care cresc, tăiate de linia de la care nu mai decizi singur.
    case "threshold":
      return `
        <path d="M74 138 H118 V116 H162 V92 H206 V62 H246" ${st} opacity="0.85" />
        <line x1="66" y1="80" x2="254" y2="80" ${st} opacity="0.45" stroke-dasharray="7 7" />
        <circle cx="206" cy="80" r="6" fill="${ink}" opacity="0.9" />`;

    // Separarea atribuțiilor: două cercuri care NU se ating, cu un pod controlat între ele.
    case "split-duties":
      return `
        <circle cx="104" cy="90" r="40" ${st} opacity="0.85" />
        <circle cx="200" cy="90" r="40" ${st} opacity="0.55" />
        <line x1="146" y1="90" x2="158" y2="90" ${st} opacity="0.9" />
        <line x1="150" y1="52" x2="150" y2="70" ${st} opacity="0.3" />
        <line x1="150" y1="110" x2="150" y2="128" ${st} opacity="0.3" />`;

    // Lanțul de decizie: noduri legate, primul plin — cererea pleacă de undeva anume.
    case "chain":
      return `
        <line x1="82" y1="90" x2="218" y2="90" ${st} opacity="0.45" />
        <circle cx="82" cy="90" r="13" fill="${ink}" opacity="0.85" />
        <circle cx="150" cy="90" r="13" ${st} opacity="0.7" />
        <circle cx="218" cy="90" r="13" ${st} opacity="0.45" />
        <path d="M206 60 L 218 48 L 230 60" ${st} opacity="0.5" />`;

    // ── risc ──────────────────────────────────────────────────────────────────
    // Traseul deviat: banii pleacă pe drumul care arată la fel, dar nu ajunge unde trebuie.
    case "swap":
      return `
        <path d="M66 74 H150 H234" ${st} opacity="0.7" />
        <path d="M150 74 C 178 74 182 128 234 128" ${st} opacity="0.9" stroke-dasharray="9 7" />
        <circle cx="150" cy="74" r="6" fill="${ink}" opacity="0.9" />
        <path d="M222 66 L 234 74 L 222 82" ${st} opacity="0.5" />
        <path d="M222 120 L 234 128 L 222 136" ${st} opacity="0.9" />`;

    // Potrivirea pe rânduri: trei perechi identice, una care nu se închide.
    case "match-rows":
      return `
        ${[54, 90, 126]
          .map(
            (y, i) => `
        <line x1="76" y1="${y}" x2="130" y2="${y}" ${st} opacity="${i === 2 ? 0.9 : 0.6}" />
        <line x1="170" y1="${y}" x2="224" y2="${y}" ${st} opacity="${i === 2 ? 0.9 : 0.6}" />
        ${
          i === 2
            ? `<path d="M138 82 L 162 98 M162 82 L 138 98" ${st} opacity="0.95" />`
            : `<line x1="138" y1="${y}" x2="162" y2="${y}" ${st} opacity="0.35" />`
        }`,
          )
          .join("")}`;

    // ── operațional ───────────────────────────────────────────────────────────
    // Registrul: grila bugetului, cu partea consumată plină și restul liber.
    case "ledger-grid":
      return `
        <rect x="76" y="46" width="148" height="88" rx="10" ${st} opacity="0.75" />
        <line x1="76" y1="74" x2="224" y2="74" ${st} opacity="0.4" />
        <line x1="124" y1="46" x2="124" y2="134" ${st} opacity="0.4" />
        <line x1="174" y1="46" x2="174" y2="134" ${st} opacity="0.4" />
        <rect x="76" y="74" width="48" height="60" rx="0" fill="${ink}" opacity="0.28" />
        <rect x="124" y="74" width="50" height="60" fill="${ink}" opacity="0.14" />`;

    // Reconcilierea: două șiruri care se împerechează, ultimul rămas fără pereche.
    case "pairing":
      return `
        ${[52, 82, 112]
          .map(
            (y) => `<line x1="80" y1="${y}" x2="118" y2="${y}" ${st} opacity="0.7" />
        <line x1="182" y1="${y}" x2="220" y2="${y}" ${st} opacity="0.7" />
        <path d="M118 ${y} C 142 ${y} 158 ${y} 182 ${y}" ${st} opacity="0.35" />`,
          )
          .join("")}
        <line x1="80" y1="142" x2="118" y2="142" ${st} opacity="0.9" />
        <circle cx="150" cy="142" r="5" ${st} opacity="0.9" />`;

    // Ciclul lunii: arcul aproape închis, cu ultimul segment — închiderea — marcat.
    case "month-arc":
      return `
        <path d="M150 42 A 48 48 0 1 1 108 66" ${st} opacity="0.5" />
        <path d="M108 66 A 48 48 0 0 1 150 42" ${st} opacity="0.95" />
        <circle cx="150" cy="42" r="6" fill="${ink}" opacity="0.9" />
        <line x1="150" y1="90" x2="150" y2="62" ${st} opacity="0.35" />
        <line x1="150" y1="90" x2="176" y2="104" ${st} opacity="0.35" />`;

    // ── decizie ───────────────────────────────────────────────────────────────
    // Coloane care cresc spre un total: costul care nu se vede până nu-l aduni.
    case "stack-total":
      return `
        <rect x="80" y="112" width="28" height="34" rx="6" fill="${ink}" opacity="0.85" />
        <rect x="116" y="94" width="28" height="52" rx="6" fill="${ink}" opacity="0.6" />
        <rect x="152" y="72" width="28" height="74" rx="6" fill="${ink}" opacity="0.4" />
        <rect x="188" y="46" width="28" height="100" rx="6" fill="${ink}" opacity="0.22" />
        <line x1="72" y1="38" x2="228" y2="38" ${st} opacity="0.5" stroke-dasharray="6 6" />`;

    // Două drumuri din același punct: rămâi cum ești, sau schimbi. Ambele costă.
    case "two-paths":
      return `
        <circle cx="82" cy="90" r="7" fill="${ink}" opacity="0.9" />
        <path d="M89 90 C 130 90 140 54 224 54" ${st} opacity="0.85" />
        <path d="M89 90 C 130 90 140 130 224 130" ${st} opacity="0.4" stroke-dasharray="8 8" />
        <path d="M212 46 L 224 54 L 212 62" ${st} opacity="0.85" />
        <path d="M212 122 L 224 130 L 212 138" ${st} opacity="0.4" />`;

    // ── conformitate ──────────────────────────────────────────────────────────
    // Verificarea: straturi care se restrâng până la o singură confirmare.
    case "seal":
      return `
        <circle cx="150" cy="90" r="52" ${st} opacity="0.3" />
        <circle cx="150" cy="90" r="36" ${st} opacity="0.55" />
        <path d="M132 90 L 145 103 L 172 76" ${st} opacity="0.95" />`;
  }
}

/**
 * Coverul complet: suprafața pastel + motivul, ca SVG autonom.
 *
 * `role="img"` cu `aria-label` — coverul CLASIFICĂ articolul (eticheta clusterului), deci nu e pur
 * decorativ; un cititor de ecran trebuie să audă ce e, nu să audă nimic.
 */
export function coverSvg(spec: CoverSpec, opts: { className?: string } = {}): string {
  return `<svg viewBox="0 0 300 180" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Ilustrație abstractă: ${escapeAttr(spec.label)}" class="${opts.className ?? "cover"}" focusable="false">
    <rect width="300" height="180" fill="var(${spec.bgToken}, ${spec.bgLiteral})" />
    <g stroke="var(${spec.inkToken}, ${spec.inkLiteral})">${motifMarkup(spec.motif, `var(${spec.inkToken}, ${spec.inkLiteral})`)}</g>
  </svg>`;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
