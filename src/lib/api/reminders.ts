/**
 * PAY-005: Reminder API client.
 */
import { api } from "../api";

export interface InvoiceReminder {
  id: string;
  invoiceId: string;
  reminderDay: number;
  channel: string;
  status: string;
  body: string | null;
  sentAt: string;
}

export interface ReminderResult {
  ok: boolean;
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export interface OverdueSummary {
  count: number;
  totalAmount: number;
  byDaysBucket: Record<number, number>;
}

export function runReminders(): Promise<ReminderResult> {
  return api<ReminderResult>("/api/admin/run-reminders", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function getInvoiceReminders(
  invoiceId: string
): Promise<{ items: InvoiceReminder[] }> {
  return api<{ items: InvoiceReminder[] }>(`/api/invoices/${invoiceId}/reminders`);
}

export function getOverdueSummary(): Promise<OverdueSummary> {
  return api<OverdueSummary>("/api/payments/overdue-summary");
}
