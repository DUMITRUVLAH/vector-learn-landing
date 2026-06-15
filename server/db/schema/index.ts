export * from "./tenants";
export * from "./users";
export * from "./branches"; // BRANCH-701: must be before tables that reference it
export * from "./students";
export * from "./teachers";
export * from "./courses";
export * from "./lessons";
export * from "./payments";
export * from "./leads";
export * from "./pipeline";
export * from "./tasks";
export * from "./templates";
export * from "./automations";
export * from "./families";
export * from "./analytics";
export * from "./messages";
export * from "./broadcasts";
export * from "./notifications";
export * from "./payroll";
export * from "./availability";
export * from "./auditLog";
export * from "./rooms";
export * from "./lessonSeries";
export * from "./saved-views";
export * from "./cadences";
export * from "./audit";
export * from "./contracts";
export * from "./feedback";
export * from "./invoices";
export * from "./subscriptions";
export * from "./cohorts";
export * from "./cohortParticipants";
export * from "./certificates";
export * from "./kinder";
export * from "./kinderDiary";
export * from "./kinderRatio";
export * from "./kinderMedical";
export * from "./kinderMessages";
export * from "./kinderIncidents";
export * from "./twoFactorSettings";
export * from "./passwordResetTokens";
export * from "./userInvitations";
export * from "./invitations";
export * from "./apiKeys";
export * from "./webhooks";
export * from "./mentions";
export * from "./inAppNotifications";
export * from "./directMessages";
export * from "./homework";
export * from "./lessonPackages";
export * from "./courseWaitlist";
export * from "./groupEnrollments";
export * from "./groups";
export * from "./guardians";
export * from "./parentLinks";
export * from "./pushSubscriptions";
export * from "./studentNotes";
export * from "./studentPortalTokens";
export * from "./forms";
export * from "./admissions";
export * from "./school";
export * from "./schoolAttendance";
export * from "./schoolGrades";
export * from "./schoolNews";
export * from "./timetable";
export * from "./tuition";
export * from "./consent";
export * from "./makeupCredits";
export * from "./notificationPreferences";
export * from "./paymentPlans";
export * from "./portalNotificationPrefs";
export * from "./progress";
export * from "./promoCodes";
export * from "./recovery";
export * from "./refunds";
export * from "./stripeSettings";
export * from "./enrollmentRequests";
export * from "./invoiceReminders";
export * from "./accountingMappings";
export * from "./aiAuditLog";
export * from "./aiFeatureFlags";
export * from "./churnScores";
export * from "./badges";
export * from "./gamification";
export * from "./sellerProfiles";
export * from "./companyClients";
export * from "./paymentAccounts";
export * from "./paymentAccountItems";
export * from "./par"; // PAR-001: Payment Action Request module
export { lessonHomework as homework } from "./homework";
export * from "./finAgreements";
export * from "./finAssets";
// NOTE: finBankLink and finCash BOTH declared `finBankTransactions` (+ FinBankTransaction /
// InsertFinBankTransaction types). With two blanket `export *`, the duplicate name is dropped
// from the merged namespace → `db.query.finBankTransactions` becomes undefined → 500 on every
// relational query (e.g. GET /api/fin/cash/transactions). The physical table created by migration
// 0134_fin_cash matches the finCash schema (tx_date / match_status), so finCash owns the
// relational-query name. finBankLink's route imports its own table directly from ./finBankLink, so
// here we re-export everything from finBankLink EXCEPT the colliding symbols. (§3.5.1 schema rule)
export {
  BANK_CODES_MD,
  IMPORT_FORMATS,
  finBankConnections,
  BANK_TRANSACTION_STATUSES,
  finBankConnectionsRelations,
} from "./finBankLink";
export type {
  BankCodeMD,
  ImportFormat,
  BankTransactionStatus,
  FinBankConnection,
  InsertFinBankConnection,
} from "./finBankLink";
export * from "./finBudgets";
export * from "./finBulk";
export * from "./finCalendar";
export * from "./finCaptures";
export * from "./finCash";
export * from "./finClientPortalDocuments";
export * from "./finClientPortalTokens";
export * from "./finCore";
export * from "./finDataSettings";
export * from "./finEinvoices";
export * from "./finExchangeRates";
export * from "./finExpenses";
export * from "./finInsight";
export * from "./finInventory";
export * from "./finInvoices";
export * from "./finLedger";
export * from "./finParties";
export * from "./finPayroll";
export * from "./finRegistry";
export * from "./finTax";
export * from "./finVatImports";
export * from "./itpark";
