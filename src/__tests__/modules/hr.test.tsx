import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  PermissionMatrix,
  countPermissions,
  DEFAULT_MATRIX,
} from "@/components/modules/hr/PermissionMatrix";
import {
  CommissionCalculator,
  calculateCommission,
} from "@/components/modules/hr/CommissionCalculator";
import { HRPage } from "@/pages/modules/HRPage";
import { HashRouter } from "@/router/HashRouter";

describe("countPermissions", () => {
  it("returns 6 for admin (all true)", () => {
    expect(countPermissions(DEFAULT_MATRIX, "admin")).toBe(6);
  });

  it("returns 1 for teacher (only view_students)", () => {
    expect(countPermissions(DEFAULT_MATRIX, "teacher")).toBe(1);
  });

  it("returns 4 for manager", () => {
    expect(countPermissions(DEFAULT_MATRIX, "manager")).toBe(4);
  });
});

describe("PermissionMatrix", () => {
  it("renders 6 actions and 4 roles", () => {
    render(<PermissionMatrix />);
    expect(screen.getByText(/Vede lista elevilor/i)).toBeInTheDocument();
    expect(screen.getByText(/Administrator/i)).toBeInTheDocument();
    expect(screen.getByText(/Recepționer/i)).toBeInTheDocument();
  });

  it("toggles a permission on click", () => {
    render(<PermissionMatrix />);
    const btn = screen.getByTestId("perm-teacher-view_payments");
    expect(btn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("updates total count when toggled", () => {
    render(<PermissionMatrix />);
    const total = screen.getByTestId("perm-total-teacher");
    expect(total.textContent).toBe("1/6");
    fireEvent.click(screen.getByTestId("perm-teacher-view_payments"));
    expect(total.textContent).toBe("2/6");
  });
});

describe("calculateCommission", () => {
  it("computes gross = lessons * price", () => {
    const r = calculateCommission({ lessonsPerMonth: 100, pricePerLesson: 30, commissionRate: 50, attendanceBonus: 0 });
    expect(r.grossRevenue).toBe(3000);
  });

  it("computes commission base = gross * rate%", () => {
    const r = calculateCommission({ lessonsPerMonth: 100, pricePerLesson: 30, commissionRate: 50, attendanceBonus: 0 });
    expect(r.commissionBase).toBe(1500);
  });

  it("adds bonus to total", () => {
    const r = calculateCommission({ lessonsPerMonth: 100, pricePerLesson: 30, commissionRate: 50, attendanceBonus: 200 });
    expect(r.totalPay).toBe(1700);
  });

  it("clamps negative inputs", () => {
    const r = calculateCommission({ lessonsPerMonth: -10, pricePerLesson: 30, commissionRate: 50, attendanceBonus: 0 });
    expect(r.grossRevenue).toBe(0);
  });
});

describe("CommissionCalculator", () => {
  it("renders the 4 result cards", () => {
    render(<CommissionCalculator />);
    expect(screen.getByTestId("comm-total")).toBeInTheDocument();
    expect(screen.getByTestId("comm-gross")).toBeInTheDocument();
    expect(screen.getByTestId("comm-base")).toBeInTheDocument();
    expect(screen.getByTestId("comm-bonus")).toBeInTheDocument();
  });

  it("recalculates when lessons slider changes", () => {
    render(<CommissionCalculator />);
    const slider = screen.getByLabelText(/Lecții pe lună/i) as HTMLInputElement;
    const before = screen.getByTestId("comm-total").textContent;
    fireEvent.change(slider, { target: { value: "150" } });
    expect(screen.getByTestId("comm-total").textContent).not.toBe(before);
  });
});

describe("HRPage", () => {
  it("renders hero", () => {
    render(<HashRouter><HRPage /></HashRouter>);
    expect(screen.getByText(/Modulul HR/i)).toBeInTheDocument();
  });

  it("renders permission matrix", () => {
    render(<HashRouter><HRPage /></HashRouter>);
    expect(screen.getByText(/Matrice permisiuni/i)).toBeInTheDocument();
  });

  it("renders commission calculator", () => {
    render(<HashRouter><HRPage /></HashRouter>);
    expect(screen.getByText(/Calculator salariu profesor/i)).toBeInTheDocument();
  });

  it("renders 4 sections", () => {
    render(<HashRouter><HRPage /></HashRouter>);
    expect(screen.getAllByText(/Roluri custom/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Rating profesori/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Anunțuri interne/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Comisioane flexibile/i).length).toBeGreaterThan(0);
  });

  it("renders 4 FAQ items", () => {
    render(<HashRouter><HRPage /></HashRouter>);
    expect(screen.getByText(/Pot crea roluri complet noi/i)).toBeInTheDocument();
  });
});
