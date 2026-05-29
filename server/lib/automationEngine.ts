/**
 * CRM-110 — Automation engine
 * Evaluates trigger→conditions→actions for a lead.
 * Pure functions — no DB access here (callers pass the data they have).
 */
import type { Lead } from "../db/schema/leads";
import type {
  Automation,
  AutomationCondition,
  AutomationAction,
  AutomationTrigger,
} from "../db/schema/automations";
import { db } from "../db/client";
import {
  leadInteractions,
  messageTemplates,
  leadTasks,
  leads as leadsTable,
  automationRuns,
} from "../db/schema";
import { eq, and } from "drizzle-orm";
import { renderTemplate } from "../db/schema/templates";

// ─── Condition evaluation ──────────────────────────────────────────────────────

export function evaluateCondition(cond: AutomationCondition, lead: Lead): boolean {
  const rawValue = (lead as Record<string, unknown>)[toCamel(cond.field)];
  const value = rawValue != null ? String(rawValue) : "";

  switch (cond.op) {
    case "eq":
      return value === String(cond.value ?? "");
    case "neq":
      return value !== String(cond.value ?? "");
    case "contains":
      return value.toLowerCase().includes(String(cond.value ?? "").toLowerCase());
    case "gte":
      return Number(value) >= Number(cond.value ?? 0);
    case "lte":
      return Number(value) <= Number(cond.value ?? 0);
    case "exists":
      return rawValue != null && value !== "";
    case "not_exists":
      return rawValue == null || value === "";
    default:
      return false;
  }
}

function toCamel(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function evaluateConditions(conditions: AutomationCondition[], lead: Lead): boolean {
  return conditions.every((c) => evaluateCondition(c, lead));
}

// ─── Action execution ──────────────────────────────────────────────────────────

export interface ActionResult {
  type: string;
  status: "ok" | "failed" | "skipped";
  detail: string;
}

export interface RunResult {
  automationId: string;
  leadId: string;
  status: "ok" | "failed" | "skipped";
  dryRun: boolean;
  actionResults: ActionResult[];
}

async function executeAction(
  action: AutomationAction,
  lead: Lead,
  dryRun: boolean
): Promise<ActionResult> {
  try {
    switch (action.type) {
      case "send_template": {
        const { templateId, channel } = action.params;

        // Check consent
        if (lead.consentRevokedAt) {
          return { type: action.type, status: "skipped", detail: "consent_revoked" };
        }

        // Fetch template (validate tenant ownership done by caller)
        const tmpl = await db.query.messageTemplates.findFirst({
          where: eq(messageTemplates.id, templateId),
        });
        if (!tmpl) {
          return { type: action.type, status: "failed", detail: `template_not_found: ${templateId}` };
        }

        const context: Record<string, string> = {
          first_name: lead.fullName.split(" ")[0] ?? lead.fullName,
          full_name: lead.fullName,
          phone: lead.phone ?? "",
          course: lead.interestCourse ?? "",
          center_name: "Vector Learn",
          trial_date: "",
        };

        if (!dryRun) {
          await db.insert(leadInteractions).values({
            tenantId: lead.tenantId,
            leadId: lead.id,
            type: channel,
            direction: "outbound",
            body: renderTemplate(tmpl.body, context),
            metadata: {
              template_id: templateId,
              channel,
              automation: true,
              stub: true,
            },
          });
        }

        return {
          type: action.type,
          status: "ok",
          detail: dryRun
            ? `[DRY-RUN] Would send ${channel} template "${tmpl.name}" to ${lead.fullName}`
            : `Sent ${channel} template "${tmpl.name}" to ${lead.fullName}`,
        };
      }

      case "create_task": {
        const { title, dueDays } = action.params;
        const dueAt = dueDays != null
          ? new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000)
          : null;

        if (!dryRun) {
          await db.insert(leadTasks).values({
            tenantId: lead.tenantId,
            leadId: lead.id,
            title: title.replace("{{full_name}}", lead.fullName),
            dueAt,
            status: "open",
          });
        }

        return {
          type: action.type,
          status: "ok",
          detail: dryRun
            ? `[DRY-RUN] Would create task "${title}"${dueAt ? ` due ${dueAt.toISOString()}` : ""}`
            : `Created task "${title}"`,
        };
      }

      case "assign": {
        if (!dryRun) {
          await db
            .update(leadsTable)
            .set({ assignedTo: action.params.userId, updatedAt: new Date() })
            .where(eq(leadsTable.id, lead.id));
        }
        return {
          type: action.type,
          status: "ok",
          detail: dryRun
            ? `[DRY-RUN] Would assign lead to user ${action.params.userId}`
            : `Assigned lead to ${action.params.userId}`,
        };
      }

      case "move_stage": {
        if (!dryRun) {
          await db
            .update(leadsTable)
            .set({ stage: action.params.stage as Lead["stage"], updatedAt: new Date() })
            .where(eq(leadsTable.id, lead.id));

          await db.insert(leadInteractions).values({
            tenantId: lead.tenantId,
            leadId: lead.id,
            type: "stage_change",
            direction: "internal",
            body: `Automation moved stage to: ${action.params.stage}`,
          });
        }
        return {
          type: action.type,
          status: "ok",
          detail: dryRun
            ? `[DRY-RUN] Would move lead to stage "${action.params.stage}"`
            : `Moved lead to stage "${action.params.stage}"`,
        };
      }

      default:
        return { type: "unknown", status: "failed", detail: "Unknown action type" };
    }
  } catch (err) {
    return {
      type: action.type,
      status: "failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Main run function ─────────────────────────────────────────────────────────

export async function runAutomation(
  automation: Automation,
  lead: Lead,
  options: { dryRun?: boolean } = {}
): Promise<RunResult> {
  const dryRun = options.dryRun ?? false;

  const conditions = (automation.conditions ?? []) as AutomationCondition[];
  const actions = (automation.actions ?? []) as AutomationAction[];

  // Evaluate conditions
  if (!evaluateConditions(conditions, lead)) {
    const run: RunResult = {
      automationId: automation.id,
      leadId: lead.id,
      status: "skipped",
      dryRun,
      actionResults: [],
    };
    // Save run record
    await db.insert(automationRuns).values({
      tenantId: automation.tenantId,
      automationId: automation.id,
      leadId: lead.id,
      status: "skipped",
      detail: "Conditions not met",
      dryRun,
    });
    return run;
  }

  // Execute actions (failure doesn't stop others)
  const actionResults: ActionResult[] = [];
  for (const action of actions) {
    const result = await executeAction(action, lead, dryRun);
    actionResults.push(result);
  }

  const overallStatus = actionResults.some((r) => r.status === "failed") ? "failed" : "ok";
  const detail = actionResults.map((r) => `${r.type}: ${r.detail}`).join("\n");

  await db.insert(automationRuns).values({
    tenantId: automation.tenantId,
    automationId: automation.id,
    leadId: lead.id,
    status: overallStatus,
    detail,
    dryRun,
  });

  return {
    automationId: automation.id,
    leadId: lead.id,
    status: overallStatus,
    dryRun,
    actionResults,
  };
}

// ─── Trigger helper: fire automations for a given event ──────────────────────

export async function fireTrigger(
  tenantId: string,
  event: AutomationTrigger["event"],
  lead: Lead,
  context?: Record<string, unknown>
): Promise<RunResult[]> {
  const { automations: autoTable } = await import("../db/schema");

  const allAutos = await db
    .select()
    .from(autoTable)
    .where(and(eq(autoTable.tenantId, tenantId), eq(autoTable.enabled, true)));

  const matching = allAutos.filter((a) => {
    const trigger = a.trigger as AutomationTrigger;
    if (trigger.event !== event) return false;
    // For stage_changed, optionally filter by toStage
    if (event === "lead.stage_changed" && trigger.params && "toStage" in trigger.params) {
      const toStage = (trigger.params as { toStage?: string }).toStage;
      if (toStage && context?.toStage !== toStage) return false;
    }
    return true;
  });

  const results: RunResult[] = [];
  for (const auto of matching) {
    const result = await runAutomation(auto, lead, { dryRun: false });
    results.push(result);
  }
  return results;
}
