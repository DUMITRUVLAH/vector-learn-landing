# ApprovalMax — structura meniului "Product" (burger menu)

Extras din HTML-ul server-rendered al mega-meniului (`https://approvalmax.com/`, 2026-08-29).
Doar ramura **Product** — celelalte (Solutions, Resources, Pricing) nu au fost scanate, la cererea owner-ului.

```
Product
├── Approvals
│   ├── Multi-level approvals ─────── /features/approval-workflows
│   └── Approval channels ─────────── /features/collaboration
│
├── Workflows
│   ├── Purchase orders ───────────── /ap-automation/purchase-order-software
│   ├── Vendors ────────────────────── /features/approval-workflows/vendor-approvals
│   ├── Invoices ───────────────────── /ap-automation/invoice-approval-software
│   ├── Credit notes ───────────────── /features/approval-workflows/credit-note-approvals
│   ├── Standalone workflows ───────── /features/approval-workflows/standalone-workflows
│   └── Expenses ───────────────────── /ap-automation/expense-approval-software
│
├── Financial Controls
│   ├── Bill-to-PO matching ────────── /ap-automation/po-matching
│   ├── Audit readiness ────────────── /features/audit-and-fraud-control
│   ├── Segregation of duties ──────── /features/approval-workflows/segregation-of-duties
│   ├── Platform security ──────────── /features/security
│   └── Budget controls ────────────── /ap-automation/budget-checking-software
│
├── Payments
│   └── ApprovalMax Pay ────────────── /features/approvalmax-pay
│
├── OCR
│   └── ApprovalMax Capture ────────── /features/approvalmax-capture
│
└── Integrations
    ├── Xero ────────────────────────── /integrations/xero
    ├── QuickBooks Online ──────────── /integrations/quickbooks-online
    ├── Netsuite ─────────────────────── /integrations/netsuite
    └── All integrations ─────────────── /integrations
```

19 pagini unice, toate scrapuite (text integral + screenshot full-page). Vezi `REPORT.md` pentru
sinteza feature-per-feature și `index.json` pentru metadate mașină-citibile.
