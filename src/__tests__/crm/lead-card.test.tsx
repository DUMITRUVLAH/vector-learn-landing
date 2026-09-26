/**
 * CRM-U06 — cartonașul din pipeline, după observațiile ownerului (2026-09-26).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CrmLead, CrmStage } from "@/lib/api/crm";
import { LeadCard } from "@/components/crm/LeadCard";
import { DEFAULT_CARD_PREFS, cardLines, loadCardPrefs, saveCardPrefs } from "@/lib/crm/cardPrefs";

const STAGES: CrmStage[] = [
  { id: "s1", key: "new", label: "Lead nou", color: "sky", orderIndex: 0, isWon: false, isLost: false, isDefault: true, probabilityPct: 10 },
];

function lead(over: Partial<CrmLead> = {}): CrmLead {
  return {
    id: "l1",
    fullName: "Tatiana Frunze",
    dealName: null,
    phone: "+373 69 000 111",
    email: "t@medlife.md",
    company: "Medlife Clinic SRL",
    interestCourse: "Training AI in-house",
    source: "webform",
    stage: "new",
    valueCents: 29_000_00,
    assignedTo: "u1",
    lostReason: null,
    createdAt: "2026-09-20T10:00:00.000Z",
    updatedAt: "2026-09-20T10:00:00.000Z",
    nextTask: { title: "Sună clientul", dueAt: "2026-09-01T09:00:00.000Z", dueHasTime: true },
    ...over,
  } as CrmLead;
}

function renderCard(l: CrmLead, prefs = DEFAULT_CARD_PREFS) {
  return render(
    <LeadCard
      lead={l}
      prefs={prefs}
      stages={STAGES}
      isDragging={false}
      ownerName="Irina Oriol"
      onDragStart={vi.fn()}
      onDragEnd={vi.fn()}
      onChangeStage={vi.fn()}
      onOpen={vi.fn()}
    />
  );
}

// Node 26 are propriul `localStorage` (gol fără --localstorage-file) care îl umbrește pe cel din
// jsdom; un depozit în memorie e suficient pentru ce testăm aici.
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
});

describe("CRM-U06 — cartonașul", () => {
  it("[blocant] restanța: DOAR clopoțelul e roșu, textul taskului nu", () => {
    renderCard(lead());
    const bell = screen.getByLabelText("Task restant");
    expect(bell.getAttribute("class")).toMatch(/text-destructive/);
    const text = screen.getByText("Sună clientul");
    expect(text.closest("p")?.getAttribute("class")).not.toMatch(/destructive/);
    // Fără dunga roșie din stânga.
    expect(document.querySelector(".bg-destructive")).toBeNull();
  });

  it("[blocant] fără iconițele de telefon și email repetate pe fiecare cartonaș", () => {
    renderCard(lead());
    expect(screen.queryByLabelText("Are telefon")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Are email")).not.toBeInTheDocument();
  });

  it("[blocant] selectul de etapă există doar pentru telefon (ascuns pe desktop), nu apare la hover", () => {
    renderCard(lead());
    const select = screen.getByLabelText(/Mutare stadiu/);
    const wrapper = select.closest("div.lg\\:hidden");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.getAttribute("class")).not.toMatch(/group-hover/);
  });

  it("[blocant] titlul ales de om: firma, persoana sau ce se vinde", () => {
    renderCard(lead(), { ...DEFAULT_CARD_PREFS, title: "person" });
    expect(screen.getByText("Tatiana Frunze")).toBeInTheDocument();
    expect(screen.getByText("Medlife Clinic SRL")).toBeInTheDocument();
  });

  it("[normal] responsabilul apare ca inițiale; câmpurile debifate dispar", () => {
    const { unmount } = renderCard(lead());
    expect(screen.getByLabelText("Responsabil: Irina Oriol")).toHaveTextContent("IO");
    unmount();
    renderCard(lead(), { ...DEFAULT_CARD_PREFS, value: false, nextTask: false, owner: false });
    expect(screen.queryByText(/29\.?000/)).not.toBeInTheDocument();
    expect(screen.queryByText("Sună clientul")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Responsabil:/)).not.toBeInTheDocument();
  });
});

describe("preferințele cartonașului", () => {
  it("[blocant] se păstrează în browser și revin la deschiderea următoare", () => {
    saveCardPrefs({ ...DEFAULT_CARD_PREFS, title: "company", phone: true });
    expect(loadCardPrefs()).toMatchObject({ title: "company", phone: true, value: true });
  });

  it("stocare coruptă → implicitul, nu o eroare", () => {
    window.localStorage.setItem("crm_card_prefs_v1", "{nu e json");
    expect(loadCardPrefs()).toEqual(DEFAULT_CARD_PREFS);
  });

  it("titlul „firma” cade pe persoană când leadul n-are firmă", () => {
    expect(cardLines({ fullName: "Ion", company: null, dealName: null, interestCourse: "Curs AI" }, "company")).toEqual({
      title: "Ion",
      subtitle: "Curs AI",
    });
  });

  it("[blocant] cu titlul „firma”, rândul de dedesubt nu repetă firma din numele afacerii", () => {
    expect(
      cardLines({ fullName: "Ana", company: "Retail Partners SRL", dealName: "Retail Partners SRL — Implementare AI", interestCourse: null }, "company")
    ).toEqual({ title: "Retail Partners SRL", subtitle: "Implementare AI" });
  });
});
