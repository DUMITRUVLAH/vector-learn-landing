import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppScreen } from "@/components/modules/mobile/AppScreen";
import { PhoneMockup, getNextScreen } from "@/components/modules/mobile/PhoneMockup";
import { MobilePage } from "@/pages/modules/MobilePage";
import { HashRouter } from "@/router/HashRouter";

describe("getNextScreen", () => {
  it("advances forward through the cycle", () => {
    expect(getNextScreen("dashboard", "next")).toBe("schedule");
    expect(getNextScreen("schedule", "next")).toBe("homework");
    expect(getNextScreen("homework", "next")).toBe("payments");
  });

  it("wraps around at the end going next", () => {
    expect(getNextScreen("payments", "next")).toBe("dashboard");
  });

  it("wraps around at the start going prev", () => {
    expect(getNextScreen("dashboard", "prev")).toBe("payments");
  });

  it("moves backward correctly", () => {
    expect(getNextScreen("schedule", "prev")).toBe("dashboard");
  });
});

describe("AppScreen", () => {
  it("renders dashboard with greeting", () => {
    render(<AppScreen screen="dashboard" />);
    expect(screen.getByTestId("screen-dashboard")).toBeInTheDocument();
    expect(screen.getByText(/Salut, Maria/i)).toBeInTheDocument();
  });

  it("renders schedule with week label", () => {
    render(<AppScreen screen="schedule" />);
    expect(screen.getByTestId("screen-schedule")).toBeInTheDocument();
  });

  it("renders homework with active assignments", () => {
    render(<AppScreen screen="homework" />);
    expect(screen.getByText(/Temele tale/i)).toBeInTheDocument();
  });

  it("renders payments with active subscription", () => {
    render(<AppScreen screen="payments" />);
    expect(screen.getByText(/Abonament activ/i)).toBeInTheDocument();
  });
});

describe("PhoneMockup", () => {
  it("renders iOS by default", () => {
    render(<PhoneMockup />);
    expect(screen.getByTestId("phone-ios")).toBeInTheDocument();
  });

  it("switches to Android when toggle clicked", () => {
    render(<PhoneMockup />);
    const androidTab = screen.getByRole("tab", { name: /android/i });
    fireEvent.click(androidTab);
    expect(screen.getByTestId("phone-android")).toBeInTheDocument();
  });

  it("navigates to next screen via right button", () => {
    render(<PhoneMockup />);
    expect(screen.getByTestId("screen-dashboard")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Ecranul următor/i));
    expect(screen.getByTestId("screen-schedule")).toBeInTheDocument();
  });

  it("navigates to previous screen via left button", () => {
    render(<PhoneMockup />);
    fireEvent.click(screen.getByLabelText(/Ecranul anterior/i));
    expect(screen.getByTestId("screen-payments")).toBeInTheDocument();
  });

  it("navigates by clicking indicator dots", () => {
    render(<PhoneMockup />);
    const tabs = screen.getAllByRole("tab", { name: /Teme/i });
    fireEvent.click(tabs[0]);
    expect(screen.getByTestId("screen-homework")).toBeInTheDocument();
  });
});

describe("MobilePage", () => {
  it("renders hero", () => {
    render(
      <HashRouter>
        <MobilePage />
      </HashRouter>
    );
    expect(screen.getAllByText(/Aplicație mobilă/i).length).toBeGreaterThan(0);
  });

  it("renders the phone mockup", () => {
    render(
      <HashRouter>
        <MobilePage />
      </HashRouter>
    );
    expect(screen.getByTestId("phone-ios")).toBeInTheDocument();
  });

  it("renders 4 capability sections", () => {
    render(
      <HashRouter>
        <MobilePage />
      </HashRouter>
    );
    expect(screen.getByText(/Gamification care chiar funcționează/i)).toBeInTheDocument();
    expect(screen.getByText(/Teme și quiz-uri interactive/i)).toBeInTheDocument();
    expect(screen.getByText(/Chat 1:1 cu profesorul/i)).toBeInTheDocument();
    expect(screen.getAllByText(/White-label complet/i).length).toBeGreaterThan(0);
  });

  it("renders 4 FAQ items", () => {
    render(
      <HashRouter>
        <MobilePage />
      </HashRouter>
    );
    expect(screen.getByText(/Cum publicăm aplicația în App Store/i)).toBeInTheDocument();
  });
});
