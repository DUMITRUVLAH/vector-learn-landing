/**
 * Pâlnia desenată — contractul pe care prima versiune l-a încălcat tăcut.
 *
 * Bug-ul de la care pornesc testele: benzile foloseau clase inventate (`bg-pastel-sky`), pe care
 * Tailwind nu le generează. Ecranul arăta „corect" — doar că fără nicio culoare, cu etichete
 * tăiate („Or…", „Conclus…") peste dreptunghiuri albe. Niciun test nu putea să pice, fiindcă
 * nimic nu verifica DESENUL.
 *
 * Deci aici se verifică exact ce se vede:
 *  1. există un poligon per etapă deschisă, cu FILL pus (nu transparent, nu o clasă inexistentă);
 *  2. eticheta etapei apare ÎNTREAGĂ — „Conclusion", nu „Conclus…";
 *  3. pâlnia se îngustează: banda de jos a unei etape = banda de sus a celei următoare;
 *  4. sub desen rămâne aceeași pâlnie în cuvinte, pentru cititoarele de ecran.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FunnelChart } from "@/components/crm/FunnelChart";
import type { CrmFunnelStageRow } from "@/lib/api/crmFunnel";

function stage(over: Partial<CrmFunnelStageRow> & { key: string; label: string }): CrmFunnelStageRow {
  return {
    color: "sky",
    orderIndex: 0,
    isWon: false,
    isLost: false,
    currentCount: 0,
    currentValueCents: 0,
    weightedValueCents: 0,
    reached: 0,
    advanced: 0,
    dropped: 0,
    dropRatePct: 0,
    conversionPct: 0,
    ...over,
  };
}

const STAGES: CrmFunnelStageRow[] = [
  stage({ key: "suspect", label: "Suspect", reached: 40, advanced: 20, dropped: 20, dropRatePct: 50, currentCount: 20, currentValueCents: 500_00 }),
  stage({ key: "conclusion", label: "Conclusion", color: "peach", orderIndex: 1, reached: 20, advanced: 4, dropped: 16, dropRatePct: 80, currentCount: 16, currentValueCents: 300_00 }),
  stage({ key: "order", label: "Order", color: "mint", orderIndex: 2, isWon: true, reached: 4, advanced: 4, dropRatePct: 0, currentCount: 4, currentValueCents: 900_00 }),
  stage({ key: "lost", label: "Lost", color: "rose", orderIndex: 3, isLost: true, currentCount: 7, currentValueCents: 100_00, dropRatePct: 100 }),
];

describe("Pâlnia se vede ca pâlnie", () => {
  it("[blocant] fiecare etapă deschisă are un poligon CU CULOARE, nu o clasă inexistentă", () => {
    const { container } = render(<FunnelChart stages={STAGES} label="Pâlnia echipei" />);

    const paths = [...container.querySelectorAll("svg path")];
    expect(paths).toHaveLength(3); // cele trei etape deschise; „Lost" stă sub desen

    for (const path of paths) {
      const fill = path.getAttribute("fill") ?? "";
      // Culoarea vine din tokenii etapei. Un `fill` gol sau „none" = banda invizibilă de înainte.
      expect(fill).toMatch(/^hsl\(var\(--pastel-/);
    }
  });

  it("[blocant] eticheta apare ÎNTREAGĂ, nu tăiată cu „…”", () => {
    render(<FunnelChart stages={STAGES} label="Pâlnia echipei" />);
    // Textele SVG nu se trunchiază cu CSS, deci verificăm că numele complet e chiar în document.
    expect(screen.getAllByText("Conclusion").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Order").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Conclus…|Or…/)).not.toBeInTheDocument();
  });

  it("[blocant] pâlnia se îngustează: baza unei benzi = vârful celei următoare", () => {
    const { container } = render(<FunnelChart stages={STAGES} label="Pâlnia echipei" />);
    const paths = [...container.querySelectorAll("svg path")];

    /** Lățimile de sus și de jos ale unui trapez, din comanda `d`. */
    const widths = (d: string) => {
      const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
      // M x1 y1 L x2 y2 L x3 y3 L x4 y4
      return { top: Math.abs(nums[2] - nums[0]), bottom: Math.abs(nums[4] - nums[6]) };
    };

    const a = widths(paths[0].getAttribute("d")!);
    const b = widths(paths[1].getAttribute("d")!);
    expect(a.top).toBeGreaterThan(a.bottom); // 40 → 20: banda se strânge
    expect(a.bottom).toBeCloseTo(b.top, 5); // și continuă exact de unde s-a oprit
  });

  it("[blocant] aceeași pâlnie există și în cuvinte, pentru cititoarele de ecran", () => {
    render(<FunnelChart stages={STAGES} label="Pâlnia Anei" />);
    const list = screen.getByRole("list", { name: "Pâlnia Anei" });
    expect(list.textContent).toContain("Conclusion");
    expect(list.textContent).toContain("cădere 80%");
  });

  it("etapa „pierdut” nu intră în desen — e un rezultat, nu o verigă", () => {
    const { container } = render(<FunnelChart stages={STAGES} label="Pâlnia echipei" />);
    const svgText = [...container.querySelectorAll("svg text")].map((t) => t.textContent).join(" ");
    expect(svgText).not.toContain("Lost");
    // Dar se vede sub pâlnie, cu numărul ei.
    expect(screen.getByText("Lost")).toBeInTheDocument();
  });

  it("o pâlnie goală nu se rupe și nu împarte la zero", () => {
    const { container } = render(<FunnelChart stages={[]} label="Gol" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(container.querySelectorAll("svg path")).toHaveLength(0);
  });
});
