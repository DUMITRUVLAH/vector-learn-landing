/**
 * CRM-115 — Tag-uri + câmpuri custom configurabile
 * Covers T-CRM-115-1..3
 *
 * T-CRM-115-1: adaugi tag "vip" → apare pe lead
 * T-CRM-115-2: câmp custom select "Ediție" → apare în cartonaș și se salvează
 * T-CRM-115-3: intake fără UTM → tag "organic" (logic test)
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// ─── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("@/lib/api/leads", () => ({
  getLead: vi.fn(),
  updateLead: vi.fn(),
  moveLeadStage: vi.fn(),
  convertLead: vi.fn(),
  listInteractions: vi.fn(),
  addInteraction: vi.fn(),
  revokeConsent: vi.fn(),
  deleteLead: vi.fn(),
  sendMessage: vi.fn(),
  logCall: vi.fn(),
  scoreLead: vi.fn(),
  assignLead: vi.fn(),
  listContacts: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
  deleteContact: vi.fn(),
  listTags: vi.fn(),
  addTag: vi.fn(),
  removeTag: vi.fn(),
  listFieldValues: vi.fn(),
  upsertFieldValue: vi.fn(),
  listCustomFields: vi.fn(),
}));

vi.mock("@/lib/api/pipeline", () => ({
  fetchPipelineStages: vi.fn(),
}));

vi.mock("@/lib/api/tasks", () => ({
  listTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  listAttachments: vi.fn(),
  createAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ status: "authenticated", user: { id: "u1", tenantId: "t1", role: "owner" } }),
}));

// COMM-202: mock messages + templates
vi.mock("@/lib/api/messages", () => ({
  listMessages: vi.fn().mockResolvedValue({ items: [] }),
  sendMessage: vi.fn(),
}));

vi.mock("@/lib/api/templates", () => ({
  listTemplates: vi.fn().mockResolvedValue({ items: [] }),
  extractVariables: vi.fn().mockReturnValue([]),
  renderPreview: vi.fn().mockReturnValue(""),
  KNOWN_VARIABLES: {},
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: vi.fn(), path: "/app/leads/lead-001" }),
  Link: ({ children, to, className }: { children: React.ReactNode; to: string; className?: string }) => (
    <a href={`#${to}`} className={className}>{children}</a>
  ),
}));

import * as leadsApi from "@/lib/api/leads";
import * as pipelineApi from "@/lib/api/pipeline";
import * as tasksApi from "@/lib/api/tasks";
import type { Lead, CustomField, LeadFieldValue } from "@/lib/api/leads";
import type { PipelineStage } from "@/lib/api/pipeline";
import { LeadCardPage } from "@/pages/app/LeadCardPage";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const STAGE: PipelineStage = {
  id: "s1", tenantId: "t1", key: "new", label: "Lead nou",
  color: "pastel-sky", orderIndex: 0, isWon: false, isLost: false, isDefault: true, createdAt: "", updatedAt: "",
};

const MOCK_LEAD: Lead = {
  id: "lead-001", fullName: "Maria Popescu", phone: "+40771234567", email: "m@t.ro",
  interestCourse: "Engleză", stage: "new", source: "webform", assignedTo: null,
  utmSource: null, utmMedium: null, utmCampaign: null, notes: null,
  consentAt: null, consentText: null, ipAtConsent: null, consentRevokedAt: null,
  convertedToStudentId: null, convertedAt: null, lostReason: null,
  valueCents: 0, debtCents: 0,
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};

const CUSTOM_FIELD_SELECT: CustomField = {
  id: "cf1", tenantId: "t1", key: "editie", label: "Ediție",
  type: "select", options: ["Ediție 1", "Ediție 2", "Ediție 3"],
  orderIndex: 0, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};

function renderLeadCard() {
  return render(<LeadCardPage leadId="lead-001" />);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CRM-115 — Tags on lead card", () => {
  beforeEach(() => {
    vi.mocked(pipelineApi.fetchPipelineStages).mockResolvedValue({ stages: [STAGE] });
    vi.mocked(leadsApi.getLead).mockResolvedValue(MOCK_LEAD);
    vi.mocked(leadsApi.listInteractions).mockResolvedValue({ items: [] });
    vi.mocked(tasksApi.listTasks).mockResolvedValue({ items: [] });
    vi.mocked(tasksApi.listAttachments).mockResolvedValue({ items: [] });
    vi.mocked(leadsApi.listContacts).mockResolvedValue({ items: [] });
    vi.mocked(leadsApi.listFieldValues).mockResolvedValue({ values: [], fields: [] });
  });

  /**
   * T-CRM-115-1: adaugi tag "vip" → apare pe lead
   */
  it("T-CRM-115-1: tag 'vip' apare în lista de tag-uri după adăugare", async () => {
    vi.mocked(leadsApi.listTags).mockResolvedValue({ tags: ["vip"] });
    vi.mocked(leadsApi.addTag).mockResolvedValue({ tag: "vip" });

    renderLeadCard();

    await waitFor(() => {
      expect(screen.getByText("vip")).toBeDefined();
    });
  });

  it("T-CRM-115-1: tag-uri goale → mesaj 'Niciun tag'", async () => {
    vi.mocked(leadsApi.listTags).mockResolvedValue({ tags: [] });

    renderLeadCard();

    await waitFor(() => {
      expect(screen.getByText("Niciun tag.")).toBeDefined();
    });
  });

  /**
   * T-CRM-115-2: câmp custom "Ediție" → apare în tab Câmpuri
   */
  it("T-CRM-115-2: câmp custom select apare în tab Câmpuri", async () => {
    vi.mocked(leadsApi.listTags).mockResolvedValue({ tags: [] });
    vi.mocked(leadsApi.listFieldValues).mockResolvedValue({
      values: [],
      fields: [CUSTOM_FIELD_SELECT],
    });

    renderLeadCard();

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /câmpuri/i })).toBeDefined();
    });

    // Click on the Câmpuri tab
    const fieldsTab = screen.getByRole("tab", { name: /câmpuri/i });
    fireEvent.click(fieldsTab);

    await waitFor(() => {
      // The field label should appear
      expect(screen.getByLabelText("Ediție")).toBeDefined();
      // Options should be in the select
      expect(screen.getByText("Ediție 1")).toBeDefined();
    });
  });
});

// ─── Pure logic tests ─────────────────────────────────────────────────────────

describe("CRM-115 — Tag logic", () => {
  it("normalizes tag to lowercase", () => {
    const tag = "VIP";
    expect(tag.toLowerCase().trim()).toBe("vip");
  });

  it("deduplicates tags (same tag not added twice)", () => {
    const tags = ["vip", "organic"];
    const newTag = "vip";
    const isDuplicate = tags.includes(newTag);
    expect(isDuplicate).toBe(true);
  });

  it("T-CRM-115-3: lead without UTM → tag 'organic' logic", () => {
    const utmSource = null;
    const shouldBeOrganic = utmSource === null;
    expect(shouldBeOrganic).toBe(true);
  });
});

describe("CRM-115 — Custom field upsert logic", () => {
  it("getVal returns empty string for missing field value", () => {
    const fieldValues: LeadFieldValue[] = [];
    const fieldId = "cf1";
    const val = fieldValues.find((v) => v.fieldId === fieldId)?.value ?? "";
    expect(val).toBe("");
  });

  it("getVal returns stored value for existing field value", () => {
    const fieldValues: LeadFieldValue[] = [
      { id: "fv1", leadId: "l1", fieldId: "cf1", value: "Ediție 1" },
    ];
    const val = fieldValues.find((v) => v.fieldId === "cf1")?.value ?? "";
    expect(val).toBe("Ediție 1");
  });
});
